// Reverse-geocode response validation — design.md D2, FR-MAP-03, ADR-0005. A zod
// schema for the OSM Nominatim `jsonv2` reverse response and a TOTAL
// `parseReverseName(body: unknown): ReverseResult`. Framework-free (TC-PURE-01):
// zod only, no `next/*`, no `react`, no DOM — 100% unit-testable.
//
// Mirrors the locked `lib/search/validation.ts` / `lib/location/validation.ts`
// `.safeParse` discipline: the parse is TOTAL — a malformed / partial / non-object
// body, an `{ error }` body, or a body with no usable name (incl. empty-after-trim)
// degrades to `{ name: null }` and NEVER throws to the UI (so the caller falls back
// to a coordinate label).
//
// NOTE (no-hallucination): Nominatim's reverse `address` sub-keys vary by place, so
// the schema is written PERMISSIVELY — every field optional, every field `.catch()`-
// ed to `undefined` so a single wrong-typed field never poisons the whole parse —
// and the parser PREFERS the most city-like locality, else the top-level
// `display_name`. The permissive schema tolerates the real shape.
import { z } from "zod";
import type { ReverseResult } from "./types";

// The maximum resolved-name length — matches the `Location.name` bound (120) in
// `lib/location/validation.ts`, so a name this parser yields always fits the
// active-location schema downstream.
const MAX_NAME_LENGTH = 120;

// A tolerant optional string field: a string is trimmed; ANY non-string (number,
// object, null, array) degrades to `undefined` via `.catch` rather than failing
// the whole-object parse. So a body with one bad locality field still yields the
// other usable fields (permissive, total).
const optionalString = z.string().trim().optional().catch(undefined);

// The Nominatim reverse `address` object — every locality field optional + tolerant.
// Unknown keys (postcode, country, ISO codes, …) are stripped; they never matter.
const addressSchema = z
  .object({
    city: optionalString,
    town: optionalString,
    village: optionalString,
    municipality: optionalString,
    county: optionalString,
    state: optionalString,
  })
  .optional()
  .catch(undefined);

// The top-level reverse response. `display_name` is the comma-joined fallback
// label; `address` carries the locality fields. An `{ error }` body simply has no
// usable name (its `error` key is ignored, both nested fields absent → null).
// `.catch({})` makes a non-object / array / primitive body parse to `{}` (no name).
const reverseSchema = z
  .object({
    display_name: optionalString,
    address: addressSchema,
  })
  .catch({});

/** A trimmed, non-empty, length-bounded candidate, or `null` if unusable. */
function usable(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

/**
 * Map a Nominatim reverse body to the minimal `{ name }` contract. PREFERS the
 * most city-like locality (city ?? town ?? village ?? municipality ?? county ??
 * state), else falls back to the top-level `display_name`; trimmed, length-bounded
 * (≤ 120). TOTAL: a malformed / `{ error }` / empty-after-trim body → `{ name: null }`,
 * NEVER throws.
 */
export function parseReverseName(body: unknown): ReverseResult {
  // `.catch` on every leaf + the objects makes this safeParse effectively always
  // succeed with a (possibly empty) projection; guard the result regardless.
  const parsed = reverseSchema.safeParse(body);
  if (!parsed.success) {
    return { name: null };
  }
  const { display_name, address } = parsed.data;

  // The city-like preference chain (most specific locality first), then the
  // comma-joined display_name. The first usable (non-empty after trim) wins.
  const name =
    usable(address?.city) ??
    usable(address?.town) ??
    usable(address?.village) ??
    usable(address?.municipality) ??
    usable(address?.county) ??
    usable(address?.state) ??
    usable(display_name);

  return { name };
}
