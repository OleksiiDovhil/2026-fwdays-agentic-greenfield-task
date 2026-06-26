// Framework-free time formatter — design.md D5, FR-CLOCK-01, TC-PURE-01.
//
// Pure, total, deterministic, locale-INVARIANT. No `next/*`, no `react`, no DOM
// globals, no clock/network read of its own: it formats the `Date` it is handed.
// This is the single width contract the TopClock layout reserves against.
//
// Why hand-rolled (not `toLocaleTimeString`): some locales inject AM/PM, a
// narrow no-break space, or non-Western digit shaping — any of which breaks the
// pinned 8-char `HH:MM:SS` format and the header's no-CLS width contract (D5).
// Deriving the LOCAL fields (`getHours/getMinutes/getSeconds`) and zero-padding
// with plain string ops is locale-stable by construction and uses the device's
// time zone (D1: device-local time).

// Zero-pad a 0..59 (or 0..23) field to exactly two ASCII digits. `% 100` keeps
// the result two-wide even for an out-of-range value, so the function stays
// total (it never produces a 3-digit field) — the live `Date` fields are always
// in range, so this is purely a belt-and-braces guarantee.
function pad2(value: number): string {
  const n = Math.floor(Math.abs(value)) % 100;
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Format a `Date` as canonical 24-hour `HH:MM:SS` device-LOCAL time.
 *
 * - Two zero-padded ASCII digits each for hours / minutes / seconds.
 * - A literal `:` separator; NO AM/PM, NO locale separators, NO localized digits.
 * - Total for any `Date`: reads only numeric local fields and string-pads them,
 *   so it cannot throw on the values a live `Date` yields.
 */
export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export default formatClock;
