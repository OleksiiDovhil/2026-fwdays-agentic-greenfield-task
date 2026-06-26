// Test-first (RED): asserts the SPECIFIED pure reverse-geocode parse contract
// pinned by design.md D2 and the map spec ("Click-to-relocate via reverse
// geocoding…", "Malformed reverse-geocode payload is treated as no usable
// place"). The implementation (`lib/geo/reverse-validation.ts`) does NOT exist
// yet — these MUST fail because the module is MISSING, not because of weak
// assertions. Never weaken a test to pass it; if it contradicts the spec, change
// it deliberately.
//
// The planned surface (D2, tasks 2.2, 5.1): a zod schema for the OSM Nominatim
// `jsonv2` reverse response and a TOTAL `parseReverseName(body: unknown):
// ReverseResult` (`ReverseResult = { name: string | null }`). The Nominatim body
// carries a top-level `display_name` (a comma-joined label), `name`, and an
// `address` object with locality fields (city / town / village / municipality /
// county / state / country / country_code); an out-of-bounds / sea click returns
// an `{ error: ... }` object. The parser PREFERS the most city-like locality
// (city ?? town ?? village ?? municipality ?? county ?? state), else falls back
// to the top-level `display_name`, trimmed and length-bounded (<= 120, matching
// `Location.name`).
//
// TOTAL contract (mirrors `lib/search/validation.ts` .safeParse discipline): a
// malformed / partial / non-object body, an `{ error }` body, or a body with no
// usable name (incl. empty-after-trim) -> `{ name: null }` and NEVER throws to
// the UI (so the caller falls back to a coordinate label).
//
// @trace FR-MAP-03
import { describe, it, expect } from "vitest";
import { parseReverseName } from "@/lib/geo/reverse-validation";
import type { ReverseResult } from "@/lib/geo/types";

// A realistic Nominatim `jsonv2` reverse body for a point in Odesa: a top-level
// `display_name` + `name` and an `address` object with a city-like locality. The
// parser must prefer the city-like locality and drop the rest.
const ODESA_BODY = {
  place_id: 12345678,
  licence: "Data © OpenStreetMap contributors, ODbL 1.0...",
  osm_type: "relation",
  osm_id: 1234567,
  lat: "46.4843023",
  lon: "30.7322878",
  category: "boundary",
  type: "administrative",
  place_rank: 12,
  importance: 0.71,
  addresstype: "city",
  name: "Одеса",
  display_name: "Одеса, Одеський район, Одеська область, 65000, Україна",
  address: {
    city: "Одеса",
    municipality: "Одеська міська громада",
    county: "Одеський район",
    state: "Одеська область",
    "ISO3166-2-lvl4": "UA-51",
    postcode: "65000",
    country: "Україна",
    country_code: "ua",
  },
  boundingbox: ["46.3", "46.6", "30.6", "30.8"],
};

// A point over open water: Nominatim returns an `{ error }` body (no place).
const SEA_BODY = { error: "Unable to geocode" };

describe("lib/geo/reverse-validation — parseReverseName maps a real-ish Nominatim body (FR-MAP-03)", () => {
  it("returns the most city-like locality (Одеса) from a full reverse body", () => {
    const out: ReverseResult = parseReverseName(ODESA_BODY);
    expect(out.name).toBe("Одеса");
  });

  it("prefers the city-like locality OVER the long comma-joined display_name", () => {
    const out = parseReverseName(ODESA_BODY);
    // It must NOT return the verbose "Одеса, Одеський район, …" display_name when
    // a clean city-like locality is available.
    expect(out.name).toBe("Одеса");
    expect(out.name).not.toContain(",");
  });

  it("follows the city ?? town ?? village ?? municipality ?? county ?? state preference chain", () => {
    // Only `town` present among the city-like fields -> town wins.
    expect(
      parseReverseName({
        display_name: "Деражня, Хмельницька область, Україна",
        address: { town: "Деражня", state: "Хмельницька область", country_code: "ua" },
      }).name,
    ).toBe("Деражня");

    // Only `village` present -> village wins.
    expect(
      parseReverseName({
        display_name: "Гаврилівка, Київська область, Україна",
        address: { village: "Гаврилівка", state: "Київська область" },
      }).name,
    ).toBe("Гаврилівка");

    // No city/town/village/municipality/county, only `state` -> state is used
    // (the last rung of the locality chain before display_name).
    expect(
      parseReverseName({
        display_name: "Полтавська область, Україна",
        address: { state: "Полтавська область", country: "Україна" },
      }).name,
    ).toBe("Полтавська область");
  });

  it("falls back to the top-level display_name when the address has no usable locality", () => {
    const out = parseReverseName({
      display_name: "M05, Одеський район, Одеська область, Україна",
      address: { road: "M05", country: "Україна", country_code: "ua" },
    });
    // No city/town/village/municipality/county/state -> the comma-joined
    // display_name is the fallback label (trimmed, bounded).
    expect(out.name).toBe("M05, Одеський район, Одеська область, Україна");
  });

  it("trims and length-bounds the resolved name to <= 120 chars (matches Location.name)", () => {
    const longName = "Н".repeat(400);
    const out = parseReverseName({
      display_name: `  ${longName}  `,
      address: {},
    });
    expect(out.name).not.toBeNull();
    expect((out.name as string).length).toBeLessThanOrEqual(120);
    // Trimmed: no leading/trailing whitespace survives.
    expect(out.name).toBe((out.name as string).trim());

    // A city-like locality with surrounding whitespace is trimmed too.
    expect(parseReverseName({ address: { city: "  Львів  " } }).name).toBe("Львів");
  });
});

describe("lib/geo/reverse-validation — TOTAL: malformed / empty / error bodies -> { name: null }, never throws (FR-MAP-03)", () => {
  it("returns { name: null } for an `{ error }` body (out-of-bounds / sea click)", () => {
    expect(() => parseReverseName(SEA_BODY)).not.toThrow();
    expect(parseReverseName(SEA_BODY)).toEqual({ name: null });
  });

  it("returns { name: null } for non-object / nullish / primitive bodies, never throws", () => {
    const hostile: unknown[] = [null, undefined, "Одеса", 42, true, [], NaN];
    for (const body of hostile) {
      expect(() => parseReverseName(body)).not.toThrow();
      expect(parseReverseName(body)).toEqual({ name: null });
    }
  });

  it("returns { name: null } when there is no usable locality AND no display_name", () => {
    expect(parseReverseName({ address: { country: "Україна", country_code: "ua" } })).toEqual({
      name: null,
    });
    expect(parseReverseName({})).toEqual({ name: null });
    expect(parseReverseName({ address: {} })).toEqual({ name: null });
  });

  it("returns { name: null } for a whitespace-only name (empty-after-trim is not usable)", () => {
    expect(parseReverseName({ address: { city: "   " } })).toEqual({ name: null });
    expect(parseReverseName({ display_name: "   \t  \n " })).toEqual({ name: null });
    expect(parseReverseName({ address: { city: "" }, display_name: "" })).toEqual({ name: null });
  });

  it("never throws on a deeply hostile body and never returns a non-string/non-null name", () => {
    const hostile: unknown[] = [
      { address: { city: { nested: true } }, display_name: 5 },
      { address: 42, display_name: ["x"] },
      { address: { city: 123, town: null }, name: {} },
      { error: { code: 500, detail: "boom" } },
    ];
    for (const body of hostile) {
      expect(() => parseReverseName(body)).not.toThrow();
      const out = parseReverseName(body);
      expect(out.name === null || typeof out.name === "string").toBe(true);
    }
  });

  it("is deterministic: the same body parses to the same result twice", () => {
    expect(parseReverseName(ODESA_BODY)).toEqual(parseReverseName(ODESA_BODY));
  });
});
