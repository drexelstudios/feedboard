import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import FeedWidget from "@/components/FeedWidget";
import type { EnrichedFeedItem } from "@/components/FeedWidget";
import ReadingPane from "@/components/ReadingPane";
import DemoBanner from "@/components/DemoBanner";
import MasonryGrid from "@/components/MasonryGrid";
import { cn } from "@/lib/utils";

function useWindowWidth() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth,
    () => 1280,
  );
}

type Columns = 2 | 3 | 4;

interface DemoFeed {
  id: number;
  title: string;
  url: string;
  category: string;
  maxItems: number;
}

interface DemoFeedsResponse {
  feeds: DemoFeed[];
  categories: string[];
}

export default function DemoDashboard() {
  const { theme, toggle } = useTheme();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [columns, setColumns] = useState<Columns>(3);
  const [selectedItem, setSelectedItem] = useState<EnrichedFeedItem | null>(null);
  const [isPaneOpen, setIsPaneOpen] = useState(false);
  const windowWidth = useWindowWidth();
  const effectiveColumns = windowWidth <= 600 ? 1 : windowWidth <= 900 ? 2 : columns;

  // Measure banner + header heights for sticky offsets
  const headerRef = useRef<HTMLElement>(null);
  const [bannerH, setBannerH] = useState(40);
  const [headerH, setHeaderH] = useState(56);

  useEffect(() => {
    const measure = () => {
      const b = document.getElementById("demo-banner");
      const h = headerRef.current;
      setBannerH(b?.offsetHeight ?? 0);
      setHeaderH(h?.offsetHeight ?? 56);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { data } = useQuery<DemoFeedsResponse>({
    queryKey: ["/api/demo/feeds"],
    staleTime: 30 * 60 * 1000,
  });

  const feeds = data?.feeds ?? [];
  const categories = data?.categories ?? [];

  const filteredFeeds =
    activeCategory === "All"
      ? feeds
      : feeds.filter((f) => f.category === activeCategory);

  // Convert DemoFeed to the shape FeedWidget expects
  const widgetFeeds = filteredFeeds.map((f) => ({
    id: f.id,
    title: f.title,
    url: `/api/demo/feed-items/${f.id}`,
    description: "",
    favicon: "",
    category: f.category,
    maxItems: f.maxItems,
    position: 0,
    collapsed: false,
  }));

  const handleItemClick = (item: EnrichedFeedItem) => {
    setSelectedItem(item);
    setIsPaneOpen(true);
  };

  const handleClosePane = () => {
    setIsPaneOpen(false);
    setSelectedItem(null);
  };

  return (
    <div
      className={cn("min-h-screen flex flex-col", isPaneOpen && "pane-open")}
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Signup banner */}
      <DemoBanner />

      {/* Header */}
      <header
        ref={headerRef}
        className="sticky z-40 border-b"
        style={{ top: bannerH, background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
      >
        <div
          className="flex items-center justify-between px-4 sm:px-6 h-14"
          style={{ maxWidth: "var(--content-wide)", margin: "0 auto" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Feedhunt logo" style={{ color: "hsl(var(--primary))" }}>
              <rect x="3"  y="3"  width="9" height="9" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="16" y="3"  width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
              <rect x="3"  y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
              <rect x="16" y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.3"/>
            </svg>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.03em", color: "hsl(var(--foreground))" }}>
              Feedhunt
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-lg transition-all"
              style={{ color: "hsl(var(--muted-foreground))" }}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <a
              href="/auth"
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              Sign up free
            </a>

            <a
              href="/auth"
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold border transition-all hover:opacity-90"
              style={{ color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }}
            >
              Log in
            </a>
          </div>
        </div>
      </header>

      {/* Category tabs */}
      <div
        className="sticky z-30 border-b"
        style={{ top: bannerH + headerH, background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-6"
          style={{ maxWidth: "var(--content-wide)", margin: "0 auto" }}
        >
          <div className="flex items-center gap-1 overflow-x-auto py-2" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setActiveCategory("All")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                activeCategory === "All"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              style={activeCategory === "All"
                ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                : {}}
            >
              All
            </button>

            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                style={activeCategory === cat
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                  : {}}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Column toggle — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {([2, 3, 4] as Columns[]).map((n) => (
              <button
                key={n}
                onClick={() => setColumns(n)}
                className={cn(
                  "w-7 h-7 rounded text-xs font-bold transition-all",
                  columns === n
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={columns === n
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                  : {}}
                title={`${n} columns`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feed grid */}
      <div className="flex flex-1 overflow-hidden">
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6"
          style={{ maxWidth: "var(--content-wide)", margin: "0 auto", width: "100%" }}
        >
          <MasonryGrid columns={effectiveColumns} gap={16}>
            {widgetFeeds.map((feed) => (
              <FeedWidget
                key={feed.id}
                feed={feed}
                isDragging={false}
                selectedItemId={selectedItem?.itemId ?? null}
                onItemClick={handleItemClick}
                isDemoMode
              />
            ))}
          </MasonryGrid>
        </main>

        {/* Reading pane */}
        <ReadingPane
          item={selectedItem}
          isOpen={isPaneOpen}
          onClose={handleClosePane}
        />
      </div>

      {/* Footer */}
      <footer
        className="border-t px-4 sm:px-6 py-2 flex items-center justify-between"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {feeds.length} live feeds · updated every 30 min
        </span>
        <a
          href="/auth"
          className="text-xs font-medium hover:underline"
          style={{ color: "hsl(var(--primary))" }}
        >
          Create your own dashboard →
        </a>
      </footer>
    </div>
  );
}
