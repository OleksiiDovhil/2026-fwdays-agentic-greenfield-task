// Test-first (RED): asserts the SPECIFIED locale-invariant time formatter pinned
// by design.md D5 and spec "Live local-time display" (the canonical, pinned
// `HH:MM:SS` width contract). The implementation (`lib/clock/format.ts`,
// `formatClock(date)`) does NOT exist yet — these MUST fail because the module is
// missing (unresolved import), not because the assertions are weak. Never weaken a
// test to make it pass; if a test contradicts the spec, change it deliberately.
//
// Contract under test (D5, FR-CLOCK-01):
//   - `formatClock(date: Date): string` returns the device-LOCAL time as canonical
//     24-hour `HH:MM:SS`: two zero-padded ASCII digits each for hours / minutes /
//     seconds, a literal `:` separator, NO AM/PM, NO locale separators, NO localized
//     digit shaping, NO NBSP. The 8-char output is the single width contract.
//   - Pure / total for ANY `Date`: never throws, reads only the `Date` it is handed
//     (no clock / DOM / network of its own), deterministic.
//
// Locale-invariance note: the formatter must derive fields from the LOCAL date
// (e.g. getHours/getMinutes/getSeconds) and pad with plain string ops, so the
// output is identical regardless of the host's locale. We therefore build the
// fixed inputs with explicit local Y/M/D/h/m/s components (the `new Date(y, mo, d,
// h, mi, s)` constructor is local-time), and assert the EXACT 8-char string.
//
// @trace FR-CLOCK-01
import { describe, it, expect } from "vitest";

// Deferred import: a MISSING module surfaces as a failing test (red for the right
// reason) rather than crashing the whole collection. Once `lib/clock/format.ts`
// ships `formatClock`, this resolves and the assertions take over.
async function loadFormatClock(): Promise<(date: Date) => string> {
  const mod = await import("@/lib/clock/format");
  return mod.formatClock;
}

// Build a Date from LOCAL wall-clock components (this Date ctor is local-time), so
// the expected `HH:MM:SS` is independent of the runner's time zone.
const localDate = (
  h: number,
  mi: number,
  s: number,
  y = 2026,
  mo = 0,
  d = 15,
): Date => new Date(y, mo, d, h, mi, s, 0);

// ASCII Western digits + literal colons only — no AM/PM letters, no locale
// separators (dot, NBSP  , narrow NBSP  ), no non-Western digit shaping.
const CANONICAL = /^[0-2]\d:[0-5]\d:[0-5]\d$/;

describe("formatClock — canonical 24h HH:MM:SS (FR-CLOCK-01, D5)", () => {
  it("formats a mid-day time with all double-digit fields exactly", async () => {
    const formatClock = await loadFormatClock();
    expect(formatClock(localDate(14, 5, 30))).toBe("14:05:30");
  });

  it("zero-pads single-digit hours, minutes, and seconds", async () => {
    const formatClock = await loadFormatClock();
    expect(formatClock(localDate(9, 9, 9))).toBe("09:09:09");
    expect(formatClock(localDate(1, 2, 3))).toBe("01:02:03");
    expect(formatClock(localDate(0, 0, 5))).toBe("00:00:05");
  });

  it("renders midnight as 00:00:00 (not 24:00:00 and not 12:00:00 AM)", async () => {
    const formatClock = await loadFormatClock();
    const midnight = formatClock(localDate(0, 0, 0));
    expect(midnight).toBe("00:00:00");
    // Explicitly reject the two classic locale/format failures at the boundary.
    expect(midnight).not.toBe("24:00:00");
    expect(midnight.toLowerCase()).not.toContain("am");
    expect(midnight.toLowerCase()).not.toContain("pm");
  });

  it("renders noon and the late-evening hours in 24h form (no 12h rollover)", async () => {
    const formatClock = await loadFormatClock();
    expect(formatClock(localDate(12, 0, 0))).toBe("12:00:00");
    expect(formatClock(localDate(13, 0, 0))).toBe("13:00:00");
    expect(formatClock(localDate(23, 59, 59))).toBe("23:59:59");
  });

  it("output is always the canonical 8-character HH:MM:SS shape", async () => {
    const formatClock = await loadFormatClock();
    for (const d of [
      localDate(0, 0, 0),
      localDate(9, 9, 9),
      localDate(14, 5, 30),
      localDate(23, 59, 59),
    ]) {
      const out = formatClock(d);
      expect(out, `"${out}" must be 8 chars`).toHaveLength(8);
      expect(out, `"${out}" must match HH:MM:SS`).toMatch(CANONICAL);
      // Exactly two literal colons, at positions 2 and 5.
      expect(out[2]).toBe(":");
      expect(out[5]).toBe(":");
    }
  });
});

describe("formatClock — locale-invariant ASCII, no AM/PM, no NBSP (D5)", () => {
  it("contains only ASCII Western digits 0-9 and colons", async () => {
    const formatClock = await loadFormatClock();
    const out = formatClock(localDate(14, 5, 30));
    // Every character is an ASCII digit or a colon — rejects localized digit shaping.
    expect(/^[0-9:]+$/.test(out), `"${out}" must be ASCII digits + colons only`).toBe(true);
    // The 6 digit characters parse to the source fields in order.
    const digits = out.replace(/:/g, "");
    expect(digits).toBe("140530");
  });

  it("injects no AM/PM marker and no whitespace separators (incl. NBSP / narrow NBSP)", async () => {
    const formatClock = await loadFormatClock();
    const out = formatClock(localDate(8, 7, 6));
    expect(out).toBe("08:07:06");
    // No letters at all (would indicate AM/PM or a locale period abbreviation).
    expect(/[a-zA-Zа-яА-ЯіїєґІЇЄҐ]/.test(out), `"${out}" must contain no letters`).toBe(false);
    // No ordinary space, no NBSP ( ), no narrow NBSP ( ) that toLocale*
    // variants are known to inject before AM/PM.
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
  });
});

describe("formatClock — pure & total, never throws (D5, NFR-OBS-01)", () => {
  it("does not throw for any representative Date across the day's edges", async () => {
    const formatClock = await loadFormatClock();
    for (const d of [
      localDate(0, 0, 0),
      localDate(23, 59, 59),
      localDate(12, 0, 0),
      new Date(0), // unix epoch
      new Date(), // a live now
    ]) {
      expect(() => formatClock(d)).not.toThrow();
      expect(typeof formatClock(d)).toBe("string");
    }
  });

  it("is deterministic — same Date in, same string out", async () => {
    const formatClock = await loadFormatClock();
    const d = localDate(7, 33, 1);
    expect(formatClock(d)).toBe(formatClock(d));
  });
});
