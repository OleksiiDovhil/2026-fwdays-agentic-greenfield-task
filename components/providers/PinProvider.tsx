"use client";

// The in-memory pinned-city state — design.md D1, §1.2, FR-COMPARE-01, ADR-0003.
//
// A tiny shared context the compare chip row + table both read. "Pin" operates on
// the current active location, so the list needs a small shared home (mirroring the
// established Theme/Location/Weather provider pattern). It holds the list in React
// state ONLY — in-memory, no cookies / no localStorage / no server store
// (ADR-0003, BC-PRIVACY-03); it RESETS on reload. Dedupe + the max-3 cap live HERE
// (not in the component) so they are unit-tested deterministically and the component
// cannot bypass them.
//
// Mounted once in `app/layout.tsx` INSIDE `LocationProvider`, wrapping `{children}`,
// so the pin list is in scope for the whole located subtree.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { keyOf } from "@/lib/compare/key";
import type { Location } from "@/lib/location/types";

/** A pinned city is the LOCKED `Location` shape ({lat, lon, name}) — reused. */
export type PinnedCity = Location;

/** The exact number of cities that can be compared at once (the cap is exactly 3). */
export const MAX_PINS = 3;

export type PinContextValue = {
  /** Ordered, length 0..3, deduped by `keyOf`. */
  pins: PinnedCity[];
  /** Pin a city; dedupe by `keyOf`; a no-op past the cap (surfaced via `atCap`). */
  pin: (city: PinnedCity) => void;
  /** Remove the city with the rounded {lat,lon} `key`. */
  unpin: (key: string) => void;
  /** Whether a city with the rounded `key` is currently pinned. */
  isPinned: (key: string) => boolean;
  /** True at exactly `MAX_PINS` pins (a further pin is refused). */
  atCap: boolean;
};

// A stable empty list for the outside-a-provider default, so a stray consumer reads
// a consistent reference and never crashes.
const EMPTY_PINS: PinnedCity[] = [];

const PinContext = createContext<PinContextValue | null>(null);

export function PinProvider({ children }: { children: ReactNode }) {
  const [pins, setPins] = useState<PinnedCity[]>([]);

  const pin = useCallback((city: PinnedCity) => {
    setPins((current) => {
      // Dedupe by the rounded identity: pinning an already-pinned city is a no-op
      // (no duplicate chip), and two coordinates that round to the same key are the
      // same pin.
      const key = keyOf(city);
      if (current.some((c) => keyOf(c) === key)) return current;
      // Enforce the cap: a pin past MAX_PINS is a no-op (the UI surfaces the cap via
      // `atCap`); never throws, never silently drops an existing pin.
      if (current.length >= MAX_PINS) return current;
      return [...current, city];
    });
  }, []);

  const unpin = useCallback((key: string) => {
    setPins((current) => {
      const next = current.filter((c) => keyOf(c) !== key);
      // Unpinning a key that is not pinned is a calm no-op (same reference back, no
      // needless re-render).
      return next.length === current.length ? current : next;
    });
  }, []);

  const isPinned = useCallback(
    (key: string) => pins.some((c) => keyOf(c) === key),
    [pins],
  );

  const atCap = pins.length >= MAX_PINS;

  const value = useMemo<PinContextValue>(
    () => ({ pins, pin, unpin, isPinned, atCap }),
    [pins, pin, unpin, isPinned, atCap],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

/**
 * Read the pinned-city list + helpers. Outside a provider it returns a SAFE
 * empty-list default with callable no-op helpers (never throws), so a stray
 * consumer degrades calmly rather than crashing — mirroring `useLocation`/
 * `useWeather`/`useTheme`.
 */
export function usePins(): PinContextValue {
  const ctx = useContext(PinContext);
  if (ctx === null) {
    return {
      pins: EMPTY_PINS,
      pin: () => {},
      unpin: () => {},
      isPinned: () => false,
      atCap: false,
    };
  }
  return ctx;
}
