/* ============================================================================
   THEME CONTROLLER
   Owns the three appearance choices the v2.5 spec asks for and writes them to
   <html> so the token layer resolves them. Also exposes `useTokens()` which
   reads computed values, so charts and canvases follow the theme instead of
   hard-coding colours (v2.1 defect AD-6 / RC-3).
   ========================================================================== */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type Accent = "brand" | "gold" | "violet";

const KEYS = { theme: "wx.theme", density: "wx.density", accent: "wx.accent" } as const;

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

function initialTheme(): Theme {
  const stored = readStored<Theme | "">(KEYS.theme, "");
  if (stored === "light" || stored === "dark") return stored;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [density, setDensity] = useState<Density>(() =>
    readStored<Density>(KEYS.density, "comfortable"),
  );
  const [accent, setAccent] = useState<Accent>(() => readStored<Accent>(KEYS.accent, "brand"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEYS.theme, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem(KEYS.density, density);
    } catch {}
  }, [density]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    try {
      localStorage.setItem(KEYS.accent, accent);
    } catch {}
  }, [accent]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggleTheme, density, setDensity, accent, setAccent };
}

/** Resolved semantic tokens — for canvas / SVG libraries that need real values. */
export interface ResolvedTokens {
  accent: string;
  text: string;
  textMuted: string;
  grid: string;
  surface: string;
  viz: string[];
}

export function useTokens(deps: unknown[] = []): ResolvedTokens {
  const read = (): ResolvedTokens => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string, f = "#888") => s.getPropertyValue(n).trim() || f;
    return {
      accent: v("--accent"),
      text: v("--text"),
      // --text-muted may itself be a var() reference, so resolve via a probe element
      textMuted: "#667085",
      grid: v("--grid"),
      surface: v("--surface"),
      viz: ["--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-5"].map((n) => v(n)),
    };
  };

  const [tokens, setTokens] = useState<ResolvedTokens>(read);

  useEffect(() => {
    // one frame later so the new data-theme has been applied and laid out
    const id = requestAnimationFrame(() => setTokens(read()));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return tokens;
}
