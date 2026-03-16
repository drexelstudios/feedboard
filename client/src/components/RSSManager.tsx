/**
 * RSSManager — RSS & Feed Creator source management modal
 *
 * Lists all non-newsletter feeds with per-feed controls:
 *   - Name (editable inline)
 *   - Category selector
 *   - Max items selector
 *   - Visible toggle (collapsed = hidden)
 *   - Re-scan (Feed Creator feeds only)
 *   - Delete
 *
 * Mirrors the NewsletterManager interaction pattern for consistency.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Rss,
  Sparkles,
  RefreshCw,
  Trash2,
  Check,
  X,
  Pencil,
} from "lucide-react";
import type { Feed } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
}

interface RSSManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_ITEMS_OPTIONS = [5, 8, 10, 15, 20, 25];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RSSManager({ open, onOpenChange }: RSSManagerProps) {
  const { toast } = useToast();

  const { data: allFeeds = [], isLoading } = useQuery<(Feed & { source_type?: string })[]>({
    queryKey: ["/api/feeds"],
    enabled: open,
  });

  // Only RSS / Feed Creator feeds (not newsletters)
  const feeds = allFeeds.filter((f) => (f as any).source_type !== "newsletter");

  const { data: categoryData = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: open,
  });
  const categories = Array.from(new Set(["General", ...categoryData.map((c) => c.name)]));

  const patchMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Record<string, any> }) =>
      apiRequest("PATCH", `/api/feeds/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feeds"] });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/feeds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feeds"] });
      toast({ title: "Feed removed" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rescanMutation = useMutation({
    mutationFn: ({ slug, feedId }: { slug: string; feedId: number }) =>
      apiRequest("POST", "/api/scrape/rescan", { slug, feedId }),
    onSuccess: (_data, { feedId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feeds"] });
      queryClient.invalidateQueries({ queryKey: [`/api/feeds/${feedId}/items`] });
      toast({ title: "Re-scan complete", description: "Feed items refreshed." });
    },
    onError: (err: Error) =>
      toast({ title: "Re-scan failed", description: err.message, variant: "destructive" }),
  });

  const handleDelete = (feed: Feed) => {
    if (!confirm(`Remove "${feed.title}" and all its items?`)) return;
    deleteMutation.mutate(feed.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        style={{ maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-base)" }}
          >
            RSS Sources
          </DialogTitle>
        </DialogHeader>

        {/* ── Feed list ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {isLoading ? (
            <div className="flex flex-col gap-3 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                  <div className="flex-1">
                    <div className="skeleton" style={{ height: 13, width: "60%", marginBottom: 4 }} />
                    <div className="skeleton" style={{ height: 11, width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : feeds.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-10 text-center"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <Rss size={28} className="mb-3 opacity-30" />
              <p style={{ fontSize: "var(--text-sm)" }}>No RSS feeds yet.</p>
              <p style={{ fontSize: "var(--text-xs)", marginTop: 4, opacity: 0.7 }}>
                Add feeds using the Add Feed button in the header.
              </p>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
              {feeds.map((feed) => (
                <FeedRow
                  key={feed.id}
                  feed={feed}
                  categories={categories}
                  onPatch={(updates) => patchMutation.mutate({ id: feed.id, updates })}
                  onDelete={() => handleDelete(feed)}
                  onRescan={(slug) => rescanMutation.mutate({ slug, feedId: feed.id })}
                  isRescanning={rescanMutation.isPending && (rescanMutation.variables as any)?.feedId === feed.id}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── FeedRow ───────────────────────────────────────────────────────────────────

function FeedRow({
  feed,
  categories,
  onPatch,
  onDelete,
  onRescan,
  isRescanning,
}: {
  feed: Feed & { source_type?: string };
  categories: string[];
  onPatch: (updates: Record<string, any>) => void;
  onDelete: () => void;
  onRescan: (slug: string) => void;
  isRescanning: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(feed.title);

  // Detect Feed Creator feeds (url contains /api/feed/<slug>)
  const feedCreatorSlug = (() => {
    try {
      const u = new URL(feed.url);
      const m = u.pathname.match(/\/api\/feed\/([^/]+)/);
      return m ? m[1] : null;
    } catch { return null; }
  })();

  const isVisible = !feed.collapsed;

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== feed.title) onPatch({ title: trimmed });
    setEditingTitle(false);
  };

  return (
    <li className="py-3">
      {/* Top row: icon + title + toggle + delete */}
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className="flex-shrink-0 rounded-full flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            background: "hsl(var(--accent))",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          {feedCreatorSlug
            ? <Sparkles size={14} />
            : <Rss size={14} />
          }
        </div>

        {/* Title (inline edit) */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") { setTitleDraft(feed.title); setEditingTitle(false); }
                }}
                className="h-6 text-xs py-0 px-2 flex-1 min-w-0"
              />
              <button
                onClick={commitTitle}
                className="p-0.5 rounded hover:bg-accent"
                style={{ color: "hsl(var(--primary))" }}
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => { setTitleDraft(feed.title); setEditingTitle(false); }}
                className="p-0.5 rounded hover:bg-accent"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group">
              <span
                className="font-medium truncate"
                style={{ fontSize: "var(--text-sm)", color: "hsl(var(--foreground))" }}
              >
                {feed.title}
              </span>
              <button
                onClick={() => { setTitleDraft(feed.title); setEditingTitle(true); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:bg-accent"
                style={{ color: "hsl(var(--muted-foreground))" }}
                title="Rename"
              >
                <Pencil size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Visible toggle */}
        <Switch
          data-testid={`switch-visible-${feed.id}`}
          checked={isVisible}
          onCheckedChange={(checked) => onPatch({ collapsed: !checked })}
          aria-label={`${isVisible ? "Hide" : "Show"} ${feed.title}`}
        />

        {/* Delete */}
        <button
          data-testid={`button-delete-feed-${feed.id}`}
          onClick={onDelete}
          className="p-1 rounded transition-colors hover:bg-destructive/20 flex-shrink-0"
          style={{ color: "hsl(var(--muted-foreground))" }}
          title="Remove feed"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Second row: category + max items + re-scan */}
      <div className="flex items-center gap-2 mt-2 pl-11 flex-wrap">
        {/* Category */}
        <Select
          value={feed.category}
          onValueChange={(v) => onPatch({ category: v })}
        >
          <SelectTrigger
            className="h-6 text-xs w-[130px]"
            data-testid={`select-category-${feed.id}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Max items */}
        <Select
          value={String(feed.maxItems)}
          onValueChange={(v) => onPatch({ maxItems: Number(v) })}
        >
          <SelectTrigger
            className="h-6 text-xs w-[80px]"
            data-testid={`select-max-items-${feed.id}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAX_ITEMS_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n} items</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Re-scan — Feed Creator only */}
        {feedCreatorSlug && (
          <button
            onClick={() => onRescan(feedCreatorSlug)}
            disabled={isRescanning}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors hover:bg-accent disabled:opacity-50"
            style={{ color: "hsl(var(--muted-foreground))" }}
            title="Re-scan feed"
          >
            <RefreshCw size={11} className={isRescanning ? "animate-spin" : ""} />
            Re-scan
          </button>
        )}
      </div>
    </li>
  );
}
