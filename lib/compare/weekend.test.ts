// Test-first (RED): asserts the SPECIFIED weekend selector pinned by design.md D3
// and the weekend-compare spec ("Compare weekend" toggle / FR-COMPARE-02 + the
// location-local weekend basis of FR-COMFORT-05). The implementation
// (`selectWeekend` in `lib/compare/weekend.ts`) does NOT exist yet — these MUST
// fail because the module is MISSING, not because of weak assertions. Never weaken
// a test to make it pass; if it contradicts the spec, change it deliberately.
//
// Contract under test (design.md D3, §2.1):
//   - `selectWeekend(forecast)` finds the upcoming Saturday (weekday 6) in
//     `forecast.days` and its CONSECUTIVE Sunday (Saturday + 1 calendar day) by the
//     location-local `time` (YYYY-MM-DD) date via a FIXED `Date.UTC(y, m-1, d)`
//     parse — NEVER `toISOString()`, NEVER `new Date("YYYY-MM-DD")`, NEVER the
//     viewer's clock (AGENTS.md, FR-COMFORT-05); it MIRRORS the locked
//     `upcomingWeekend` discipline.
//   - It returns the `DailyForecast` OBJECTS (not values) so the row builder reads
//     their display + comfort fields.
//   - It degrades calmly + totally: a Sunday tail with no Saturday →
//     `{ saturday: null, sunday: <first Sunday> }`; neither weekend day in the
//     window (short / out-of-range `days`) → `{ saturday: null, sunday: null }`;
//     null / undefined / malformed input → `{ null, null }`. Never throws, no NaN.
//
// Framework-free (TC-PURE-01): no React, no DOM, no fetch — a pure unit over a
// mocked `Forecast`.
//
// @trace FR-COMPARE-02, FR-COMFORT-05
import { describe, it, expect, afterEach } from "vitest";
import { selectWeekend } from "@/lib/compare/weekend";
import type { DailyForecast, Forecast } from "@/lib/forecast/types";

// 2026-06-27 is a Saturday and 2026-06-28 the consecutive Sunday in the proleptic
// Gregorian calendar (the SAME anchor lib/scoring/weekend.test.ts uses; verified
// clock-independently). Distinct temps so a wrong-day selection is detectable.
const SATURDAY = "2026-06-27";
const SUNDAY = "2026-06-28";

// Build a fully-typed DailyForecast for a given local date; the numbers are unique
// per day so the selected object is identifiable by its fields.
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

function forecastOf(days: DailyForecast[]): Forecast {
  return { days, hourly: [], utcOffsetSeconds: null };
}

// A real 7-day window centred on the 2026-06-27/28 weekend. The Saturday carries a
// sentinel tempMax (66) and the Sunday another (77) so the RETURNED objects can be
// matched by identity, not by position.
function sevenDayWindow(): DailyForecast[] {
  return [
    day("2026-06-25", { tempMax: 11 }), // Thu
    day("2026-06-26", { tempMax: 22 }), // Fri
    day(SATURDAY, { tempMax: 66 }), // Sat (sentinel)
    day(SUNDAY, { tempMax: 77 }), // Sun (sentinel)
    day("2026-06-29", { tempMax: 33 }), // Mon
    day("2026-06-30", { tempMax: 44 }), // Tue
    day("2026-07-01", { tempMax: 55 }), // Wed
  ];
}

afterEach(() => {
  // Restore any TZ override a test installed (the off-by-one proof below).
  delete process.env.TZ;
});

describe("selectWeekend — picks the upcoming Saturday + its consecutive Sunday (FR-COMPARE-02)", () => {
  it("returns the Saturday and the immediately-following Sunday as DailyForecast objects", () => {
    const result = selectWeekend(forecastOf(sevenDayWindow()));
    expect(result.saturday, "the Saturday object must be selected").not.toBeNull();
    expect(result.sunday, "the consecutive Sunday object must be selected").not.toBeNull();
    // Selected by local date — identified by the sentinel temps.
    expect(result.saturday?.time).toBe(SATURDAY);
    expect(result.sunday?.time).toBe(SUNDAY);
    expect(result.saturday?.tempMax).toBe(66);
    expect(result.sunday?.tempMax).toBe(77);
  });

  it("returns the ACTUAL day objects (so the row builder can read their fields), not copies of values", () => {
    const days = sevenDayWindow();
    const result = selectWeekend(forecastOf(days));
    // Reference identity: the returned objects are the very entries from days[].
    expect(result.saturday).toBe(days[2]);
    expect(result.sunday).toBe(days[3]);
  });

  it("picks the FIRST Saturday and ITS consecutive Sunday when several weekends are present", () => {
    const result = selectWeekend(
      forecastOf([
        day(SATURDAY, { tempMax: 66 }), // first Sat
        day(SUNDAY, { tempMax: 77 }), // its consecutive Sun
        day("2026-07-04", { tempMax: 1 }), // a later Sat — must be ignored
        day("2026-07-05", { tempMax: 2 }), // a later Sun — must be ignored
      ]),
    );
    expect(result.saturday?.time).toBe(SATURDAY);
    expect(result.sunday?.time).toBe(SUNDAY);
  });
});

describe("selectWeekend — by the location-local time string, NOT the viewer's clock (FR-COMFORT-05)", () => {
  it("selects the SAME weekend when the viewer is WEST of UTC (off-by-one trap)", () => {
    // Under America/New_York (UTC-4 in summer), the classic bug
    // `new Date("2026-06-28").getDay()` shifts the day toward the previous calendar
    // day (Sunday reads as Saturday). A correct selectWeekend reads the weekday from
    // the YYYY-MM-DD string via Date.UTC + getUTCDay(), so it is UNAFFECTED. A
    // clock-based implementation would pick Fri+Sat and select the wrong objects.
    process.env.TZ = "America/New_York";
    const result = selectWeekend(forecastOf(sevenDayWindow()));
    expect(result.saturday?.time, "Saturday must still resolve from the 2026-06-27 string").toBe(
      SATURDAY,
    );
    expect(result.sunday?.time, "Sunday must still resolve from the 2026-06-28 string").toBe(
      SUNDAY,
    );
    expect(result.saturday?.tempMax).toBe(66);
    expect(result.sunday?.tempMax).toBe(77);
  });

  it("selects the weekend identically under a far-east viewer (UTC+14)", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const result = selectWeekend(forecastOf(sevenDayWindow()));
    expect(result.saturday?.time).toBe(SATURDAY);
    expect(result.sunday?.time).toBe(SUNDAY);
  });
});

describe("selectWeekend — degrades calmly + totally to one / none (FR-COMPARE-02)", () => {
  it("a Sunday tail with no Saturday → { saturday: null, sunday: <first Sunday> }", () => {
    // A window that begins on a Sunday (this weekend's tail) and runs into the next
    // week. There is no Saturday before it, so it degrades to the lone Sunday — the
    // SAME 'one' posture upcomingWeekend takes for a today=Sunday window.
    const result = selectWeekend(
      forecastOf([
        day(SUNDAY, { tempMax: 77 }), // Sun — tail of THIS weekend
        day("2026-06-29", { tempMax: 33 }), // Mon
        day("2026-06-30", { tempMax: 44 }), // Tue
      ]),
    );
    expect(result.saturday).toBeNull();
    expect(result.sunday?.time).toBe(SUNDAY);
    expect(result.sunday?.tempMax).toBe(77);
  });

  it("a Saturday whose consecutive Sunday is absent → { saturday: <Sat>, sunday: null } (never borrows a different week's Sunday)", () => {
    const result = selectWeekend(
      forecastOf([
        day(SATURDAY, { tempMax: 66 }), // Sat
        day("2026-06-29", { tempMax: 33 }), // Mon (no 06-28 Sunday present)
        day("2026-07-05", { tempMax: 99 }), // a DIFFERENT week's Sunday — must be ignored
      ]),
    );
    expect(result.saturday?.time).toBe(SATURDAY);
    expect(result.sunday, "a non-consecutive Sunday must NOT be paired").toBeNull();
  });

  it("never pairs a non-consecutive Sat+Sun (Sunday-led window then next Saturday)", () => {
    // The split-weekend trap: a leading Sunday (this weekend's tail) and a trailing
    // NEXT-week Saturday are two DIFFERENT weekends. They must not be paired; the
    // first present weekend day is the leading Sunday.
    const result = selectWeekend(
      forecastOf([
        day("2026-06-28", { tempMax: 77 }), // Sun — tail of THIS weekend
        day("2026-06-29", { tempMax: 10 }), // Mon
        day("2026-06-30", { tempMax: 20 }), // Tue
        day("2026-07-01", { tempMax: 30 }), // Wed
        day("2026-07-02", { tempMax: 40 }), // Thu
        day("2026-07-03", { tempMax: 50 }), // Fri
        day("2026-07-04", { tempMax: 66 }), // Sat — start of the NEXT weekend
      ]),
    );
    // The leading Sunday is selected; the next-week Saturday is NOT paired with it.
    expect(result.sunday?.time).toBe("2026-06-28");
    expect(result.saturday, "a leading Sunday must not borrow the next week's Saturday").toBeNull();
  });

  it("neither weekend day in the window (weekdays only) → { saturday: null, sunday: null }, no throw", () => {
    let result!: ReturnType<typeof selectWeekend>;
    expect(() => {
      result = selectWeekend(
        forecastOf([
          day("2026-06-29", { tempMax: 33 }), // Mon
          day("2026-06-30", { tempMax: 44 }), // Tue
          day("2026-07-01", { tempMax: 55 }), // Wed
        ]),
      );
    }, "must not throw on a weekend-free window").not.toThrow();
    expect(result.saturday).toBeNull();
    expect(result.sunday).toBeNull();
  });

  it("returns { null, null } for an empty days window without throwing", () => {
    let result!: ReturnType<typeof selectWeekend>;
    expect(() => {
      result = selectWeekend(forecastOf([]));
    }).not.toThrow();
    expect(result.saturday).toBeNull();
    expect(result.sunday).toBeNull();
  });

  it("is total over null / undefined input → { null, null }, never throws", () => {
    expect(() => selectWeekend(null)).not.toThrow();
    expect(() => selectWeekend(undefined)).not.toThrow();
    expect(selectWeekend(null)).toEqual({ saturday: null, sunday: null });
    expect(selectWeekend(undefined)).toEqual({ saturday: null, sunday: null });
  });

  it("tolerates missing / malformed time fields without throwing", () => {
    let result!: ReturnType<typeof selectWeekend>;
    expect(() => {
      result = selectWeekend(
        forecastOf([
          day("not-a-date", { tempMax: 1 }),
          { ...day("2026-06-26"), time: null as unknown as string },
          day(SATURDAY, { tempMax: 66 }), // the one real Saturday
          day(SUNDAY, { tempMax: 77 }), // its consecutive Sunday
        ]),
      );
    }).not.toThrow();
    // The malformed entries are skipped; the real weekend still resolves.
    expect(result.saturday?.time).toBe(SATURDAY);
    expect(result.sunday?.time).toBe(SUNDAY);
  });
});
