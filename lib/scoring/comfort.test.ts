// Test-first (RED): asserts the SPECIFIED behavior of the pure, total comfort
// scorer pinned by design.md D1–D3 and spec "Pure total comfort-score function"
// / "Defined inputs, units, and tolerance for missing data". The implementation
// (`lib/scoring/comfort.ts`, `lib/scoring/types.ts`) does NOT exist yet — these
// MUST fail because the module is missing / the behavior is unimplemented, not
// because of weak assertions. Never weaken a test to make it pass.
//
// Contract under test (D1/D2/D3):
//   - `comfortScore(daily)` is total: defined for null/undefined/{}/NaN/partial
//     inputs; returns `{ value, rationale }`; NEVER throws; does not mutate input.
//   - `value` is `Math.round`-ed then clamped to the inclusive integer 0..100.
//   - the start-at-100 / subtract-per-factor model is strictly monotone: worsening
//     EXACTLY ONE factor (past its dead-band) strictly lowers `value`.
//   - deterministic: structurally-equal inputs yield equal value AND rationale.
//
// @trace FR-COMFORT-01, FR-COMFORT-02
import { describe, it, expect } from "vitest";
import { comfortScore } from "@/lib/scoring/comfort";
import type { ComfortInput } from "@/lib/scoring/types";

// A pleasant baseline pinned by the spec's monotonicity scenario and design D2's
// calibration intent (feels ~21°C, precip ~5%, wind ~2 m/s, cloud ~30%, UV ~3) —
// chosen to land WELL INSIDE (0,100) so worsening a factor cannot hit the clamp
// edge and silently fail to decrease (design D2 "strict-monotonicity guarantee" +
// Risks "monotonicity at the clamp edges"). All values are in the units forecast
// pins: temperature_unit=celsius, windspeed_unit=ms, percent 0..100, dimensionless UV.
const BASELINE: ComfortInput = {
  time: "2026-06-27",
  apparentHigh: 21,
  apparentLow: 14,
  precipProbability: 5,
  windSpeed: 2,
  cloudCover: 30,
  uvIndex: 3,
};

// Helper: the shape every call must satisfy (the spec's `{ value, rationale }`).
function expectValidResult(r: unknown): asserts r is { value: number; rationale: string } {
  expect(r, "comfortScore must return an object").toBeTypeOf("object");
  expect(r).not.toBeNull();
  const result = r as { value: unknown; rationale: unknown };
  expect(typeof result.value, "value must be a number").toBe("number");
  expect(Number.isFinite(result.value), "value must be finite (no NaN/Infinity)").toBe(true);
  expect(Number.isInteger(result.value), "value must be an integer (no fractional part)").toBe(true);
  expect(result.value, "value must be >= 0").toBeGreaterThanOrEqual(0);
  expect(result.value, "value must be <= 100").toBeLessThanOrEqual(100);
  expect(typeof result.rationale, "rationale must be a string").toBe("string");
  expect((result.rationale as string).trim().length, "rationale must be non-empty").toBeGreaterThan(0);
}

describe("comfortScore — totality / never-throws (FR-COMFORT-01)", () => {
  // The spec: "defined for EVERY input — including partial objects, null,
  // undefined, NaN, and missing hours — and SHALL NEVER throw."
  const cases: Array<[string, ComfortInput | null | undefined]> = [
    ["null", null],
    ["undefined", undefined],
    ["empty object {}", {} as ComfortInput],
    ["feels NaN", { apparentHigh: NaN } as ComfortInput],
    ["all factors NaN", {
      apparentHigh: NaN,
      apparentLow: NaN,
      precipProbability: NaN,
      windSpeed: NaN,
      cloudCover: NaN,
      uvIndex: NaN,
    } as ComfortInput],
    ["all factors null", {
      time: null,
      apparentHigh: null,
      apparentLow: null,
      precipProbability: null,
      windSpeed: null,
      cloudCover: null,
      uvIndex: null,
    }],
    ["partial: only precip", { precipProbability: 80 }],
    ["partial: only wind", { windSpeed: 15 }],
    ["partial: only feels-like", { apparentHigh: 21 }],
    ["partial: only uv", { uvIndex: 9 }],
  ];

  for (const [label, input] of cases) {
    it(`returns a valid { value, rationale } for ${label} and never throws`, () => {
      let result: unknown;
      expect(() => {
        result = comfortScore(input as ComfortInput | null | undefined);
      }, `comfortScore(${label}) must not throw`).not.toThrow();
      expectValidResult(result);
    });
  }

  it("does NOT mutate the input object (reads fields into locals only, D1)", () => {
    const input: ComfortInput = {
      time: "2026-06-27",
      apparentHigh: 21,
      apparentLow: 14,
      precipProbability: 5,
      windSpeed: 2,
      cloudCover: 30,
      uvIndex: 3,
    };
    const snapshot = JSON.stringify(input);
    comfortScore(input);
    expect(JSON.stringify(input), "input must be unchanged after scoring").toBe(snapshot);
  });
});

describe("comfortScore — clamping & integer (FR-COMFORT-01)", () => {
  it("an idealized day yields an integer value clamped to [0,100]", () => {
    // Factors at the model's ideal would push raw to / past 100 — must clamp & round.
    const ideal: ComfortInput = {
      apparentHigh: 21,
      apparentLow: 21,
      precipProbability: 0,
      windSpeed: 0,
      cloudCover: 0,
      uvIndex: 0,
    };
    const { value } = comfortScore(ideal);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("an extreme cold-storm day yields an integer value clamped to [0,100]", () => {
    // The spec's "extreme cold-and-storm day" — raw would go well below 0; clamp to 0..100.
    const storm: ComfortInput = {
      apparentHigh: -15,
      apparentLow: -22,
      precipProbability: 100,
      windSpeed: 30,
      cloudCover: 100,
      uvIndex: 0,
    };
    const { value } = comfortScore(storm);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("calibration anchors: pleasant baseline lands green (>=70), cold storm lands red (<40)", () => {
    // design D2 "calibration intent": pins the band the model must land in so it can
    // be tuned but not silently drift across a band.
    expect(comfortScore(BASELINE).value, "pleasant baseline must be in the green band").toBeGreaterThanOrEqual(70);
    const storm: ComfortInput = {
      apparentHigh: 2,
      apparentLow: -2,
      precipProbability: 90,
      windSpeed: 12,
      cloudCover: 95,
      uvIndex: 0,
    };
    expect(comfortScore(storm).value, "cold storm must be in the red band").toBeLessThan(40);
  });
});

describe("comfortScore — determinism (FR-COMFORT-01)", () => {
  it("two structurally-equal inputs return equal value AND equal rationale", () => {
    const a: ComfortInput = { ...BASELINE };
    const b: ComfortInput = { ...BASELINE };
    const ra = comfortScore(a);
    const rb = comfortScore(b);
    expect(ra.value).toBe(rb.value);
    expect(ra.rationale).toBe(rb.rationale);
  });

  it("repeated calls on the same input are stable (no clock / randomness)", () => {
    const first = comfortScore(BASELINE);
    for (let i = 0; i < 5; i++) {
      const again = comfortScore(BASELINE);
      expect(again.value).toBe(first.value);
      expect(again.rationale).toBe(first.rationale);
    }
  });
});

describe("comfortScore — strict monotonicity per factor (FR-COMFORT-02)", () => {
  // The spec: from the pleasant baseline, worsening EXACTLY ONE factor at a time
  // (in the pinned units, by a margin clearing its dead-band) yields a STRICTLY
  // lower value than baseline — for each of the five factors INDEPENDENTLY.
  const base = comfortScore(BASELINE).value;

  it("baseline sits strictly inside (0,100) so a strict decrease is observable", () => {
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(100);
  });

  it("colder feels-like (°C) strictly lowers the value", () => {
    // 21 -> 2°C: well past the ~1° dead-band; cold is penalised.
    const colder = comfortScore({ ...BASELINE, apparentHigh: 2, apparentLow: -4 });
    expect(colder.value).toBeLessThan(base);
  });

  it("hotter feels-like (°C) strictly lowers the value", () => {
    // 21 -> 38°C: well past the dead-band on the hot side.
    const hotter = comfortScore({ ...BASELINE, apparentHigh: 38, apparentLow: 30 });
    expect(hotter.value).toBeLessThan(base);
  });

  it("higher precipitation probability (%) strictly lowers the value", () => {
    const wetter = comfortScore({ ...BASELINE, precipProbability: 90 });
    expect(wetter.value).toBeLessThan(base);
  });

  it("stronger wind (m/s) strictly lowers the value", () => {
    // 2 -> 14 m/s: well past the ~3 m/s free-breeze threshold.
    const windier = comfortScore({ ...BASELINE, windSpeed: 14 });
    expect(windier.value).toBeLessThan(base);
  });

  it("heavier cloud cover (%) strictly lowers the value", () => {
    const cloudier = comfortScore({ ...BASELINE, cloudCover: 95 });
    expect(cloudier.value).toBeLessThan(base);
  });

  it("harsher UV index (dimensionless) strictly lowers the value", () => {
    // 3 -> 11: well past the ~5 safe band.
    const uvHarsh = comfortScore({ ...BASELINE, uvIndex: 11 });
    expect(uvHarsh.value).toBeLessThan(base);
  });

  it("each of the five factors is reflected independently (all five strictly below baseline)", () => {
    const worsened = [
      comfortScore({ ...BASELINE, apparentHigh: 2, apparentLow: -4 }).value,
      comfortScore({ ...BASELINE, apparentHigh: 38, apparentLow: 30 }).value,
      comfortScore({ ...BASELINE, precipProbability: 90 }).value,
      comfortScore({ ...BASELINE, windSpeed: 14 }).value,
      comfortScore({ ...BASELINE, cloudCover: 95 }).value,
      comfortScore({ ...BASELINE, uvIndex: 11 }).value,
    ];
    for (const v of worsened) {
      expect(v).toBeLessThan(base);
    }
  });
});

describe("comfortScore — missing factors are neutral, never best/worst (FR-COMFORT-02)", () => {
  it("all-missing input ({}) scores a mid-band value that is neither 0 nor 100", () => {
    const { value } = comfortScore({} as ComfortInput);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  it("a partial input penalises only the factor it provides (a bad precip lowers vs all-missing)", () => {
    // design D3: a partial day penalises only the factors it actually provides;
    // adding a clearly-bad precip to an otherwise-missing day must score lower than
    // the all-neutral baseline `{}` (precip neutral fallback is 35).
    const allMissing = comfortScore({} as ComfortInput).value;
    const badPrecipOnly = comfortScore({ precipProbability: 100 }).value;
    expect(badPrecipOnly).toBeLessThan(allMissing);
  });
});
