// Test-first (RED): asserts the SPECIFIED Open-Meteo geocoding parse/map contract
// pinned by design.md D2 and the city-search spec ("Suggestion content",
// "Failures and malformed payloads degrade calmly"). The implementation
// (`lib/search/validation.ts`) does NOT exist yet — these MUST fail because the
// module is missing, not because of weak assertions. Never weaken a test to pass
// it; if it contradicts the spec, change it deliberately.
//
// The planned surface (D2, tasks 2.2): a zod schema for the Open-Meteo geocoding
// response matching the pinned payload contract
//   { results?: Array<{ name: string; latitude: number; longitude: number;
//     country?: string; country_code?: string; admin1?: string; id?: number }> }
// plus a TOTAL mapper `parseGeocoding(body: unknown): GeoSuggestion[]` that
// `.safeParse`s the body and projects each result to the minimal
//   GeoSuggestion = { id; name; admin1?; country?; countryCode?; lat; lon }
// (latitude->lat, longitude->lon, country_code->countryCode), using the
// Open-Meteo `id` when present else a deterministic synthetic key.
//
// TOTAL contract: a malformed / partial / non-object body, or a body whose shape
// fails the schema, returns [] and NEVER throws; an absent or empty `results`
// returns [] (valid zero results, not a failure). Out-of-range coordinates are
// rejected/dropped. Mirrors the locked `lib/location/validation.ts` safeParse
// discipline.
//
// @trace FR-SEARCH-01, FR-SEARCH-02
import { describe, it, expect } from "vitest";
import { parseGeocoding } from "@/lib/search/validation";
import type { GeoSuggestion } from "@/lib/search/types";

// A realistic Open-Meteo geocoding payload for "Київ" (one full + one partial
// result). The schema must keep the full result and the mapper must project it.
const KYIV_PAYLOAD = {
  results: [
    {
      id: 703448,
      name: "Київ",
      latitude: 50.45466,
      longitude: 30.5238,
      elevation: 187, // extra Open-Meteo field — must be DROPPED by the mapper
      feature_code: "PPLC", // extra field — dropped
      country_code: "UA",
      country: "Україна",
      admin1: "Київ",
      timezone: "Europe/Kyiv", // extra field — dropped
      population: 2797553, // extra field — dropped
    },
    {
      id: 698740,
      name: "Львів",
      latitude: 49.83826,
      longitude: 24.02324,
      country_code: "UA",
      country: "Україна",
      admin1: "Львівська область",
    },
  ],
  generationtime_ms: 0.51, // sibling metadata — must be ignored
};

describe("lib/search/validation — parseGeocoding maps a real-ish payload (FR-SEARCH-01/02)", () => {
  it("projects each result to the minimal GeoSuggestion shape", () => {
    const out = parseGeocoding(KYIV_PAYLOAD);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);

    const kyiv = out[0];
    // latitude->lat, longitude->lon, country_code->countryCode; numbers stay numeric.
    expect(kyiv.name).toBe("Київ");
    expect(kyiv.lat).toBe(50.45466);
    expect(kyiv.lon).toBe(30.5238);
    expect(kyiv.country).toBe("Україна");
    expect(kyiv.countryCode).toBe("UA");
    expect(kyiv.admin1).toBe("Київ");
    // A stable id is present (Open-Meteo id when available).
    expect(typeof kyiv.id).toBe("string");
    expect(kyiv.id.length).toBeGreaterThan(0);
  });

  it("DROPS every non-contract Open-Meteo field (no elevation/timezone/population leak)", () => {
    const out = parseGeocoding(KYIV_PAYLOAD);
    const kyiv = out[0] as GeoSuggestion & Record<string, unknown>;
    const allowed = new Set([
      "id",
      "name",
      "admin1",
      "country",
      "countryCode",
      "lat",
      "lon",
    ]);
    for (const key of Object.keys(kyiv)) {
      expect(allowed.has(key), `unexpected leaked field "${key}"`).toBe(true);
    }
    // Spot-check the specific noisy fields are gone.
    expect(kyiv.elevation).toBeUndefined();
    expect(kyiv.timezone).toBeUndefined();
    expect(kyiv.population).toBeUndefined();
    expect(kyiv.feature_code).toBeUndefined();
    expect(kyiv.country_code).toBeUndefined(); // renamed to countryCode, not duplicated
  });

  it("produces stable, distinct ids per result (usable as React list keys)", () => {
    const out = parseGeocoding(KYIV_PAYLOAD);
    const ids = out.map((s: GeoSuggestion) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Determinism: parsing the same body twice yields the same ids.
    const again = parseGeocoding(KYIV_PAYLOAD).map((s: GeoSuggestion) => s.id);
    expect(again).toEqual(ids);
  });

  it("synthesizes a deterministic, non-empty id when Open-Meteo omits `id`", () => {
    const out = parseGeocoding({
      results: [
        { name: "Anytown", latitude: 1.5, longitude: 2.5, country_code: "UA" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(typeof out[0].id).toBe("string");
    expect(out[0].id.length).toBeGreaterThan(0);
  });
});

describe("lib/search/validation — optional fields degrade cleanly (FR-SEARCH-02)", () => {
  it("keeps a result that has name + coordinates but no admin1/country/code", () => {
    const out = parseGeocoding({
      results: [{ name: "Bareplace", latitude: 10, longitude: 20 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Bareplace");
    expect(out[0].lat).toBe(10);
    expect(out[0].lon).toBe(20);
    // Absent optionals are simply absent — never the string "undefined".
    expect(out[0].admin1).toBeUndefined();
    expect(out[0].country).toBeUndefined();
    expect(out[0].countryCode).toBeUndefined();
  });
});

describe("lib/search/validation — TOTAL on absent/empty results (zero results != error)", () => {
  it("returns [] for an absent `results` key", () => {
    expect(parseGeocoding({})).toEqual([]);
    expect(parseGeocoding({ generationtime_ms: 0.2 })).toEqual([]);
  });

  it("returns [] for an empty `results` array", () => {
    expect(parseGeocoding({ results: [] })).toEqual([]);
  });
});

describe("lib/search/validation — TOTAL on malformed bodies (never throws, drops bad data)", () => {
  it("returns [] (never throws) for non-object / nullish bodies", () => {
    const hostile: unknown[] = [null, undefined, "results", 42, true, [], NaN];
    for (const body of hostile) {
      expect(() => parseGeocoding(body)).not.toThrow();
      expect(parseGeocoding(body)).toEqual([]);
    }
  });

  it("returns [] when `results` is a string, not an array", () => {
    expect(() => parseGeocoding({ results: "Київ" })).not.toThrow();
    expect(parseGeocoding({ results: "Київ" })).toEqual([]);
  });

  it("does not yield a half-suggestion for an entry missing a required field", () => {
    // A result missing `latitude` (or `longitude`, or `name`) must NOT become a
    // suggestion with an undefined coordinate. Per the spec a body that fails the
    // schema is treated as malformed — the bad entry is dropped (never a
    // half-suggestion). The whole call still returns an array and never throws.
    const out = parseGeocoding({
      results: [
        { name: "NoLat", longitude: 30.5 }, // missing latitude
        { name: "NoLon", latitude: 50.4 }, // missing longitude
        { latitude: 1, longitude: 2 }, // missing name
        { name: "Good", latitude: 3.3, longitude: 4.4, country_code: "UA" },
      ],
    });
    // Whatever the malformed/empty distinction, the result NEVER contains an
    // entry with a non-finite/undefined coordinate or a blank name.
    for (const s of out as GeoSuggestion[]) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lon)).toBe(true);
    }
    // The half-baked entries did not survive as suggestions.
    expect(out.find((s: GeoSuggestion) => s.name === "NoLat")).toBeUndefined();
    expect(out.find((s: GeoSuggestion) => s.name === "NoLon")).toBeUndefined();
  });

  it("rejects/drops out-of-range coordinates (lat ∉ [-90,90], lon ∉ [-180,180])", () => {
    const out = parseGeocoding({
      results: [
        { name: "TooFarN", latitude: 999, longitude: 30, country_code: "UA" },
        { name: "TooFarW", latitude: 10, longitude: -181, country_code: "UA" },
        { name: "OK", latitude: 50.45, longitude: 30.52, country_code: "UA" },
      ],
    });
    // The out-of-range places never appear; every surviving coordinate is in range.
    expect(out.find((s: GeoSuggestion) => s.name === "TooFarN")).toBeUndefined();
    expect(out.find((s: GeoSuggestion) => s.name === "TooFarW")).toBeUndefined();
    for (const s of out as GeoSuggestion[]) {
      expect(s.lat).toBeGreaterThanOrEqual(-90);
      expect(s.lat).toBeLessThanOrEqual(90);
      expect(s.lon).toBeGreaterThanOrEqual(-180);
      expect(s.lon).toBeLessThanOrEqual(180);
    }
  });

  it("never throws on a deeply hostile body", () => {
    expect(() =>
      parseGeocoding({ results: [{ name: { nested: true }, latitude: "x" }] }),
    ).not.toThrow();
    expect(() =>
      parseGeocoding({ results: [null, 5, "x", { latitude: 1 }] }),
    ).not.toThrow();
  });
});
