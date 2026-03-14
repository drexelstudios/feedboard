import { execSync } from "child_process";
import { Feed, InsertFeed, Category, InsertCategory } from "@shared/schema";

// ── Supabase helper via external-tool CLI ─────────────────────────────────────
function supabase(tool: string, args: Record<string, unknown>): any {
  const payload = JSON.stringify({ source_id: "supabase__pipedream", tool_name: tool, arguments: args });
  try {
    const out = execSync(`external-tool call '${payload.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 15000,
    });
    return JSON.parse(out);
  } catch (e: any) {
    console.error("Supabase tool error:", e.message);
    throw new Error("Database error: " + e.message);
  }
}

// ── Storage interface ─────────────────────────────────────────────────────────
export interface IStorage {
  getFeeds(): Promise<Feed[]>;
  getFeed(id: number): Promise<Feed | undefined>;
  createFeed(feed: InsertFeed): Promise<Feed>;
  updateFeed(id: number, feed: Partial<InsertFeed>): Promise<Feed | undefined>;
  deleteFeed(id: number): Promise<boolean>;
  reorderFeeds(ids: number[]): Promise<void>;
  getCategories(): Promise<Category[]>;
  createCategory(cat: InsertCategory): Promise<Category>;
  deleteCategory(id: number): Promise<boolean>;
}

// ── Supabase-backed storage ───────────────────────────────────────────────────
export class SupabaseStorage implements IStorage {
  async getFeeds(): Promise<Feed[]> {
    const res = supabase("supabase-select-row", { table: "feeds", orderBy: "position", max: 200 });
    return (res.data || []).map(mapFeed);
  }

  async getFeed(id: number): Promise<Feed | undefined> {
    const res = supabase("supabase-select-row", {
      table: "feeds",
      column: "id",
      filter: "equalTo",
      value: String(id),
      orderBy: "position",
      max: 1,
    });
    const row = (res.data || [])[0];
    return row ? mapFeed(row) : undefined;
  }

  async createFeed(feed: InsertFeed): Promise<Feed> {
    const res = supabase("supabase-insert-row", {
      table: "feeds",
      data: {
        url: feed.url,
        title: feed.title,
        description: feed.description ?? "",
        favicon: feed.favicon ?? "",
        category: feed.category ?? "General",
        position: feed.position ?? 999,
        collapsed: feed.collapsed ?? false,
        max_items: feed.maxItems ?? 10,
      },
    });
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
    return mapFeed(res.data[0]);
  }

  async updateFeed(id: number, update: Partial<InsertFeed>): Promise<Feed | undefined> {
    const data: Record<string, unknown> = {};
    if (update.title !== undefined) data.title = update.title;
    if (update.url !== undefined) data.url = update.url;
    if (update.description !== undefined) data.description = update.description;
    if (update.favicon !== undefined) data.favicon = update.favicon;
    if (update.category !== undefined) data.category = update.category;
    if (update.position !== undefined) data.position = update.position;
    if (update.collapsed !== undefined) data.collapsed = update.collapsed;
    if (update.maxItems !== undefined) data.max_items = update.maxItems;

    const res = supabase("supabase-update-row", {
      table: "feeds",
      column: "id",
      value: String(id),
      data,
    });
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
    const row = (res.data || [])[0];
    return row ? mapFeed(row) : undefined;
  }

  async deleteFeed(id: number): Promise<boolean> {
    const res = supabase("supabase-delete-row", {
      table: "feeds",
      column: "id",
      value: String(id),
    });
    return !res.error;
  }

  async reorderFeeds(ids: number[]): Promise<void> {
    // Update each feed's position — run sequentially to avoid conflicts
    for (let i = 0; i < ids.length; i++) {
      supabase("supabase-update-row", {
        table: "feeds",
        column: "id",
        value: String(ids[i]),
        data: { position: i },
      });
    }
  }

  async getCategories(): Promise<Category[]> {
    const res = supabase("supabase-select-row", { table: "categories", orderBy: "position", max: 100 });
    return (res.data || []).map(mapCategory);
  }

  async createCategory(cat: InsertCategory): Promise<Category> {
    const res = supabase("supabase-insert-row", {
      table: "categories",
      data: { name: cat.name, position: cat.position ?? 99 },
    });
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
    return mapCategory(res.data[0]);
  }

  async deleteCategory(id: number): Promise<boolean> {
    const res = supabase("supabase-delete-row", {
      table: "categories",
      column: "id",
      value: String(id),
    });
    return !res.error;
  }
}

// ── Row mappers (snake_case DB → camelCase app) ───────────────────────────────
function mapFeed(row: any): Feed {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description ?? "",
    favicon: row.favicon ?? "",
    category: row.category ?? "General",
    position: row.position ?? 0,
    collapsed: row.collapsed ?? false,
    maxItems: row.max_items ?? 10,
  };
}

function mapCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    position: row.position ?? 0,
  };
}

export const storage = new SupabaseStorage();
