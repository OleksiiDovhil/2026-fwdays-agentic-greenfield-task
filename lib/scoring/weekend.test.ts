// Test-first (RED): asserts the SPECIFIED upcoming-weekend selector pinned by
// design.md D7 and spec "Upcoming-weekend highlight using local dates". The
// implementation (`upcomingWeekend` in `lib/scoring/comfort.ts`) does NOT exist
// yet — these MUST fail because the export is missing / the behavior is
// unimplemented. Never weaken a test to make it pass.
//
// Contract under test (D7, FR-COMFORT-05):
//   - pure selector over `{ time, value }[]`: derives each day's weekday from its
//     OWN `time` (YYYY-MM-DD) via a fixed `Date.UTC(y, m-1, d)` + `getUTCDay()` —
//     NEVER `toISOString()` on `new Date()`, NEVER the viewer's local clock;
//   - picks the first Saturday (6) and first Sunday (0) in the window and returns
//     the INTEGER (Math.round) average with `available: "both" | "one" | "none"`;
//   - degrades calmly: one weekend day -> that day's value, "one"; neither ->
//     `value: null`, "none"; no NaN, no throw.
//   - the off-by-one proof: dates whose UTC-vs-local weekday differ for a west-of-
//     UTC viewer still select the weekend by the YYYY-MM-DD string, not the clock.
//
// @trace FR-COMFORT-05
import { describe, it, expect, afterEach } from "vitest";
import { upcomingWeekend } from "@/lib/scoring/comfort";

type Day = { time?: string | null; value: number };

// A 7-day window spanning a real weekend (2026-06-27 is Saturday, 2026-06-28 is
// Sunday per the proleptic Gregorian calendar; verified clock-independently).
// Distinct values so the average is unambiguous and a wrong-day selection is
// detectable: Sat=80, Sun=60 -> average 70.
const SATURDAY = "2026-06-27";
const SUNDAY = "2026-06-28";
const SAT_VALUE = 80;
const SUN_VALUE = 60;

function sevenDayWindow(): Day[] {
  return [
    { time: "2026-06-25", value: 10 }, // Thu
    { time: "2026-06-26", value: 20 }, // Fri
    { time: SATURDAY, value: SAT_VALUE }, // Sat
    { time: SUNDAY, value: SUN_VALUE }, // Sun
    { time: "2026-06-29", value: 30 }, // Mon
    { time: "2026-06-30", value: 40 }, // Tue
    { time: "2026-07-01", value: 50 }, // Wed
  ];
}

afterEach(() => {
  // Restore any TZ override a test installed (the off-by-one proof below).
  delete process.env.TZ;
});

describe("upcomingWeekend — selects Sat+Sun by local daily.time and averages (FR-COMFORT-05)", () => {
  it("returns the integer average of the Saturday and Sunday values", () => {
    const result = upcomingWeekend(sevenDayWindow());
    // (80 + 60) / 2 = 70.
    expect(result.value).toBe(70);
    expect(result.available).toBe("both");
  });

  it("exposes the individual Saturday and Sunday values it averaged", () => {
    const result = upcomingWeekend(sevenDayWindow());
    expect(result.saturday).toBe(SAT_VALUE);
    expect(result.sunday).toBe(SUN_VALUE);
  });

  it("rounds the average to an integer in 0..100 (e.g. 81 & 60 -> 71)", () => {
    const result = upcomingWeekend([
      { time: SATURDAY, value: 81 },
      { time: SUNDAY, value: 60 },
    ]);
    // (81 + 60) / 2 = 70.5 -> Math.round -> 71.
    expect(result.value).toBe(71);
    expect(Number.isInteger(result.value as number)).toBe(true);
    expect(result.value as number).toBeGreaterThanOrEqual(0);
    expect(result.value as number).toBeLessThanOrEqual(100);
  });

  it("picks the FIRST Saturday and FIRST Sunday when several are present", () => {
    const result = upcomingWeekend([
      { time: SATURDAY, value: SAT_VALUE }, // first Sat
      { time: SUNDAY, value: SUN_VALUE }, // first Sun
      { time: "2026-07-04", value: 0 }, // a later Sat — must be ignored
      { time: "2026-07-05", value: 0 }, // a later Sun — must be ignored
    ]);
    expect(result.value).toBe(70);
    expect(result.available).toBe("both");
  });
});

describe("upcomingWeekend — chosen by the YYYY-MM-DD string, NOT the viewer's clock (FR-COMFORT-05)", () => {
  it("selects the weekend from the date string even when the viewer is WEST of UTC (off-by-one trap)", () => {
    // Under America/New_York (UTC-4 in summer), the classic bug
    // `new Date("2026-06-28").getDay()` returns Saturday (5/6), not Sunday — a
    // one-day shift toward the previous calendar day. A correct implementation
    // reads the weekday from the YYYY-MM-DD string via Date.UTC + getUTCDay(), so
    // it is unaffected. We force that timezone and assert the SAME weekend is
    // chosen and the SAME average returned. A clock-based implementation would
    // pick Fri+Sat (2026-06-27 reads as Fri locally) and yield a different value.
    process.env.TZ = "America/New_York";
    const result = upcomingWeekend(sevenDayWindow());
    expect(result.available, "weekend must be found despite the west-of-UTC clock").toBe("both");
    expect(result.saturday, "Saturday value must come from the 2026-06-27 string").toBe(SAT_VALUE);
    expect(result.sunday, "Sunday value must come from the 2026-06-28 string").toBe(SUN_VALUE);
    expect(result.value).toBe(70);
  });

  it("selects the weekend identically under a far-east viewer (UTC+14)", () => {
    // Symmetric guard from the other side of UTC — still string-driven.
    process.env.TZ = "Pacific/Kiritimati";
    const result = upcomingWeekend(sevenDayWindow());
    expect(result.available).toBe("both");
    expect(result.value).toBe(70);
  });
});

describe("upcomingWeekend — degrades calmly to one / none (FR-COMFORT-05)", () => {
  it("degrades to the single available weekend day (only Sunday present) with available 'one'", () => {
    const result = upcomingWeekend([
      { time: "2026-06-29", value: 30 }, // Mon
      { time: SUNDAY, value: SUN_VALUE }, // Sun — the only weekend day
      { time: "2026-06-30", value: 40 }, // Tue
    ]);
    expect(result.available).toBe("one");
    expect(result.value).toBe(SUN_VALUE);
    expect(Number.isNaN(result.value as number)).toBe(false);
  });

  it("degrades to the single available weekend day (only Saturday present) with available 'one'", () => {
    const result = upcomingWeekend([
      { time: "2026-06-26", value: 20 }, // Fri
      { time: SATURDAY, value: SAT_VALUE }, // Sat — the only weekend day
    ]);
    expect(result.available).toBe("one");
    expect(result.value).toBe(SAT_VALUE);
  });

  it("returns value:null / available:'none' when neither weekend day is in range (no NaN, no throw)", () => {
    const weekdaysOnly: Day[] = [
      { time: "2026-06-29", value: 30 }, // Mon
      { time: "2026-06-30", value: 40 }, // Tue
      { time: "2026-07-01", value: 50 }, // Wed
      { time: "2026-07-02", value: 55 }, // Thu
      { time: "2026-07-03", value: 45 }, // Fri
    ];
    let result!: ReturnType<typeof upcomingWeekend>;
    expect(() => {
      result = upcomingWeekend(weekdaysOnly);
    }, "must not throw on a weekend-free window").not.toThrow();
    expect(result.value).toBeNull();
    expect(result.available).toBe("none");
  });

  it("never pairs a non-consecutive Sat+Sun (today=Sunday window must NOT report 'both')", () => {
    // The split-weekend trap: a window that begins on a Sunday (this weekend's
    // TAIL) and ends on the NEXT Saturday. A naive "first Saturday + first Sunday"
    // average would pair 2026-06-28 (Sun) with 2026-07-04 (Sat) — SEVEN days apart,
    // two DIFFERENT weekends — and falsely report "both". The averaged Saturday and
    // Sunday must always be the SAME weekend (consecutive calendar days), so this
    // window must NOT report "both" / value 70.
    const sundayLedWindow: Day[] = [
      { time: "2026-06-28", value: 60 }, // Sun — tail of THIS weekend
      { time: "2026-06-29", value: 10 }, // Mon
      { time: "2026-06-30", value: 20 }, // Tue
      { time: "2026-07-01", value: 30 }, // Wed
      { time: "2026-07-02", value: 40 }, // Thu
      { time: "2026-07-03", value: 50 }, // Fri
      { time: "2026-07-04", value: 80 }, // Sat — start of the NEXT weekend
    ];
    const result = upcomingWeekend(sundayLedWindow);
    expect(
      result.available,
      "a leading Sunday and a trailing next-Saturday are different weekends — not 'both'",
    ).not.toBe("both");
    // And it must never report the bogus 70 average of the two non-consecutive days.
    expect(result.value, "must not average non-consecutive Sat/Sun").not.toBe(70);
    // It still degrades calmly (a single weekend day is available), never throwing.
    expect(result.available).toBe("one");
  });

  it("pairs Sat+Sun ONLY when they are consecutive calendar days (Sat present, its Sunday absent -> 'one')", () => {
    // A Saturday whose next-day Sunday is NOT in the window must degrade to "one"
    // (the Saturday), never borrow a different week's Sunday.
    const result = upcomingWeekend([
      { time: "2026-06-27", value: 80 }, // Sat
      { time: "2026-06-29", value: 30 }, // Mon (no 06-28 Sunday present)
      { time: "2026-07-05", value: 99 }, // a different week's Sunday — must be ignored
    ]);
    expect(result.available).toBe("one");
    expect(result.value).toBe(80);
    expect(result.sunday).toBeUndefined();
  });

  it("does not throw and reports 'none' for an empty window", () => {
    let result!: ReturnType<typeof upcomingWeekend>;
    expect(() => {
      result = upcomingWeekend([]);
    }).not.toThrow();
    expect(result.value).toBeNull();
    expect(result.available).toBe("none");
  });

  it("tolerates missing / malformed time fields without throwing or producing NaN", () => {
    let result!: ReturnType<typeof upcomingWeekend>;
    expect(() => {
      result = upcomingWeekend([
        { time: null, value: 50 },
        { time: undefined, value: 60 },
        { time: "not-a-date", value: 70 },
        { time: SATURDAY, value: SAT_VALUE }, // the one real weekend day
      ]);
    }).not.toThrow();
    // The only valid weekend day is the Saturday — degrade to it.
    expect(result.available).toBe("one");
    expect(result.value).toBe(SAT_VALUE);
    expect(Number.isNaN(result.value as number)).toBe(false);
  });
});
