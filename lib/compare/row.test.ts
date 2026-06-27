// Test-first (RED): asserts the SPECIFIED compare-row model builder pinned by
// design.md D3 and the weekend-compare spec ("Comparison cells render extreme and
// locale values correctly", FR-COMPARE-02 / the missing-data + zero-vs-absent +
// out-of-range scenarios). The implementation (`buildCompareRow` in
// `lib/compare/row.ts`) does NOT exist yet — these MUST fail because the module is
// MISSING, not because of weak assertions. Never weaken a test to make it pass.
//
// Contract under test (design.md D3, §2.2):
//   - `buildCompareRow(city, state)` is pure + TOTAL: for every input it returns a
//     `CompareRow` and NEVER throws to the UI (TC-PURE-01).
//   - `state.status: "ok"` → it calls `selectWeekend(forecast)` and builds Sat/Sun
//     `DayCells` carrying the NULLABLE numbers as-is: a present `0%` precip stays
//     `0` (rendered "0%"), an ABSENT precip stays `null` (rendered the em-dash
//     placeholder) — never a fabricated 0; extreme NEGATIVE temps are carried with
//     their sign (tempMax: -12, tempMin: -20). `comfortValue` equals
//     `comfortScore(toComfortInput(day)).value` (REUSES comfort-score, no local copy).
//   - BOTH Sat and Sun null (weekend out of the 7-day window) → `status:
//     "out-of-range"` — the calm out-of-window posture, never a thrown error.
//   - `state.status: "loading" | "failed"` → the matching `status` and not-ready
//     (`null`) cells.
//   - `key` is `keyOf(city)` (the rounded lat/lon identity) and `name` is the city
//     name.
//
// Framework-free (TC-PURE-01): no React, no DOM, no fetch — pure over mocked input.
//
// @trace FR-COMPARE-02
import { describe, it, expect } from "vitest";
import { buildCompareRow } from "@/lib/compare/row";
import type { DailyForecast, Forecast } from "@/lib/forecast/types";
import { toComfortInput } from "@/lib/forecast/types";
import { comfortScore } from "@/lib/scoring/comfort";
import type { Location } from "@/lib/location/types";

// 2026-06-27 Sat / 2026-06-28 Sun (clock-independent anchor, matches weekend.test).
const SATURDAY = "2026-06-27";
const SUNDAY = "2026-06-28";

const KYIV: Location = { lat: 50.45, lon: 30.52, name: "Київ" };

function day(time: string, overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    time,
    weatherCode: 0,
    tempMax: 20,
    tempMin: 10,
    apparentHigh: 18,
    apparentLow: 8,
    precipProbability: 30,
    windMax: 2,
    cloudCover: 25,
    uvIndex: 4,
    sunrise: null,
    sunset: null,
    ...overrides,
  };
}

function forecastWith(days: DailyForecast[]): Forecast {
  return { days, hourly: [], utcOffsetSeconds: null };
}

// A 7-day window so selectWeekend finds the 06-27/06-28 weekend; the weekend days
// take overrides so each scenario controls only the fields under test.
function windowAround(
  satOverrides: Partial<DailyForecast> = {},
  sunOverrides: Partial<DailyForecast> = {},
): Forecast {
  return forecastWith([
    day("2026-06-25"),
    day("2026-06-26"),
    day(SATURDAY, satOverrides),
    day(SUNDAY, sunOverrides),
    day("2026-06-29"),
    day("2026-06-30"),
    day("2026-07-01"),
  ]);
}

describe("buildCompareRow — identity + the OK weekend model (FR-COMPARE-02)", () => {
  it("carries the rounded lat/lon key and the city name", () => {
    const row = buildCompareRow(KYIV, { status: "ok", forecast: windowAround() });
    // keyOf(loc) = `${lat.toFixed(4)},${lon.toFixed(4)}` — the SAME identity
    // ForecastSection / PinProvider key on, so the table column matches the pin.
    expect(row.key).toBe("50.4500,30.5200");
    expect(row.name).toBe("Київ");
  });

  it("status 'ok' builds Sat AND Sun cells with the day's hi/lo and precip", () => {
    const row = buildCompareRow(KYIV, {
      status: "ok",
      forecast: windowAround(
        { tempMax: 24, tempMin: 14, precipProbability: 20 },
        { tempMax: 26, tempMin: 16, precipProbability: 40 },
      ),
    });
    expect(row.status).toBe("ok");
    expect(row.saturday).not.toBeNull();
    expect(row.sunday).not.toBeNull();
    expect(row.saturday?.tempMax).toBe(24);
    expect(row.saturday?.tempMin).toBe(14);
    expect(row.saturday?.precipProbability).toBe(20);
    expect(row.sunday?.tempMax).toBe(26);
    expect(row.sunday?.tempMin).toBe(16);
    expect(row.sunday?.precipProbability).toBe(40);
  });

  it("comfortValue REUSES comfortScore(toComfortInput(day)).value — no local scoring copy", () => {
    const satDay = { tempMax: 24, tempMin: 14, apparentHigh: 22, apparentLow: 12, precipProbability: 20 };
    const sunDay = { tempMax: 4, tempMin: -2, apparentHigh: 3, apparentLow: -5, precipProbability: 90 };
    const forecast = windowAround(satDay, sunDay);
    const row = buildCompareRow(KYIV, { status: "ok", forecast });

    // The expected value comes straight from the locked comfort-score capability
    // applied to the SAME day — the cell must equal it exactly (spec: "the displayed
    // score equals the value produced by comfort-score").
    const expectedSat = comfortScore(toComfortInput(day(SATURDAY, satDay))).value;
    const expectedSun = comfortScore(toComfortInput(day(SUNDAY, sunDay))).value;
    expect(row.saturday?.comfortValue).toBe(expectedSat);
    expect(row.sunday?.comfortValue).toBe(expectedSun);
    expect(Number.isInteger(row.saturday?.comfortValue as number)).toBe(true);
  });
});

describe("buildCompareRow — zero-vs-absent precipitation (FR-COMPARE-02)", () => {
  it("a present 0% precip stays 0 (a real value), an absent precip stays null (placeholder)", () => {
    const row = buildCompareRow(KYIV, {
      status: "ok",
      forecast: windowAround(
        { precipProbability: 0 }, // Saturday: a GENUINE zero
        { precipProbability: null }, // Sunday: ABSENT from the payload
      ),
    });
    // The genuine zero must NOT be coerced to null (it is a real "0%").
    expect(row.saturday?.precipProbability).toBe(0);
    expect(Object.is(row.saturday?.precipProbability, 0)).toBe(true);
    // The absent value must stay null (the component renders the em-dash), NEVER a
    // misleading 0.
    expect(row.sunday?.precipProbability).toBeNull();
  });
});

describe("buildCompareRow — extreme negative temperatures carried with their sign (FR-COMPARE-02)", () => {
  it("a Ukrainian-winter high -12°C / low -20°C is carried as -12 / -20, not 12 / 20 / 0 / null", () => {
    const row = buildCompareRow(KYIV, {
      status: "ok",
      forecast: windowAround({ tempMax: -12, tempMin: -20 }),
    });
    expect(row.saturday?.tempMax).toBe(-12);
    expect(row.saturday?.tempMin).toBe(-20);
    // Explicitly NOT mis-signed or zeroed.
    expect(row.saturday?.tempMax).not.toBe(12);
    expect(row.saturday?.tempMax).not.toBe(0);
    expect(row.saturday?.tempMax).not.toBeNull();
  });

  it("an absent temperature stays null (the cell will render the placeholder, not 0)", () => {
    const row = buildCompareRow(KYIV, {
      status: "ok",
      forecast: windowAround({ tempMax: null, tempMin: null }),
    });
    expect(row.saturday?.tempMax).toBeNull();
    expect(row.saturday?.tempMin).toBeNull();
  });
});

describe("buildCompareRow — out-of-range / loading / failed states are TOTAL (FR-COMPARE-02)", () => {
  it("status 'ok' but the weekend is out of the window → status 'out-of-range' (both Sat/Sun null), never throws", () => {
    // A short, weekday-only forecast: selectWeekend returns { null, null } → the
    // calm out-of-window posture (reusing comfort-score's out-of-range handling).
    let row!: ReturnType<typeof buildCompareRow>;
    expect(() => {
      row = buildCompareRow(KYIV, {
        status: "ok",
        forecast: forecastWith([day("2026-06-29"), day("2026-06-30"), day("2026-07-01")]),
      });
    }).not.toThrow();
    expect(row.status).toBe("out-of-range");
    expect(row.saturday).toBeNull();
    expect(row.sunday).toBeNull();
  });

  it("status 'loading' → status 'loading' with not-ready (null) cells, never throws", () => {
    let row!: ReturnType<typeof buildCompareRow>;
    expect(() => {
      row = buildCompareRow(KYIV, { status: "loading" });
    }).not.toThrow();
    expect(row.status).toBe("loading");
    expect(row.saturday).toBeNull();
    expect(row.sunday).toBeNull();
    // Identity is still present so the column can render its header while loading.
    expect(row.key).toBe("50.4500,30.5200");
    expect(row.name).toBe("Київ");
  });

  it("status 'failed' → status 'failed' with not-ready (null) cells, never throws", () => {
    let row!: ReturnType<typeof buildCompareRow>;
    expect(() => {
      row = buildCompareRow(KYIV, { status: "failed" });
    }).not.toThrow();
    expect(row.status).toBe("failed");
    expect(row.saturday).toBeNull();
    expect(row.sunday).toBeNull();
    expect(row.name).toBe("Київ");
  });

  it("a one-weekend-day window (only Saturday in range) builds a Saturday cell and a null Sunday, status 'ok'", () => {
    // selectWeekend yields { saturday: <Sat>, sunday: null }; since at least one day
    // is present the row is NOT out-of-range — it shows the Saturday and an empty
    // Sunday cell.
    const row = buildCompareRow(KYIV, {
      status: "ok",
      forecast: forecastWith([day("2026-06-26"), day(SATURDAY, { tempMax: 18 })]),
    });
    expect(row.status).toBe("ok");
    expect(row.saturday?.tempMax).toBe(18);
    expect(row.sunday).toBeNull();
  });

  it("does not throw on a malformed forecast body (e.g. days missing) — stays total", () => {
    expect(() =>
      buildCompareRow(KYIV, {
        status: "ok",
        forecast: { days: undefined as unknown as DailyForecast[], hourly: [], utcOffsetSeconds: null },
      }),
    ).not.toThrow();
  });
});
