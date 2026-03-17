/**
 * ThemeProvider — dark/light mode + named theme presets + per-user customisation
 *
 * Extends the original single-toggle provider with:
 *   - 3 named theme presets (default, perplexity, shadcn)
 *   - Per-user font-size scale and reading width knobs
 *   - Persistence to Supabase user_preferences (upsert via /api/preferences)
 *   - Instant CSS-var injection on documentElement so the whole UI reacts live
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColorMode = "dark" | "light";
export type ThemeId = "default" | "perplexity" | "shadcn";
export type ReadingWidth = "compact" | "default" | "wide";

export interface UserPrefs {
  colorMode: ColorMode;
  themeId: ThemeId;
  /** Multiplier applied to the base type scale: 0.85 – 1.2 */
  fontScale: number;
  readingWidth: ReadingWidth;
}

const DEFAULT_PREFS: UserPrefs = {
  colorMode: window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light",
  themeId: "default",
  fontScale: 1,
  readingWidth: "default",
};

// ── Theme definitions ─────────────────────────────────────────────────────────
// Each theme overrides only the CSS custom properties that differ from the
// base stylesheet. They are applied as inline styles on <html> so they win
// over :root without needing !important.

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  /** Light-mode overrides */
  light: Record<string, string>;
  /** Dark-mode overrides */
  dark: Record<string, string>;
  /** Font overrides (mode-independent) */
  fonts: Record<string, string>;
}

export const THEMES: ThemeDef[] = [
  {
    id: "default",
    label: "Default",
    description: "Feedhunt's original blue + Cabinet Grotesk palette",
    fonts: {
      "--font-display": "'Cabinet Grotesk', 'Inter', sans-serif",
      "--font-body": "'Satoshi', 'Inter', sans-serif",
    },
    light: {
      "--background":        "200 15% 97%",
      "--foreground":        "215 25% 12%",
      "--card":              "0 0% 100%",
      "--card-foreground":   "215 25% 12%",
      "--primary":           "217 91% 48%",
      "--primary-foreground":"0 0% 100%",
      "--secondary":         "215 14% 94%",
      "--secondary-foreground":"215 25% 20%",
      "--muted":             "215 14% 94%",
      "--muted-foreground":  "215 14% 48%",
      "--accent":            "217 91% 94%",
      "--accent-foreground": "217 91% 30%",
      "--border":            "215 14% 88%",
      "--input":             "215 14% 88%",
      "--ring":              "217 91% 48%",
    },
    dark: {
      "--background":        "222 22% 10%",
      "--foreground":        "215 20% 86%",
      "--card":              "222 22% 13%",
      "--card-foreground":   "215 20% 86%",
      "--primary":           "217 91% 60%",
      "--primary-foreground":"222 22% 8%",
      "--secondary":         "222 15% 18%",
      "--secondary-foreground":"215 20% 70%",
      "--muted":             "222 15% 18%",
      "--muted-foreground":  "215 14% 52%",
      "--accent":            "217 30% 22%",
      "--accent-foreground": "217 91% 70%",
      "--border":            "222 15% 20%",
      "--input":             "222 15% 20%",
      "--ring":              "217 91% 60%",
    },
  },
  {
    id: "perplexity",
    label: "Perplexity",
    description: "Teal accent, Inter, and Perplexity's signature neutral palette",
    fonts: {
      "--font-display": "'Inter', system-ui, sans-serif",
      "--font-body":    "'Inter', system-ui, sans-serif",
    },
    light: {
      "--background":        "0 0% 98%",
      "--foreground":        "240 10% 8%",
      "--card":              "0 0% 100%",
      "--card-foreground":   "240 10% 8%",
      "--primary":           "174 72% 36%",
      "--primary-foreground":"0 0% 100%",
      "--secondary":         "240 5% 94%",
      "--secondary-foreground":"240 10% 20%",
      "--muted":             "240 5% 94%",
      "--muted-foreground":  "240 5% 45%",
      "--accent":            "174 60% 92%",
      "--accent-foreground": "174 72% 22%",
      "--border":            "240 5% 88%",
      "--input":             "240 5% 88%",
      "--ring":              "174 72% 36%",
    },
    dark: {
      "--background":        "240 10% 8%",
      "--foreground":        "240 5% 90%",
      "--card":              "240 10% 11%",
      "--card-foreground":   "240 5% 90%",
      "--primary":           "174 72% 48%",
      "--primary-foreground":"240 10% 6%",
      "--secondary":         "240 8% 16%",
      "--secondary-foreground":"240 5% 72%",
      "--muted":             "240 8% 16%",
      "--muted-foreground":  "240 5% 50%",
      "--accent":            "174 30% 18%",
      "--accent-foreground": "174 72% 60%",
      "--border":            "240 8% 18%",
      "--input":             "240 8% 18%",
      "--ring":              "174 72% 48%",
    },
  },
  {
    id: "shadcn",
    label: "shadcn",
    description: "shadcn/ui's iconic zinc neutral palette with sharp geometry",
    fonts: {
      "--font-display": "system-ui, -apple-system, sans-serif",
      "--font-body":    "system-ui, -apple-system, sans-serif",
    },
    light: {
      "--background":        "0 0% 100%",
      "--foreground":        "240 10% 4%",
      "--card":              "0 0% 100%",
      "--card-foreground":   "240 10% 4%",
      "--primary":           "240 6% 10%",
      "--primary-foreground":"0 0% 98%",
      "--secondary":         "240 5% 96%",
      "--secondary-foreground":"240 6% 10%",
      "--muted":             "240 5% 96%",
      "--muted-foreground":  "240 4% 46%",
      "--accent":            "240 5% 96%",
      "--accent-foreground": "240 6% 10%",
      "--border":            "240 6% 90%",
      "--input":             "240 6% 90%",
      "--ring":              "240 6% 10%",
    },
    dark: {
      "--background":        "240 10% 4%",
      "--foreground":        "0 0% 98%",
      "--card":              "240 10% 4%",
      "--card-foreground":   "0 0% 98%",
      "--primary":           "0 0% 98%",
      "--primary-foreground":"240 6% 10%",
      "--secondary":         "240 4% 16%",
      "--secondary-foreground":"0 0% 98%",
      "--muted":             "240 4% 16%",
      "--muted-foreground":  "240 5% 65%",
      "--accent":            "240 4% 16%",
      "--accent-foreground": "0 0% 98%",
      "--border":            "240 4% 16%",
      "--input":             "240 4% 16%",
      "--ring":              "240 5% 84%",
    },
  },
];

// ── Reading width values ───────────────────────────────────────────────────────
const READING_WIDTHS: Record<ReadingWidth, string> = {
  compact: "520px",
  default: "680px",
  wide:    "820px",
};

// ── Apply prefs to DOM ────────────────────────────────────────────────────────

function applyPrefs(prefs: UserPrefs) {
  const root = document.documentElement;
  const theme = THEMES.find((t) => t.id === prefs.themeId) ?? THEMES[0];
  const vars = {
    ...theme.fonts,
    ...(prefs.colorMode === "dark" ? theme.dark : theme.light),
  };

  // Apply all CSS vars as inline style overrides
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }

  // Font scale — multiply all clamp()-based text sizes
  root.style.setProperty("--font-scale", String(prefs.fontScale));

  // Reading width
  root.style.setProperty(
    "--reading-pane-inner-max-width",
    READING_WIDTHS[prefs.readingWidth]
  );

  // Color mode classes
  root.setAttribute("data-theme", prefs.colorMode);
  if (prefs.colorMode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeCtxValue {
  prefs: UserPrefs;
  setPrefs: (p: UserPrefs) => void;
  savePrefs: (p: UserPrefs) => Promise<void>;
  /** Legacy toggle for the header sun/moon button */
  toggle: () => void;
  theme: ColorMode;
  themes: ThemeDef[];
}

const ThemeCtx = createContext<ThemeCtxValue>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
  savePrefs: async () => {},
  toggle: () => {},
  theme: DEFAULT_PREFS.colorMode,
  themes: THEMES,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<UserPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  // Load saved preferences from server on mount
  useEffect(() => {
    apiRequest("GET", "/api/preferences")
      .then((r) => (r as Response).json())
      .then((data) => {
        if (data && !data.error) {
          const merged: UserPrefs = { ...DEFAULT_PREFS, ...data };
          setPrefsState(merged);
          applyPrefs(merged);
        } else {
          applyPrefs(DEFAULT_PREFS);
        }
      })
      .catch(() => {
        // Not logged in yet or network error — apply defaults
        applyPrefs(DEFAULT_PREFS);
      })
      .finally(() => setLoaded(true));
  }, []);

  // Re-apply whenever prefs change (live preview)
  useEffect(() => {
    if (loaded) applyPrefs(prefs);
  }, [prefs, loaded]);

  const setPrefs = useCallback((p: UserPrefs) => {
    setPrefsState(p);
  }, []);

  const savePrefs = useCallback(async (p: UserPrefs) => {
    setPrefsState(p);
    await apiRequest("POST", "/api/preferences", p);
  }, []);

  const toggle = useCallback(() => {
    const next: UserPrefs = {
      ...prefs,
      colorMode: prefs.colorMode === "dark" ? "light" : "dark",
    };
    savePrefs(next);
  }, [prefs, savePrefs]);

  return (
    <ThemeCtx.Provider
      value={{
        prefs,
        setPrefs,
        savePrefs,
        toggle,
        theme: prefs.colorMode,
        themes: THEMES,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
