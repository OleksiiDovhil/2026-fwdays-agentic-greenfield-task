// Active-location validation — design.md D2. A zod schema that is TOTAL (never
// throws to the UI via `.safeParse`) and rejects every malformed / out-of-range /
// partial / comma-decimal input the spec marks invalid. Framework-free
// (TC-PURE-01): zod only, no `next/*`, no `react`, no DOM.
import { z } from "zod";
import type { Location } from "./types";

// A coordinate arrives as an untrusted STRING from the URL query. Accept a plain
// DOT-decimal number only — leading minus, integer part, optional dot fraction.
// This regex is the gatekeeper that rejects:
//   - comma decimals ("50,45")  → degrade to empty state, never coerce (D2)
//   - non-numeric ("abc")
//   - non-finite tokens ("NaN", "Infinity", "-Infinity")
//   - exponent forms ("1e999") that could parse to Infinity
// Only after this passes do we convert to a number and bound-check the range.
const DOT_DECIMAL = /^-?\d+(?:\.\d+)?$/;

const coordinate = (min: number, max: number) =>
  z
    .string()
    .regex(DOT_DECIMAL)
    .transform((value) => Number(value))
    // `Number()` of a DOT_DECIMAL match is always finite, but assert it anyway so
    // the type narrows to a guaranteed-finite number for downstream consumers.
    .pipe(z.number().finite().min(min).max(max));

/**
 * The active-location schema. Input is a raw, string-keyed candidate (e.g. the
 * URL query map); output (on success) is a typed `Location` with numeric
 * coordinates. `name` is trimmed, must be non-empty after trimming, and bounded
 * to 120 characters.
 */
export const locationSchema = z.object({
  lat: coordinate(-90, 90),
  lon: coordinate(-180, 180),
  name: z.string().trim().min(1).max(120),
});

/** Discriminated, total result — success carries the typed `Location`. */
export type ValidationResult =
  | { success: true; data: Location }
  | { success: false };

/**
 * Total validation helper: validates a raw candidate and returns a discriminated
 * success/failure. Never throws — the worst input degrades to `{ success: false }`,
 * which the caller (`lib/location/url.ts`) maps to `null` (the empty state).
 */
export function validateLocation(candidate: unknown): ValidationResult {
  const result = locationSchema.safeParse(candidate);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false };
}
