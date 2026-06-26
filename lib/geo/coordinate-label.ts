// Pure coordinate helpers — design.md D2, FR-MAP-03. Framework-free (TC-PURE-01):
// plain TS only, no `next/*`, no `react`, no DOM. Both helpers are TOTAL — defined
// for every input, never throw to the UI — so the antimeridian / fallback
// behaviour is unit-tested deterministically without a map.
import type { LatLon } from "./types";

// A fixed, small display precision for the coordinate fallback label. Four
// decimals (~11 m at the equator) is plenty for a human-readable popup label and
// keeps the string stable + short — the raw float tail must NOT survive (the spec
// wants a rounded label, not a 14-digit float).
const LABEL_PRECISION = 4;

// The precision the NORMALIZED coordinates are rounded to (~0.1 m). Rounding the
// click coords here (a) keeps them clean for the URL round-trip — the shared
// `lib/location/url.ts` serializer renders plain decimals, and a rounded coord has
// a short, exact decimal form — and (b) lets the snap below collapse a click within
// ~1e-6° of the equator/meridian to an exact 0, so it never produces a tiny float
// that could otherwise have surfaced as exponent notation. 6 decimals leaves a
// real city's coordinate (≤ 4–5 meaningful decimals) unchanged.
const COORD_PRECISION = 6;

/** Coerce to a finite number; a non-finite input degrades to a safe `0`. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Round a coordinate to `COORD_PRECISION` decimals and SNAP a sub-precision
 * magnitude to exactly `0` (so a click ~1e-7° off the equator/meridian yields a
 * clean, round-trippable `0`, not a tiny float). `Number(toFixed())` drops trailing
 * zeros to the shortest exact decimal form.
 */
function roundCoord(value: number): number {
  const rounded = Number(value.toFixed(COORD_PRECISION));
  // `toFixed` already snaps |value| < 0.5e-6 to "0.000000" → 0; normalize -0 to 0.
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Clamp `value` into [`min`, `max`]. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Normalize a raw click coordinate pair (Leaflet can yield out-of-range /
 * past-the-antimeridian values) into a finite, in-range pair:
 *   - latitude is CLAMPED to [-90, 90] (e.g. 95 → 90, -95 → -90);
 *   - longitude is WRAPPED into [-180, 180] (e.g. 190.5 → -169.5, -181 → 179),
 *     so a full revolution lands back in range.
 * A non-finite input (NaN / ±Infinity) degrades to a safe `0`, never `NaN`, so
 * every downstream consumer (marker, popup, centre, reverse request, forecast)
 * receives an in-range coordinate. TOTAL: never throws.
 */
export function normalizeLatLon(lat: number, lon: number): LatLon {
  const safeLat = clamp(finiteOr(lat, 0), -90, 90);

  const safeLonInput = finiteOr(lon, 0);
  // An already-in-range longitude is returned UNCHANGED by the wrap (the wrap
  // arithmetic would introduce float drift, e.g. 30.7233 → 30.7232999…); only an
  // out-of-range value is wrapped into [-180, 180).
  const wrapped =
    safeLonInput >= -180 && safeLonInput <= 180
      ? safeLonInput
      : // Wrap into [-180, 180): shift to [0, 360), modulo, shift back. The
        // double-modulo keeps the result non-negative before the final shift even
        // for inputs below -180. `180` stays `180` (handled by the in-range branch).
        (((safeLonInput + 180) % 360) + 360) % 360 - 180;

  // Round both components (and snap a sub-1e-6 magnitude to exactly 0) so the
  // clicked coordinates are clean and round-trip through the URL serializer — a
  // click near the equator/meridian must still set a USABLE location, never reset
  // to empty (the equator/meridian-reset class). A real city's coord is unchanged.
  return { lat: roundCoord(safeLat), lon: roundCoord(wrapped) };
}

/** Round a finite number to the fixed label precision (away-from-zero on .5). */
function roundForLabel(value: number): number {
  const factor = 10 ** LABEL_PRECISION;
  // `Number()` re-parses the toFixed string so a trailing-zero artifact ("50.4500")
  // collapses to the shortest form ("50.45") — a stable, rounded value.
  return Number((Math.round(value * factor) / factor).toFixed(LABEL_PRECISION));
}

/**
 * A stable, rounded `"lat, lon"` display label, used as the marker-popup name
 * when no reverse name resolves. Dot-decimal (the locale-agnostic minus), a fixed
 * small precision (not the full float). TOTAL over any finite input; a non-finite
 * component degrades to `0` (via the rounding path) and the function never throws.
 */
export function coordinateLabel(lat: number, lon: number): string {
  const safeLat = roundForLabel(finiteOr(lat, 0));
  const safeLon = roundForLabel(finiteOr(lon, 0));
  // `String(Number)` is locale-agnostic: always a dot-decimal and an ASCII minus,
  // independent of the host locale (never a decimal comma).
  return `${String(safeLat)}, ${String(safeLon)}`;
}
