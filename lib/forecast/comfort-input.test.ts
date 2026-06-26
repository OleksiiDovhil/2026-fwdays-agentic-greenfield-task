// Test-first (RED): asserts the SPECIFIED daily→comfort bridge pinned by design.md
// D2 ("a small toComfortInput(day) mapper — the only place the daily→comfort field
// names are bridged") and the forecast spec ("the comfort capability has a single
// defined source for every factor it scores", FR-COMFORT-02). The implementation
// (`lib/forecast/types.ts` `toComfortInput`) does NOT exist yet — these MUST fail
// because the module is MISSING, not because of weak assertions. Never weaken a
// test to make it pass.
//
// Distinct from validation.test.ts (which exercises toComfortInput on PARSED days):
// here the input is a HAND-BUILT DailyForecast, so the mapper's exact field
// contract — and the round-trip `comfortScore(toComfortInput(day))` producing a
// valid badge value — is pinned independently of the zod parse.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.
//
// @trace FR-COMFORT-02, FR-FORECAST-01
import { describe, it, expect } from "vitest";
import { comfortScore, bandOf } from "@/lib/scoring/comfort";
import type { ComfortInput } from "@/lib/scoring/types";
import type { DailyForecast } from "@/lib/forecast/types";

async function loadTypes() {
  return import("@/lib/forecast/types");
}

// A fully-populated DailyForecast (every field present) — both the comfort
// factors and the display-only fields, so we can assert the mapper takes EXACTLY
// the comfort factors and renames windMax → windSpeed.
const FULL_DAY: DailyForecast = {
  time: "2026-06-27",
  weatherCode: 3,
  tempMax: 24,
  tempMin: 14,
  apparentHigh: 22,
  apparentLow: 12,
  precipProbability: 30,
  windMax: 5,
  cloudCover: 40,
  uvIndex: 6,
  sunrise: "2026-06-27T05:00",
  sunset: "2026-06-27T21:00",
};

describe("toComfortInput — produces the exact ComfortInput shape comfortScore consumes (FR-COMFORT-02)", () => {
  it("renames windMax → windSpeed and passes time + the other factors through by name", async () => {
    const { toComfortInput } = await loadTypes();
    const input = toComfortInput(FULL_DAY);

    const expected: ComfortInput = {
      time: "2026-06-27",
      apparentHigh: 22,
      apparentLow: 12,
      precipProbability: 30,
      windSpeed: 5, // the single rename: windMax → windSpeed
      cloudCover: 40,
      uvIndex: 6,
    };
    expect(input).toEqual(expected);
  });

  it("does NOT leak the display-only fields into the comfort input", async () => {
    const { toComfortInput } = await loadTypes();
    const input = toComfortInput(FULL_DAY) as Record<string, unknown>;
    for (const leaked of ["weatherCode", "tempMax", "tempMin", "sunrise", "sunset", "windMax"]) {
      expect(input[leaked], `${leaked} must not appear on the ComfortInput`).toBeUndefined();
    }
  });

  it("carries the location-local time string so comfort-score picks the weekend by local date (FR-COMFORT-05)", async () => {
    const { toComfortInput } = await loadTypes();
    expect(toComfortInput(FULL_DAY).time).toBe("2026-06-27");
  });

  it("preserves null factors as null (so comfortScore's neutral fallback applies, never a fabricated 0)", async () => {
    const { toComfortInput } = await loadTypes();
    const sparse: DailyForecast = {
      ...FULL_DAY,
      apparentHigh: null,
      apparentLow: null,
      precipProbability: null,
      windMax: null,
      cloudCover: null,
      uvIndex: null,
    };
    const input = toComfortInput(sparse);
    expect(input.apparentHigh).toBeNull();
    expect(input.apparentLow).toBeNull();
    expect(input.precipProbability).toBeNull();
    expect(input.windSpeed).toBeNull();
    expect(input.cloudCover).toBeNull();
    expect(input.uvIndex).toBeNull();
  });
});

describe("toComfortInput — comfortScore(toComfortInput(day)) returns a VALID badge value (FR-FORECAST-01)", () => {
  it("a fully-populated day yields an integer comfort value in 0..100 with a usable band", async () => {
    const { toComfortInput } = await loadTypes();
    const { value, rationale } = comfortScore(toComfortInput(FULL_DAY));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
    // bandOf is total over the value → the badge always resolves a band.
    expect(["green", "yellow", "red"]).toContain(bandOf(value));
    // The rationale is a non-empty calm sentence (no exclamation mark, BC-BRAND-01).
    expect(rationale.trim().length).toBeGreaterThan(0);
    expect(rationale).not.toContain("!");
  });

  it("an all-null day still scores (the badge never breaks on a sparse day)", async () => {
    const { toComfortInput } = await loadTypes();
    const sparse: DailyForecast = {
      time: "2026-06-27",
      weatherCode: null,
      tempMax: null,
      tempMin: null,
      apparentHigh: null,
      apparentLow: null,
      precipProbability: null,
      windMax: null,
      cloudCover: null,
      uvIndex: null,
      sunrise: null,
      sunset: null,
    };
    const { value } = comfortScore(toComfortInput(sparse));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});
