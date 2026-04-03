import { useState } from "react";
import { X } from "lucide-react";

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      id="demo-banner"
      className="sticky top-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium"
      style={{
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
      }}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-center flex-wrap">
        <span className="opacity-90">
          You're viewing a live preview of Feedhunt.
        </span>
        <a
          href="/auth"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all hover:opacity-90 shrink-0"
          style={{
            background: "hsl(var(--primary-foreground))",
            color: "hsl(var(--primary))",
          }}
        >
          Sign up free →
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded opacity-70 hover:opacity-100 transition-opacity shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
