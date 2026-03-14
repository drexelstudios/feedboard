import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Plus, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Feed } from "@shared/schema";

interface HeaderProps {
  onAddFeed: () => void;
}

export default function Header({ onAddFeed }: HeaderProps) {
  const { theme, toggle } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: feeds = [] } = useQuery<Feed[]>({ queryKey: ["/api/feeds"] });

  const handleRefreshAll = async () => {
    setRefreshing(true);
    // Invalidate all feed item queries
    await Promise.all(
      feeds.map((f) =>
        queryClient.invalidateQueries({ queryKey: [`/api/feeds/${f.id}/items`] })
      )
    );
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
      }}
    >
      <div
        className="flex items-center justify-between px-4 sm:px-6 h-14"
        style={{ maxWidth: "var(--content-wide)", margin: "0 auto" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-label="Feedboard logo"
            style={{ color: "hsl(var(--primary))" }}
          >
            {/* Stylized RSS / grid icon */}
            <rect x="3" y="3" width="9" height="9" rx="2" fill="currentColor" opacity="0.9"/>
            <rect x="16" y="3" width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="3" y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.5"/>
            <rect x="16" y="16" width="9" height="9" rx="2" fill="currentColor" opacity="0.3"/>
          </svg>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "1.1rem",
              letterSpacing: "-0.03em",
              color: "hsl(var(--foreground))",
            }}
          >
            Feedboard
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            data-testid="button-refresh-all"
            onClick={handleRefreshAll}
            className="p-2 rounded-lg transition-all"
            style={{ color: "hsl(var(--muted-foreground))" }}
            title="Refresh all feeds"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>

          <button
            data-testid="button-theme-toggle"
            onClick={toggle}
            className="p-2 rounded-lg transition-all"
            style={{ color: "hsl(var(--muted-foreground))" }}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <Button
            data-testid="button-add-feed"
            onClick={onAddFeed}
            size="sm"
            className="gap-1.5 h-8 text-xs font-semibold"
          >
            <Plus size={14} />
            Add Feed
          </Button>
        </div>
      </div>
    </header>
  );
}
