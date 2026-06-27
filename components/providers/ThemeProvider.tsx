"use client";

// Theme mechanism — design.md D3. Resolves light/dark, defaulting to the system
// `prefers-color-scheme`, and reflects an EXPLICIT choice as a `data-theme`
// attribute on the document element that the CSS variables in `app/globals.css`
// key off. No application cookie / no server persistence (BC-PRIVACY-03): the
// preference is in-memory for the session.
//
// HYDRATION SAFETY (NFR-OBS-01 "console clean on a healthy session"): the OS
// preference is read via `useSyncExternalStore`, whose SERVER snapshot ("light",
// matching the default `:root` tokens) is used for BOTH the SSR render AND the
// first client (hydration) render — so a dark-OS visitor's header toggle markup
// agrees server-vs-client and never trips a hydration mismatch. React adopts the
// real OS preference immediately after hydration. Reading matchMedia in a
// `useState` initializer (the previous approach) diverged server-vs-client and
// warned on every dark-OS first paint.
//
// NO FLASH: while the visitor FOLLOWS the system (no explicit toggle), no
// `data-theme` is written — the `@media (prefers-color-scheme: dark)` block in
// globals.css already paints the OS theme (`:root:not([data-theme="light"])`), so
// a dark-OS visitor sees dark from the first paint. `data-theme` is set ONLY once
// the visitor explicitly overrides, which is the only case the CSS default cannot
// cover. (No Tailwind `dark:` utilities exist, so the removed `dark` class was
// dead weight.)
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

// ── System color-scheme as an external store (hydration-safe) ────────────────
// Subscribe so the control re-renders when the OS preference flips mid-session.
function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(DARK_QUERY);
  if (typeof mq.addEventListener !== "function") return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
// Client snapshot: the live OS preference.
function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}
// Server snapshot: the safe "light" default (matches the `:root` tokens). Used for
// SSR AND the first hydration render so they always agree (no mismatch).
function getServerTheme(): Theme {
  return "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The OS preference, hydration-safe: SSR and the first client render both see
  // "light" (the server snapshot); React adopts the real value post-hydration.
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerTheme,
  );
  // The visitor's EXPLICIT override, or null to FOLLOW the system. Session-only
  // (no cookie / server store, BC-PRIVACY-03). null at hydration → the header
  // toggle reflects `systemTheme`, which is "light" then, on every device.
  const [override, setOverride] = useState<Theme | null>(null);
  const theme: Theme = override ?? systemTheme;

  // Reflect an EXPLICIT choice onto the document element. While following the
  // system (override === null) we write nothing — globals.css's
  // prefers-color-scheme default already paints the OS theme, so there is no
  // first-paint flash and no server/client `data-theme` divergence.
  useEffect(() => {
    if (override !== null) applyTheme(override);
  }, [override]);

  // An explicit choice always WINS over the system preference.
  const setTheme = useCallback((next: Theme) => {
    setOverride(next);
  }, []);

  // Flip relative to the CURRENTLY shown theme (the system value, or a prior
  // override) — so the first toggle on a dark-OS device goes to light, not dark.
  const toggleTheme = useCallback(() => {
    setOverride(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Read the active theme + controls. Falls back to a light, no-op default outside
 * a provider so a stray consumer never crashes (honest empty state).
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    return { theme: "light", setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}
