// Test-first (RED): asserts the SPECIFIED behavior of the pure, total day/night
// helper pinned by design.md D4 and the animated-bg spec requirement "Day/night
// driven by active location's sun times" (FR-ANIM-02). The implementation
// (`lib/animated-bg/day-night.ts`) does NOT exist yet — these MUST fail because the
// module is MISSING / the behavior is unimplemented, not because of weak
// assertions. Never weaken a test to make it pass; if it contradicts the spec,
// change it deliberately.
//
// Contract under test (D4, FR-ANIM-02):
//   - `isDaytime(nowLocal: Date | number, sunrise: string | null, sunset: string |
//     null): boolean` decides day vs night in the ACTIVE LOCATION's local frame.
//   - The sun strings are ISO-LOCAL "YYYY-MM-DDTHH:MM" WITHOUT a zone suffix and are
//     parsed via a FIXED parse (the locked `localWeekday`/`parseLocalDate`
//     discipline) — NEVER `new Date("…Z")`, NEVER `toISOString`, NEVER the viewer's
//     clock/timezone.
//   - at/after sunrise AND before sunset → true (day); otherwise → false (night).
//   - BOTH boundaries pinned: exactly at sunrise → day (true); exactly at sunset →
//     night (false).
//   - PROOF: a location whose local "now" is daytime reads as DAY even when the test
//     process / viewer device clock is set to a nighttime hour.
//   - TOTAL fallback: a null / missing / malformed sunrise OR sunset → true (day),
//     the deterministic safe default; never throws, never logs.
//
// Framework-free (TC-PURE-01): this test imports only the pure helper — no React,
// no DOM, no next/*. `nowLocal` is INJECTED for determinism (the real clock is
// never read here).
//
// @trace FR-ANIM-02
import { describe, it, expect, afterEach, vi } from "vitest";
import { isDaytime } from "@/lib/animated-bg/day-night";

// A fixed location-local day. Open-Meteo returns today's sunrise/sunset already in
// the active location's own timezone (timezone=auto) as ISO-local strings with NO
// zone suffix — these mirror that exact shape.
const DAY = "2026-06-26";
const SUNRISE = `${DAY}T05:00`; // 05:00 location-local
const SUNSET = `${DAY}T21:00`; // 21:00 location-local

// Build the location-local "now" the component would pass: a Date whose LOCAL
// wall-clock components are the location's wall clock for `${DAY}` at HH:MM. The
// helper compares wall-clock components (the locked fixed-parse discipline), so a
// locally-constructed Date conveys the location's wall time regardless of the host
// timezone. Using local-component construction (not `Date.UTC`, not a "…Z" string)
// keeps the injected "now" in the same wall-clock frame the helper reasons in.
function localNow(hour: number, minute = 0): Date {
  return new Date(2026, 5, 26, hour, minute, 0, 0); // month is 0-based (5 = June)
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isDaytime — day window: at/after sunrise and before sunset → day (FR-ANIM-02)", () => {
  it("midday (well inside the window) is day", () => {
    expect(isDaytime(localNow(13, 0), SUNRISE, SUNSET)).toBe(true);
  });

  it("one minute after sunrise is day", () => {
    expect(isDaytime(localNow(5, 1), SUNRISE, SUNSET)).toBe(true);
  });

  it("one minute before sunset is day", () => {
    expect(isDaytime(localNow(20, 59), SUNRISE, SUNSET)).toBe(true);
  });
});

describe("isDaytime — night window: before sunrise or at/after sunset → night (FR-ANIM-02)", () => {
  it("pre-dawn (before sunrise) is night", () => {
    expect(isDaytime(localNow(3, 30), SUNRISE, SUNSET)).toBe(false);
  });

  it("one minute before sunrise is night", () => {
    expect(isDaytime(localNow(4, 59), SUNRISE, SUNSET)).toBe(false);
  });

  it("late evening (after sunset) is night", () => {
    expect(isDaytime(localNow(22, 30), SUNRISE, SUNSET)).toBe(false);
  });

  it("one minute after sunset is night", () => {
    expect(isDaytime(localNow(21, 1), SUNRISE, SUNSET)).toBe(false);
  });
});

describe("isDaytime — exact boundaries (D4: at sunrise → day, at sunset → night)", () => {
  it("EXACTLY at sunrise is day (>= sunrise is inclusive)", () => {
    expect(isDaytime(localNow(5, 0), SUNRISE, SUNSET)).toBe(true);
  });

  it("EXACTLY at sunset is night (< sunset is exclusive)", () => {
    expect(isDaytime(localNow(21, 0), SUNRISE, SUNSET)).toBe(false);
  });
});

describe("isDaytime — uses the LOCATION's sun times, NOT the viewer's clock/timezone (FR-ANIM-02 proof)", () => {
  it("a location whose local now is daytime reads as DAY even when the viewer's device clock is set to night", () => {
    // Simulate a visitor whose OWN device clock currently reads a nighttime hour
    // (02:00). If the helper ever consulted the viewer's clock instead of the
    // injected location-local "now", this would flip to night and fail.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 26, 2, 0, 0, 0)); // viewer device clock: 02:00 (night)

    // The location-local "now" passed to the helper is 13:00 — daytime AT THE
    // LOCATION by its own sunrise/sunset. The result MUST be day.
    const result = isDaytime(localNow(13, 0), SUNRISE, SUNSET);
    expect(result, "the location's daytime must win over the viewer's night clock").toBe(true);
  });

  it("a location whose local now is night reads as NIGHT even when the viewer's device clock is set to midday", () => {
    // The mirror image: viewer device clock at high noon (12:00), but the location's
    // local now (23:00) is past sunset → night. The viewer's day must not win.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 26, 12, 0, 0, 0)); // viewer device clock: 12:00 (day)

    const result = isDaytime(localNow(23, 0), SUNRISE, SUNSET);
    expect(result, "the location's night must win over the viewer's midday clock").toBe(false);
  });

  it("the decision parses the ISO-local sun strings without a zone suffix (no '…Z', no toISOString)", () => {
    // A sanity guard on the parse discipline: the sun strings carry NO zone suffix
    // (the location-local shape Open-Meteo returns under timezone=auto). The helper
    // must treat them as the location's wall clock. With "now" at 06:00 local and a
    // 05:00→21:00 window, this is day regardless of the host's timezone — a
    // toISOString / "…Z" parse would shift the boundary and could break this near
    // certain offsets.
    expect(isDaytime(localNow(6, 0), "2026-06-26T05:00", "2026-06-26T21:00")).toBe(true);
  });
});

describe("isDaytime — total fallback for null / missing / malformed sun times → day (FR-ANIM-02)", () => {
  // The spec: missing sun times (null payload e.g. polar day/night, an absent field,
  // or no validated forecast at all) fall back to the DAY gradient — deterministic,
  // no throw, no log.
  const cases: Array<[string, string | null, string | null]> = [
    ["both null", null, null],
    ["sunrise null", null, SUNSET],
    ["sunset null", SUNRISE, null],
    ["both empty string", "", ""],
    ["sunrise malformed (not a date)", "not-a-time", SUNSET],
    ["sunset malformed (garbage)", SUNRISE, "??:??"],
    ["sunrise missing time component", "2026-06-26", SUNSET],
  ];

  for (const [label, sr, ss] of cases) {
    it(`returns true (day) for ${label}`, () => {
      // Even with a nighttime "now", a missing/malformed boundary forces the safe
      // DAY default — so this asserts the FALLBACK, not the window logic.
      expect(isDaytime(localNow(2, 0), sr, ss)).toBe(true);
    });
  }

  it("never throws on any null / malformed input", () => {
    expect(() => isDaytime(localNow(2, 0), null, null)).not.toThrow();
    expect(() => isDaytime(localNow(2, 0), "garbage", "garbage")).not.toThrow();
    expect(() => isDaytime(0, null, null)).not.toThrow();
  });

  it("accepts a numeric epoch `nowLocal` as well as a Date (Date | number signature)", () => {
    // The signature admits Date | number. A numeric now must not throw and must
    // return a boolean (the exact value depends on the helper's epoch interpretation;
    // we assert the TYPE + no-throw here, the wall-clock value is pinned via Date above).
    const out = isDaytime(localNow(13, 0).getTime(), SUNRISE, SUNSET);
    expect(typeof out).toBe("boolean");
  });
});
