/**
 * AnalyticsPanel — slide-in panel showing per-user reading stats
 * Same pattern as SettingsPanel: fixed overlay + animated drawer from the right.
 *
 * Three time ranges: 7 days / 30 days / All time
 * Sections: Overview stats, Activity chart, Top Feeds, Feed Health
 */

import { useState, useEffect, useCallback } from "react";
import { X, BookOpen, ExternalLink, Clock, Flame, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

interface AnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalyticsSummary {
  totalReads: number;
  totalBrowser: number;
  avgReadSec: number;
  topFeeds: { feed_id: number; count: number }[];
  readsByDay: Record<string, number>;
  peakHour: number | null;
  streak: number;
  lastOpenedByFeed: Record<number, string>;
}

interface Feed {
  id: number;
  title: string;
  url: string;
  category: string;
}

type TimeRange = "7" | "30" | "all";

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// Minimal bar chart using divs — no chart library needed
function MiniBarChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  if (entries.length === 0) return (
    <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))" }}>No data yet</span>
    </div>
  );
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 52, width: "100%" }}>
      {entries.map(([day, count]) => (
        <div
          key={day}
          title={`${day}: ${count} article${count !== 1 ? "s" : ""}`}
          style={{
            flex: 1,
            minWidth: 3,
            height: `${Math.max(8, Math.round((count / max) * 52))}px`,
            borderRadius: 2,
            background: "hsl(var(--primary))",
            opacity: count === 0 ? 0.15 : 0.85,
            cursor: "default",
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPanel({ isOpen, onClose }: AnalyticsPanelProps) {
  const { session } = useAuth();
  const [range, setRange] = useState<TimeRange>("30");
  const [visible, setVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const { data: summary, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/analytics/summary", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/summary?days=${range}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    enabled: isOpen && !!session,
    staleTime: 5 * 60 * 1000,
  });

  const { data: feedsData } = useQuery<Feed[]>({
    queryKey: ["/api/feeds"],
    enabled: isOpen && !!session,
    staleTime: 5 * 60 * 1000,
  });

  const feedMap = new Map((feedsData || []).map((f) => [f.id, f]));

  if (!isOpen) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "flex",
    justifyContent: "flex-end",
  };

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    opacity: visible ? 1 : 0,
    transition: "opacity 0.25s ease",
  };

  const drawerStyle: React.CSSProperties = {
    position: "relative",
    width: "min(420px, 100vw)",
    height: "100%",
    background: "hsl(var(--card))",
    borderLeft: "1px solid hsl(var(--border))",
    display: "flex",
    flexDirection: "column",
    transform: visible ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
    overflowY: "auto",
  };

  const statCard = (icon: React.ReactNode, label: string, value: string | number) => (
    <div style={{
      background: "hsl(var(--background))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "var(--radius)",
      padding: "var(--space-3) var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "hsl(var(--muted-foreground))" }}>
        {icon}
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.2 }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={panelStyle} role="dialog" aria-label="Analytics">
      {/* Backdrop */}
      <div style={overlayStyle} onClick={onClose} />

      {/* Drawer */}
      <div style={drawerStyle}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-4) var(--space-5)",
          borderBottom: "1px solid hsl(var(--border))",
          position: "sticky",
          top: 0,
          background: "hsl(var(--card))",
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", margin: 0 }}>
              Reading Analytics
            </h2>
            <p style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", margin: 0 }}>
              Your personal reading stats
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 6,
              borderRadius: "var(--radius)",
              color: "hsl(var(--muted-foreground))",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Time range tabs */}
        <div style={{
          display: "flex",
          gap: 4,
          padding: "var(--space-4) var(--space-5) 0",
        }}>
          {(["7", "30", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                border: "1px solid hsl(var(--border))",
                cursor: "pointer",
                background: range === r ? "hsl(var(--primary))" : "transparent",
                color: range === r ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                transition: "all 0.15s",
              }}
            >
              {r === "7" ? "7 days" : r === "30" ? "30 days" : "All time"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "var(--space-4) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "2px solid hsl(var(--primary))",
                borderTopColor: "transparent",
                animation: "spin 0.7s linear infinite",
              }} />
            </div>
          ) : (
            <>
              {/* Overview stats grid */}
              <section>
                <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: "var(--space-3)" }}>
                  Overview
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                  {statCard(<BookOpen size={12} />, "Articles read", summary?.totalReads ?? 0)}
                  {statCard(<Flame size={12} />, "Day streak", `${summary?.streak ?? 0}🔥`)}
                  {statCard(<Clock size={12} />, "Avg read time", summary?.avgReadSec ? formatDuration(summary.avgReadSec) : "—")}
                  {statCard(<ExternalLink size={12} />, "Opened in browser", summary?.totalBrowser ?? 0)}
                </div>
                {summary?.peakHour != null && (
                  <p style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", marginTop: "var(--space-2)" }}>
                    Most active at <strong style={{ color: "hsl(var(--foreground))" }}>{formatHour(summary.peakHour)}</strong>
                  </p>
                )}
              </section>

              {/* Activity chart */}
              <section>
                <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: "var(--space-3)" }}>
                  Daily Activity
                </p>
                <div style={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  padding: "var(--space-3)",
                }}>
                  <MiniBarChart data={summary?.readsByDay ?? {}} />
                </div>
              </section>

              {/* Top feeds */}
              {(summary?.topFeeds?.length ?? 0) > 0 && (
                <section>
                  <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: "var(--space-3)" }}>
                    Top Feeds
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    {summary!.topFeeds.map(({ feed_id, count }, idx) => {
                      const feed = feedMap.get(feed_id);
                      const maxCount = summary!.topFeeds[0].count;
                      return (
                        <div key={feed_id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", width: 14, textAlign: "right", flexShrink: 0 }}>
                            {idx + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {feed?.title ?? `Feed ${feed_id}`}
                              </span>
                              <span style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", flexShrink: 0, marginLeft: 6 }}>
                                {count}
                              </span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: "hsl(var(--border))", overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.round((count / maxCount) * 100)}%`,
                                background: "hsl(var(--primary))",
                                borderRadius: 2,
                              }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Feed health */}
              {(feedsData?.length ?? 0) > 0 && (
                <section>
                  <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: "var(--space-3)" }}>
                    Feed Health
                  </p>
                  <div style={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    overflow: "hidden",
                  }}>
                    {feedsData!.map((feed, idx) => {
                      const lastOpened = summary?.lastOpenedByFeed?.[feed.id];
                      const isUnread = !lastOpened;
                      const isLast = idx === feedsData!.length - 1;
                      return (
                        <div
                          key={feed.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "var(--space-2) var(--space-3)",
                            borderBottom: isLast ? "none" : "1px solid hsl(var(--border))",
                            opacity: isUnread ? 0.5 : 1,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                              {feed.title}
                            </span>
                            <span style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))" }}>
                              {feed.category}
                            </span>
                          </div>
                          <span style={{
                            fontSize: "var(--text-xs)",
                            color: isUnread ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                            flexShrink: 0,
                            marginLeft: 8,
                          }}>
                            {lastOpened ? timeAgo(lastOpened) : "never opened"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Empty state */}
              {!isLoading && (summary?.totalReads ?? 0) === 0 && (
                <div style={{ textAlign: "center", paddingTop: 40, color: "hsl(var(--muted-foreground))" }}>
                  <TrendingUp size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                  <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>No reading activity yet</p>
                  <p style={{ fontSize: "var(--text-xs)", margin: "4px 0 0" }}>Start reading articles to see your stats here.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
