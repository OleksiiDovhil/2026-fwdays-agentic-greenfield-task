"use client";

// The shared cross-slice weather context — design.md D1 (the ADR-worthy
// integration). A tiny in-memory relay: the `forecast` capability owns the ONLY
// weather fetch (TC-DATA-01, NFR-COST-01), and `ForecastSection` PUBLISHES the
// active location's today-weather summary into here; the decorative
// `WeatherBackground` CONSUMES it via `useWeather()`. This provider holds NO
// fetch and NO persistence — the snapshot lives in React state for the session
// only (in-memory, ADR-0003: no cookies / localStorage / server store).
//
// Mounted once in `app/layout.tsx` INSIDE `LocationProvider`, wrapping
// `{children}` so it spans BOTH the `<WeatherBackground/>` and the
// `<ShellContent/>`/`<ForecastSection/>` subtrees (siblings in `app/page.tsx`).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WeatherCategory } from "@/lib/forecast/weather-code";

/**
 * The active location's today-weather summary the background reads.
 * `WeatherCategory` is IMPORTED from the locked `lib/forecast/weather-code.ts`
 * (the cross-capability contract) — this provider does NOT redefine it.
 */
export type WeatherSnapshot = {
  /** Today's day/night-agnostic category, or `null` when not loaded. */
  todayCategory: WeatherCategory | null;
  /** Today's location-local ISO sunrise ("YYYY-MM-DDTHH:MM"), or `null`. */
  sunrise: string | null;
  /** Today's location-local ISO sunset, or `null`. */
  sunset: string | null;
  /**
   * The ACTIVE LOCATION's UTC offset in seconds (Open-Meteo `utc_offset_seconds`),
   * so a consumer can place the absolute "now" into the location's frame for the
   * day/night decision (FR-ANIM-02). OPTIONAL: the forecast publishes it on the
   * LOADED snapshot only; the not-loaded default omits it (and is treated as the
   * day fallback regardless), which keeps that default a minimal, stable shape.
   */
  utcOffsetSeconds?: number | null;
  /** Whether a validated forecast is available (false → the calm fallback). */
  isLoaded: boolean;
};

export type WeatherContextValue = {
  /** The current in-memory snapshot every consumer reads. */
  weather: WeatherSnapshot;
  /** Replace the snapshot (latest-wins relay, no merge). */
  publish: (next: WeatherSnapshot) => void;
};

/**
 * The not-loaded default: no location / no forecast / failed-or-invalid fetch.
 * Returned outside a provider (a stray consumer never crashes, mirroring
 * `useLocation`/`useTheme`) and as the initial in-provider value.
 *
 * Deliberately a minimal shape: `utcOffsetSeconds` is OMITTED here (it is an
 * optional snapshot field the forecast adds only on the loaded path). The
 * not-loaded snapshot always renders the calm DAY fallback, so the offset is moot
 * in this state — and omitting it keeps this default the stable, exact shape the
 * provider's contract tests pin.
 */
export const NOT_LOADED_WEATHER: WeatherSnapshot = {
  todayCategory: null,
  sunrise: null,
  sunset: null,
  isLoaded: false,
};

const WeatherContext = createContext<WeatherContextValue | null>(null);

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [weather, setWeather] = useState<WeatherSnapshot>(NOT_LOADED_WEATHER);

  // Latest-wins: a publish REPLACES the prior snapshot wholesale (no merge), so
  // a not-loaded publish after a loaded one honestly clears the background.
  const publish = useCallback((next: WeatherSnapshot) => {
    setWeather(next);
  }, []);

  const value = useMemo<WeatherContextValue>(
    () => ({ weather, publish }),
    [weather, publish],
  );

  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
}

/**
 * Read the current weather snapshot + the publisher. Outside a provider it
 * returns the not-loaded default and a no-op `publish` (never throws) so a stray
 * consumer degrades to the calm fallback rather than crashing.
 */
export function useWeather(): WeatherContextValue {
  const ctx = useContext(WeatherContext);
  if (ctx === null) {
    return { weather: NOT_LOADED_WEATHER, publish: () => {} };
  }
  return ctx;
}
