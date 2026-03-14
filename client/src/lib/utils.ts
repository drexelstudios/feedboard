import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function getFaviconUrl(feedUrl: string): string {
  try {
    const u = new URL(feedUrl);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return "";
  }
}

// Category colors — consistent per name
const CATEGORY_COLORS: Record<string, string> = {
  News: "#3b82f6",
  Tech: "#8b5cf6",
  Design: "#ec4899",
  General: "#6b7280",
  Science: "#10b981",
  Business: "#f59e0b",
  Sports: "#ef4444",
  Entertainment: "#f97316",
  Health: "#14b8a6",
  Politics: "#6366f1",
};

export function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "#6b7280";
}
