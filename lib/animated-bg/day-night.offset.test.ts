// Unit (FR-ANIM-02): proves `isDaytime` converts the ABSOLUTE instant into the
// ACTIVE LOCATION's local frame using the location's `utcOffsetSeconds`
// (Open-Meteo). This is the regression the review gate flagged — the prior helper
// reduced "now" with the VIEWER's local components, so a cross-timezone viewer got
// day/night by their own clock. Here `now` is a fixed ABSOLUTE epoch (host-
// timezone-independent) and ONLY the offset changes the location-local result.
//
// Additive: a separate spec file so the pre-written `day-night.test.ts` (the
// injected-`Date`, no-offset back-compat contract) is never edited.
//
// Framework-free (TC-PURE-01): imports only the pure helper. `now` is INJECTED as
// an absolute `Date.UTC(...)` epoch; the real clock is never read.
//
// @trace FR-ANIM-02
import { describe, it, expect } from "vitest";
import { isDaytime } from "@/lib/animated-bg/day-night";

// Location-local sun window (05:00 → 21:00), the shape Open-Meteo returns under
// timezone=auto (no zone suffix).
const SUNRISE = "2026-06-26T05:00";
const SUNSET = "2026-06-26T21:00";

const HOUR = 3600;

describe("isDaytime — absolute now + utcOffsetSeconds → the LOCATION's local frame (FR-ANIM-02)", () => {
  it("midnight-UTC instant + offset +12h → location-local noon → DAY (true)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 0, 0, 0); // 00:00 UTC, absolute
    // 00:00 UTC + 12h = 12:00 location-local → inside 05:00→21:00 → day.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 12 * HOUR)).toBe(true);
  });

  it("the SAME midnight-UTC instant + offset 0 → location-local 00:00 → NIGHT (false)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 0, 0, 0);
    // Identical absolute instant; only the offset differs → the result flips,
    // proving the offset (the location) drives it, not the instant alone.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 0)).toBe(false);
  });

  it("18:00-UTC (a daytime UTC hour) + offset +9h → location-local 03:00 → NIGHT (false)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 18, 0, 0);
    // 18:00 UTC is daytime by UTC, but the LOCATION is at 03:00 (next calendar
    // day) → night. A helper that ignored the offset would wrongly say day.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 9 * HOUR)).toBe(false);
  });

  it("03:00-UTC (a nighttime UTC hour) + offset +10h → location-local 13:00 → DAY (true)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 3, 0, 0);
    // 03:00 UTC is night by UTC, but the LOCATION is at 13:00 → day. The mirror of
    // the case above: the offset moves it INTO the day window.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 10 * HOUR)).toBe(true);
  });

  it("a NEGATIVE offset crossing the day boundary backwards stays correct (time-of-day, not date)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 2, 0, 0); // 02:00 UTC on the 26th
    // 02:00 UTC - 5h = 21:00 on the 25th (a DIFFERENT calendar day) → at/after
    // sunset → night. Time-of-day comparison ignores the date mismatch.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, -5 * HOUR)).toBe(false);
  });

  it("offset placing the location EXACTLY at sunrise → DAY (inclusive boundary)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 0, 0, 0);
    // 00:00 UTC + 5h = 05:00 location-local == sunrise → inclusive → day.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 5 * HOUR)).toBe(true);
  });

  it("offset placing the location EXACTLY at sunset → NIGHT (exclusive boundary)", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 0, 0, 0);
    // 00:00 UTC + 21h = 21:00 location-local == sunset → exclusive → night.
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, 21 * HOUR)).toBe(false);
  });

  it("a null / malformed offset → DAY default (cannot reach the location frame), never throws", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 18, 0, 0);
    // null offset: the day fallback (the helper can't place the instant in the
    // location frame). The 3-arg/no-offset back-compat path is covered by
    // day-night.test.ts; here we assert the explicit null does not throw.
    expect(() => isDaytime(nowUtc, SUNRISE, SUNSET, null)).not.toThrow();
    expect(isDaytime(nowUtc, SUNRISE, SUNSET, Number.NaN)).toBe(true);
  });

  it("never throws for any offset with null/malformed sun times → DAY", () => {
    const nowUtc = Date.UTC(2026, 5, 26, 18, 0, 0);
    expect(isDaytime(nowUtc, null, SUNSET, 9 * HOUR)).toBe(true);
    expect(isDaytime(nowUtc, SUNRISE, null, 9 * HOUR)).toBe(true);
    expect(() => isDaytime(nowUtc, "garbage", "??", 9 * HOUR)).not.toThrow();
  });
});
