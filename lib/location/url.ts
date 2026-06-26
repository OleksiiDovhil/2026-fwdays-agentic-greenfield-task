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
 * Format a finite coordinate as a PLAIN-DECIMAL string with NO exponent notation,
 * trailing zeros trimmed. This is the root fix for a real round-trip bug: `String`
 * (and `JSON`) render a small magnitude in exponent form — `String(1e-7) === "1e-7"`
 * — which `validation.ts`'s `DOT_DECIMAL` (`/^-?\d+(?:\.\d+)?$/`) REJECTS on
 * re-parse, so a coordinate very close to the equator/meridian (e.g. a map click
 * within ~1e-6° of lat 0 / lon 0) would serialize to a string that `parse` then
 * rejects → the active location (and the forecast) silently reset to empty. Any
 * coordinate source (search, geolocation, a map click) must round-trip, so the fix
 * lives HERE in the shared layer, not only at the call sites.
 *
 * `toFixed(12)` never uses exponent notation for in-range coordinates (|v| < 1e21)
 * and gives sub-millimetre precision (12 decimals ≈ 1e-7 m); trimming the trailing
 * zeros + any trailing dot keeps the URL clean and an integer/short value compact,
 * and `Number(plainDecimal(v))` recovers `v`. `-0` normalizes to `"0"`.
 */
function plainDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const v = Object.is(value, -0) ? 0 : value;
  let s = v.toFixed(12);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

/**
 * Serialize a `Location` into a `lat`/`lon`/`name` string map suitable for a
 * query string. `serialize` → `parse` is an identity round trip for EVERY valid
 * `Location`, including coordinates near the equator/meridian (no exponent
 * notation — see `plainDecimal`).
 */
export function serialize(location: Location): Record<string, string> {
  return {
    lat: plainDecimal(location.lat),
    lon: plainDecimal(location.lon),
    name: location.name,
  };
}
