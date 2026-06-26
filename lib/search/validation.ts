// Pure, framework-free parse + map for the Open-Meteo geocoding response —
// design.md D2, FR-SEARCH-01/02. zod only: no `next/*`, no `react`, no DOM
// (TC-PURE-01), so it is unit-tested deterministically against a real-ish payload
// and against malformed/empty bodies without a server or jsdom. Mirrors the
// locked `lib/location/validation.ts` `.safeParse` discipline.
//
// TOTAL contract: a malformed / partial / non-object body, or a body whose shape
// fails the schema, maps to an EMPTY list and NEVER throws to the UI; an absent
// or empty `results` is VALID and means zero results (not a failure). A single
// bad result entry is dropped (never a half-suggestion); out-of-range coordinates
// are rejected.
import { z } from "zod";
import type { GeoSuggestion } from "./types";

// One Open-Meteo geocoding result. `name`, `latitude`, `longitude` are REQUIRED
// (an entry missing any of them is not a usable place — it is dropped, never a
// half-suggestion). Coordinates are bound-checked so an out-of-range value is
// rejected. Every other Open-Meteo field (elevation, timezone, population,
// feature_code, …) is simply not in the schema and is dropped by the mapper.
const resultSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
});

// The top-level body. `results` is an optional array; an absent `results` is a
// valid "zero results" body. We parse `results` permissively at the array level
// (each ELEMENT is validated individually below) so one malformed entry does not
// discard the whole, otherwise-good list.
const bodySchema = z.object({
  results: z.array(z.unknown()).optional(),
});

/** Project one validated upstream result to the minimal `GeoSuggestion`. */
function toSuggestion(r: z.infer<typeof resultSchema>): GeoSuggestion {
  return {
    // Open-Meteo id when present, else a deterministic synthetic key so React
    // list keys stay stable across re-parses of the same body.
    id: r.id !== undefined ? String(r.id) : `${r.latitude},${r.longitude},${r.name}`,
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    ...(r.admin1 !== undefined ? { admin1: r.admin1 } : {}),
    ...(r.country !== undefined ? { country: r.country } : {}),
    ...(r.country_code !== undefined ? { countryCode: r.country_code } : {}),
  };
}

/**
 * A discriminated parse result for callers (the route handler) that must
 * distinguish a STRUCTURALLY MALFORMED body (`ok: false` — treat like a failed
 * fetch, show the error Notice) from a valid body that simply has no matches
 * (`ok: true, suggestions: []` — zero results, not an error). Never throws.
 */
export type ParseResult =
  | { ok: true; suggestions: GeoSuggestion[] }
  | { ok: false };

/**
 * Total, discriminated parse of an untrusted geocoding body.
 *
 * - A non-object / nullish body, or one whose top-level shape fails the schema
 *   (e.g. `results` is a string), is STRUCTURALLY MALFORMED → `{ ok: false }`.
 * - A valid body (incl. an absent or empty `results`) → `{ ok: true, suggestions }`,
 *   where each element is validated individually and a malformed element (missing
 *   a required field, out-of-range coordinate, wrong types) is DROPPED.
 *
 * Never throws — the worst input degrades to `{ ok: false }`.
 */
export function parseGeocodingResult(body: unknown): ParseResult {
  const top = bodySchema.safeParse(body);
  if (!top.success) return { ok: false };

  const rawResults = top.data.results ?? [];
  const suggestions: GeoSuggestion[] = [];
  for (const entry of rawResults) {
    const parsed = resultSchema.safeParse(entry);
    if (parsed.success) suggestions.push(toSuggestion(parsed.data));
  }
  return { ok: true, suggestions };
}

/**
 * Total mapper: `.safeParse`s the body and projects each valid result to the
 * minimal `GeoSuggestion`. A malformed / partial / non-object body, or a body
 * whose shape fails the schema, returns `[]`; an absent or empty `results`
 * returns `[]`. NEVER throws.
 */
export function parseGeocoding(body: unknown): GeoSuggestion[] {
  const result = parseGeocodingResult(body);
  return result.ok ? result.suggestions : [];
}
