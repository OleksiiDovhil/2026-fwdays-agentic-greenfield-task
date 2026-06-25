"use client";

// Theme mechanism — design.md D3. Resolves light/dark, defaulting to the system
// `prefers-color-scheme`, and reflects the choice as a `data-theme` attribute
// (plus a `dark` class) on the document element that the CSS variables in
// `app/globals.css` key off. No application cookie / no server persistence
// (BC-PRIVACY-03): the preference is in-memory for the session, seeded from the
// OS, so SSR markup matches the OS with no stored-override flash.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seed from the OS preference on the client; "light" is the safe SSR default
  // (it matches the default `:root` tokens, so the server markup is consistent).
  const [theme, setThemeState] = useState<Theme>(() => systemTheme());

  // Reflect the active theme onto the document element whenever it changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

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
