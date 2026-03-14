import { createClient } from "@supabase/supabase-js";
import { Feed, InsertFeed, Category, InsertCategory } from "@shared/schema";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(mapFeed);
  }

  async getFeed(id: number): Promise<Feed | undefined> {
    const { data, error } = await supabase
      .from("feeds")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return data ? mapFeed(data) : undefined;
  }

  async createFeed(feed: InsertFeed): Promise<Feed> {
    const { data, error } = await supabase
      .from("feeds")
      .insert({
        url: feed.url,
        title: feed.title,
        description: feed.description ?? "",
        favicon: feed.favicon ?? "",
        category: feed.category ?? "General",
        position: feed.position ?? 999,
        collapsed: feed.collapsed ?? false,
        max_items: feed.maxItems ?? 10,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapFeed(data);
  }

  async updateFeed(id: number, update: Partial<InsertFeed>): Promise<Feed | undefined> {
    const patch: Record<string, unknown> = {};
    if (update.title !== undefined) patch.title = update.title;
    if (update.url !== undefined) patch.url = update.url;
    if (update.description !== undefined) patch.description = update.description;
    if (update.favicon !== undefined) patch.favicon = update.favicon;
    if (update.category !== undefined) patch.category = update.category;
    if (update.position !== undefined) patch.position = update.position;
    if (update.collapsed !== undefined) patch.collapsed = update.collapsed;
    if (update.maxItems !== undefined) patch.max_items = update.maxItems;

    const { data, error } = await supabase
      .from("feeds")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data ? mapFeed(data) : undefined;
  }

  async deleteFeed(id: number): Promise<boolean> {
    const { error } = await supabase.from("feeds").delete().eq("id", id);
    return !error;
  }

  async reorderFeeds(ids: number[]): Promise<void> {
    await Promise.all(
      ids.map((id, i) =>
        supabase.from("feeds").update({ position: i }).eq("id", id)
      )
    );
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(mapCategory);
  }

  async createCategory(cat: InsertCategory): Promise<Category> {
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: cat.name, position: cat.position ?? 99 })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapCategory(data);
  }

  async deleteCategory(id: number): Promise<boolean> {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    return !error;
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
