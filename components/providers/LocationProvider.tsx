"use client";

// The shared active-location mechanism — design.md D2. This is the ONLY
// `next/navigation` touch-point for URL-as-state; all parse/serialize/validate
// logic lives pure in `lib/location/*` (TC-PURE-01). City-search / map /
// forecast / animated-background / weekend-compare consume `useLocation()` and
// MUST NOT re-parse the raw URL (spec: downstream reads the validated state).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Location } from "@/lib/location/types";
import { parse, serialize } from "@/lib/location/url";

type LocationContextValue = {
  /** The validated active location, or `null` for the first-load empty state. */
  location: Location | null;
  /** Set (or clear with `null`) the active location, syncing the URL via replace. */
  setLocation: (next: Location | null) => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Marshal the DOM `URLSearchParams` into a plain string map for the pure
  // `parse`, then validate. A malformed / partial / out-of-range / comma-decimal
  // query degrades to `null` (empty state) with no throw, no NaN, no console
  // noise (NFR-OBS-01). Memoized on the serialized query so it only re-parses
  // when the location params actually change.
  const queryKey = searchParams?.toString() ?? "";
  const location = useMemo<Location | null>(() => {
    const map: Record<string, string> = {};
    const lat = searchParams?.get("lat");
    const lon = searchParams?.get("lon");
    const name = searchParams?.get("name");
    if (lat !== null && lat !== undefined) map.lat = lat;
    if (lon !== null && lon !== undefined) map.lon = lon;
    if (name !== null && name !== undefined) map.name = name;
    return parse(map);
    // queryKey captures the param string; searchParams is the read source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const setLocation = useCallback(
    (next: Location | null) => {
      const base = pathname || "/";
      if (next === null) {
        // Clearing returns to the bare path → back to the empty state.
        router.replace(base);
        return;
      }
      const query = new URLSearchParams(serialize(next)).toString();
      // REPLACE, not push: the active location stays shareable/reloadable but
      // does not spam history (D2). No full navigation (FR-SHELL-01).
      router.replace(`${base}?${query}`);
    },
    [router, pathname],
  );

  const value = useMemo<LocationContextValue>(
    () => ({ location, setLocation }),
    [location, setLocation],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

/**
 * Read the validated active location and the setter. Returns a safe empty-state
 * default when used outside a provider so a stray consumer never crashes the
 * shell (the empty state is always honest).
 */
export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (ctx === null) {
    return { location: null, setLocation: () => {} };
  }
  return ctx;
}
