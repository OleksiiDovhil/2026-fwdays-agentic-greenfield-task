// Pure URL parse/serialize for the active-location query string
// `?lat=&lon=&name=` — design.md D2. Framework-free (TC-PURE-01): takes/returns
// plain string maps so it stays DOM-free; the LocationProvider marshals a
// `URLSearchParams` into a plain map before calling `parse`.
import type { Location } from "./types";
import { validateLocation } from "./validation";

/** The query-parameter keys that carry the active location. */
export const LOCATION_PARAM_KEYS = ["lat", "lon", "name"] as const;

/**
 * Decode an untrusted query-parameter map into a validated `Location`, or `null`.
 *
 * Total and side-effect-free: malformed, out-of-range, partial, comma-decimal, or
 * non-finite input all degrade to `null` (the first-load empty state) with no
 * throw, no `NaN`, and no console noise (NFR-OBS-01). The validation logic lives
 * in `validation.ts`; this is the thin string-map adapter over it.
 */
export function parse(params: Record<string, string>): Location | null {
  const result = validateLocation({
    lat: params.lat,
    lon: params.lon,
    name: params.name,
  });
  return result.success ? result.data : null;
}

/**
 * Serialize a `Location` into a `lat`/`lon`/`name` string map suitable for a
 * query string. `serialize` → `parse` is an identity round trip for any valid
 * `Location`.
 */
export function serialize(location: Location): Record<string, string> {
  return {
    lat: String(location.lat),
    lon: String(location.lon),
    name: location.name,
  };
}
