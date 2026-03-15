import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";
import { insertFeedSchema, insertCategorySchema } from "../shared/schema";
import { z } from "zod";
import { scrapeFeed, generateSlug, uniqueSlug, cleanHtml, quickExtract } from "./scraper";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; RSSAggregator/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [["media:thumbnail", "mediaThumbnail"], ["media:content", "mediaContent"]],
  },
});

// Cache for feed items: feedId -> { items, fetchedAt }
const feedCache: Map<number, { items: any[]; fetchedAt: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch raw XML and sanitize common malformed patterns before parsing.
 * Fixes bare & characters (e.g. "foo & bar" → "foo &amp; bar") that
 * break strict XML parsers like rss-parser.
 */
async function fetchAndParse(url: string) {
  // First try the normal way — fast path for well-formed feeds
  try {
    return await parser.parseURL(url);
  } catch (e: any) {
    // Only attempt XML repair for parse errors, not network errors
    const msg = e?.message || "";
    const isXmlError = msg.includes("Invalid character") || msg.includes("not well-formed") ||
      msg.includes("mismatched tag") || msg.includes("entity") || msg.includes("undefined entity");
    if (!isXmlError) throw e;
  }

  // Fetch raw XML and clean it up
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RSSAggregator/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let xml = await resp.text();

  // Fix bare & not followed by a valid entity reference or #
  xml = xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");

  return await parser.parseString(xml);
}

async function fetchFeedItems(url: string): Promise<any[]> {
  try {
    const feed = await fetchAndParse(url);
    return (feed.items || []).map((item: any) => ({
      title: item.title || "Untitled",
      link: item.link || item.guid || "",
      pubDate: item.pubDate || item.isoDate || "",
      summary: stripHtml(item.contentSnippet || item.summary || item.content || ""),
      author: item.creator || item.author || "",
      thumbnail:
        item.mediaThumbnail?.$?.url ||
        item.mediaContent?.$?.url ||
        extractFirstImage(item.content || item["content:encoded"] || "") ||
        "",
    }));
  } catch (e) {
    console.error("RSS fetch error for", url, e);
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function extractFirstImage(html: string): string {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

// ── Auth middleware ────────────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Extend Express Request to carry userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.userId = data.user.id;
  req.userEmail = data.user.email;
  next();
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Seed endpoint (called once after first login) ──────────────────────────
  app.post("/api/auth/seed", requireAuth, async (req, res) => {
    try {
      await storage.seedDefaultData(req.userId!);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Feeds CRUD ─────────────────────────────────────────────────────────────
  app.get("/api/feeds", requireAuth, async (req, res) => {
    const feeds = await storage.getFeeds(req.userId!);
    res.json(feeds);
  });

  app.post("/api/feeds", requireAuth, async (req, res) => {
    const parsed = insertFeedSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const feed = await storage.createFeed(parsed.data, req.userId!);
    res.json(feed);
  });

  // Preview must come before /:id routes so Express doesn't treat "preview" as an id
  app.post("/api/feeds/preview", requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    try {
      const feed = await fetchAndParse(url);
      res.json({
        title: feed.title || "",
        description: feed.description || "",
        items: (feed.items || []).slice(0, 3).map((item: any) => ({
          title: item.title || "",
          pubDate: item.pubDate || "",
        })),
      });
    } catch (e: any) {
      res.status(400).json({ error: "Could not parse RSS feed: " + e.message });
    }
  });

  // Reorder must also come before /:id routes
  app.post("/api/feeds/reorder", requireAuth, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: "ids required" });
    await storage.reorderFeeds(ids, req.userId!);
    res.json({ success: true });
  });

  app.patch("/api/feeds/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const feed = await storage.updateFeed(id, req.body, req.userId!);
    if (!feed) return res.status(404).json({ error: "Not found" });
    res.json(feed);
  });

  app.delete("/api/feeds/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    feedCache.delete(id);
    const ok = await storage.deleteFeed(id, req.userId!);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  });

  // ── Feed Items (with caching) ───────────────────────────────────────────────
  app.get("/api/feeds/:id/items", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const feed = await storage.getFeed(id, req.userId!);
    if (!feed) return res.status(404).json({ error: "Not found" });

    const cached = feedCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return res.json({ items: cached.items.slice(0, feed.maxItems), cached: true });
    }

    const items = await fetchFeedItems(feed.url);
    feedCache.set(id, { items, fetchedAt: Date.now() });
    res.json({ items: items.slice(0, feed.maxItems), cached: false });
  });

  // Refresh a feed's cache
  app.post("/api/feeds/:id/refresh", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const feed = await storage.getFeed(id, req.userId!);
    if (!feed) return res.status(404).json({ error: "Not found" });
    feedCache.delete(id);
    const items = await fetchFeedItems(feed.url);
    feedCache.set(id, { items, fetchedAt: Date.now() });
    res.json({ items: items.slice(0, feed.maxItems) });
  });

  // ── Categories ─────────────────────────────────────────────────────────────
  app.get("/api/categories", requireAuth, async (_req, res) => {
    const cats = await storage.getCategories(_req.userId!);
    res.json(cats);
  });

  app.post("/api/categories", requireAuth, async (req, res) => {
    const parsed = insertCategorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const cat = await storage.createCategory(parsed.data, req.userId!);
    res.json(cat);
  });

  app.patch("/api/categories/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    const cat = await storage.renameCategory(id, name.trim(), req.userId!);
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json(cat);
  });

  app.delete("/api/categories/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { replaceName } = req.body;
    const ok = await storage.deleteCategory(id, req.userId!, replaceName);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  });

  // ── Feed Creator ────────────────────────────────────────────────────────────

  // Quick client-side preview (no AI, instant)
  app.post("/api/scrape/preview", requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Feedboard/1.0)", "Accept": "text/html,*/*" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const cleaned = cleanHtml(html, url);
      const items = quickExtract(html, url);
      // Extract title from <title> tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const siteTitle = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
      res.json({ siteTitle, items: items.slice(0, 10) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Full AI scrape — creates/updates scraped_feed record and runs Claude extraction
  app.post("/api/scrape", requireAuth, async (req, res) => {
    const { url, feedId } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });

    let activeFeedId = feedId;

    // If no feedId provided, create a new scraped_feed record
    if (!activeFeedId) {
      const baseSlug = generateSlug(url);
      const slug = await uniqueSlug(baseSlug);
      const { data, error } = await supabaseAdmin
        .from("scraped_feeds")
        .insert({
          user_id: req.userId,
          source_url: url,
          feed_slug: slug,
          site_title: new URL(url).hostname,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      activeFeedId = data.id;
    }

    const result = await scrapeFeed(url, activeFeedId, req.userId!);

    // Return feed info + extracted posts
    const { data: feedData } = await supabaseAdmin
      .from("scraped_feeds")
      .select("*")
      .eq("id", activeFeedId)
      .single();

    const { data: posts } = await supabaseAdmin
      .from("scraped_posts")
      .select("*")
      .eq("feed_id", activeFeedId)
      .order("pub_date", { ascending: false })
      .limit(20);

    res.json({ ...result, feed: feedData, posts: posts || [] });
  });

  // List user's scraped feeds
  app.get("/api/scrape/feeds", requireAuth, async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("scraped_feeds")
      .select("*, scraped_posts(count)")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // Delete a scraped feed
  app.delete("/api/scrape/feeds/:id", requireAuth, async (req, res) => {
    const { error } = await supabaseAdmin
      .from("scraped_feeds")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ── RSS XML endpoint (public — no auth required) ────────────────────────────
  app.get("/api/feed/:slug", async (req, res) => {
    const { slug } = req.params;

    const { data: feed } = await supabaseAdmin
      .from("scraped_feeds")
      .select("*")
      .eq("feed_slug", slug)
      .single();

    if (!feed) return res.status(404).send("Feed not found");

    const { data: posts } = await supabaseAdmin
      .from("scraped_posts")
      .select("*")
      .eq("feed_id", feed.id)
      .order("pub_date", { ascending: false })
      .limit(50);

    const escXml = (s: string) =>
      (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const toRFC2822 = (d: string | null) => {
      if (!d) return new Date().toUTCString();
      try { return new Date(d).toUTCString(); } catch { return new Date().toUTCString(); }
    };

    const items = (posts || []).map((p) => `
    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(p.link)}</link>
      <description>${escXml(p.description || "")}</description>
      <pubDate>${toRFC2822(p.pub_date)}</pubDate>
      <guid isPermaLink="true">${escXml(p.guid || p.link)}</guid>
    </item>`).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(feed.site_title || feed.feed_slug)}</title>
    <link>${escXml(feed.source_url)}</link>
    <description>${escXml(feed.site_description || "")}</description>
    <lastBuildDate>${toRFC2822(feed.last_scraped_at)}</lastBuildDate>
    <generator>Feedboard Feed Creator</generator>${items}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    res.send(xml);
  });
}
