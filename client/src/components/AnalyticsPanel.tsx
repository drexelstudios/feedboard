/**
 * AnalyticsPanel — slide-in panel showing reading stats.
 * - All users: "My Stats" tab (personal) + "All Users" tab (admin-only, rafael only)
 * - Three time ranges: 7 days / 30 days / All time
 * - Sections: Overview stats, Activity chart, Top Feeds, Feed Health (My Stats only)
 */

import { useState, useEffect, useCallback } from "react";
import { X, BookOpen, ExternalLink, Clock, Flame, TrendingUp, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";

const ADMIN_USER_ID = "88b0c21d-1be1-4ab4-bb85-ae6915f57f4e";

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

interface AdminSummary {
  totalReads: number;
  totalBrowser: number;
  uniqueUsers: number;
  avgReadSec: number;
  topFeeds: { feed_id: number; count: number }[];
  topUsers: { label: string; count: number }[];
  readsByDay: Record<string, number>;
  peakHour: number | null;
}

interface Feed {
  id: number;
  title: string;
  url: string;
  category: string;
}

type TimeRange = "7" | "30" | "all";
type ViewTab = "mine" | "admin";

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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div style={{
      background: "hsl(var(--background))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
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
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "var(--text-xs)",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "hsl(var(--muted-foreground))",
      marginBottom: "var(--space-3)",
    }}>
      {children}
    </p>
  );
}

function TopFeedsList({
  topFeeds,
  feedMap,
}: {
  topFeeds: { feed_id: number; count: number }[];
  feedMap: Map<number, Feed>;
}) {
  if (!topFeeds.length) return null;
  const maxCount = topFeeds[0].count;
  return (
    <section>
      <SectionLabel>Top Feeds</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {topFeeds.map(({ feed_id, count }, idx) => {
          const feed = feedMap.get(feed_id);
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
  );
}

function TopUsersList({ topUsers }: { topUsers: { label: string; count: number }[] }) {
  if (!topUsers.length) return null;
  const maxCount = topUsers[0].count;
  return (
    <section>
      <SectionLabel>Top Readers</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {topUsers.map(({ label, count }, idx) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", width: 14, textAlign: "right", flexShrink: 0 }}>
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
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
        ))}
      </div>
    </section>
  );
}

export default function AnalyticsPanel({ isOpen, onClose }: AnalyticsPanelProps) {
  const { session } = useAuth();
  const [range, setRange] = useState<TimeRange>("30");
  const [view, setView] = useState<ViewTab>("mine");
  const [visible, setVisible] = useState(false);

  const isAdmin = session?.user?.id === ADMIN_USER_ID;

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

  const { data: summary, isLoading: loadingMine } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/analytics/summary", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/summary?days=${range}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    enabled: isOpen && !!session && view === "mine",
    staleTime: 5 * 60 * 1000,
  });

  const { data: adminSummary, isLoading: loadingAdmin } = useQuery<AdminSummary>({
    queryKey: ["/api/analytics/admin", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/admin?days=${range}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load admin analytics");
      return res.json();
    },
    enabled: isOpen && !!session && isAdmin && view === "admin",
    staleTime: 5 * 60 * 1000,
  });

  const { data: feedsData } = useQuery<Feed[]>({
    queryKey: ["/api/feeds"],
    enabled: isOpen && !!session,
    staleTime: 5 * 60 * 1000,
  });

  const feedMap = new Map((feedsData || []).map((f) => [f.id, f]));

  if (!isOpen) return null;

  const isLoading = view === "mine" ? loadingMine : loadingAdmin;
  const currentData = view === "mine" ? summary : adminSummary;

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

  const tabBtn = (t: ViewTab, label: string, icon: React.ReactNode) => (
    <button
      key={t}
      onClick={() => setView(t)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: 1,
        justifyContent: "center",
        padding: "7px 0",
        borderRadius: 8,
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        border: "1px solid hsl(var(--border))",
        cursor: "pointer",
        background: view === t ? "hsl(var(--primary))" : "transparent",
        color: view === t ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
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
              {view === "admin" ? "All users · aggregate stats" : "Your personal reading stats"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 6,
              borderRadius: 8,
              color: "hsl(var(--muted-foreground))",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* View tabs — only shown to admin */}
        {isAdmin && (
          <div style={{
            display: "flex",
            gap: 4,
            padding: "var(--space-4) var(--space-5) 0",
          }}>
            {tabBtn("mine", "My Stats", <BookOpen size={12} />)}
            {tabBtn("admin", "All Users", <Users size={12} />)}
          </div>
        )}

        {/* Time range tabs */}
        <div style={{
          display: "flex",
          gap: 4,
          padding: `var(--space-3) var(--space-5) 0`,
        }}>
          {(["7", "30", "all"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 8,
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
          ) : view === "mine" ? (
            <>
              {/* Overview stats */}
              <section>
                <SectionLabel>Overview</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                  <StatCard icon={<BookOpen size={12} />} label="Articles read" value={summary?.totalReads ?? 0} />
                  <StatCard icon={<Flame size={12} />} label="Day streak" value={`${summary?.streak ?? 0}🔥`} />
                  <StatCard icon={<Clock size={12} />} label="Avg read time" value={summary?.avgReadSec ? formatDuration(summary.avgReadSec) : "—"} />
                  <StatCard icon={<ExternalLink size={12} />} label="Opened in browser" value={summary?.totalBrowser ?? 0} />
                </div>
                {summary?.peakHour != null && (
                  <p style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", marginTop: "var(--space-2)" }}>
                    Most active at <strong style={{ color: "hsl(var(--foreground))" }}>{formatHour(summary.peakHour)}</strong>
                  </p>
                )}
              </section>

              {/* Activity chart */}
              <section>
                <SectionLabel>Daily Activity</SectionLabel>
                <div style={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  padding: "var(--space-3)",
                  overflow: "hidden",
                }}>
                  <MiniBarChart data={summary?.readsByDay ?? {}} />
                </div>
              </section>

              {/* Top feeds */}
              <TopFeedsList topFeeds={summary?.topFeeds ?? []} feedMap={feedMap} />

              {/* Feed health */}
              {(feedsData?.length ?? 0) > 0 && (
                <section>
                  <SectionLabel>Feed Health</SectionLabel>
                  <div style={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
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
              {(summary?.totalReads ?? 0) === 0 && (
                <div style={{ textAlign: "center", paddingTop: 40, color: "hsl(var(--muted-foreground))" }}>
                  <TrendingUp size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                  <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>No reading activity yet</p>
                  <p style={{ fontSize: "var(--text-xs)", margin: "4px 0 0" }}>Start reading articles to see your stats here.</p>
                </div>
              )}
            </>
          ) : (
            /* Admin view */
            <>
              {/* Overview stats */}
              <section>
                <SectionLabel>Overview</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                  <StatCard icon={<BookOpen size={12} />} label="Total reads" value={adminSummary?.totalReads ?? 0} />
                  <StatCard icon={<Users size={12} />} label="Active readers" value={adminSummary?.uniqueUsers ?? 0} />
                  <StatCard icon={<Clock size={12} />} label="Avg read time" value={adminSummary?.avgReadSec ? formatDuration(adminSummary.avgReadSec) : "—"} />
                  <StatCard icon={<ExternalLink size={12} />} label="Browser opens" value={adminSummary?.totalBrowser ?? 0} />
                </div>
                {adminSummary?.peakHour != null && (
                  <p style={{ fontSize: "var(--text-xs)", color: "hsl(var(--muted-foreground))", marginTop: "var(--space-2)" }}>
                    Peak hour across all users: <strong style={{ color: "hsl(var(--foreground))" }}>{formatHour(adminSummary.peakHour)}</strong>
                  </p>
                )}
              </section>

              {/* Activity chart */}
              <section>
                <SectionLabel>Daily Activity</SectionLabel>
                <div style={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  padding: "var(--space-3)",
                  overflow: "hidden",
                }}>
                  <MiniBarChart data={adminSummary?.readsByDay ?? {}} />
                </div>
              </section>

              {/* Top feeds */}
              <TopFeedsList topFeeds={adminSummary?.topFeeds ?? []} feedMap={feedMap} />

              {/* Top readers */}
              <TopUsersList topUsers={adminSummary?.topUsers ?? []} />

              {/* Empty state */}
              {(adminSummary?.totalReads ?? 0) === 0 && (
                <div style={{ textAlign: "center", paddingTop: 40, color: "hsl(var(--muted-foreground))" }}>
                  <Users size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                  <p style={{ fontSize: "var(--text-sm)", margin: 0 }}>No user activity yet</p>
                  <p style={{ fontSize: "var(--text-xs)", margin: "4px 0 0" }}>Activity will appear here once users start reading.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
