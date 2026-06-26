// Pure, framework-free numeric formatting helpers for forecast display —
// design.md D4, FR-FORECAST-02, TC-PURE-01.
//
// The display contract is fixed so a tester can decide pass/fail on the exact text
// (FR-FORECAST-02): temperatures and wind round to a WHOLE number using "round half
// away from zero" (so -7.5 → -8, never -7), with no decimals. Kept in the pure
// layer (no i18n, no DOM) so the DayCard and the HourlyChart axis share ONE rounding
// rule and it is unit-testable; the unit labels + minus glyph are composed by the
// components from `forecast.*` (NFR-I18N-01), never here.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM, no `t()`.

/**
 * Round to the nearest integer using "round half away from zero": the magnitude is
 * rounded with `Math.round` (which rounds .5 up) and the sign is reapplied, so a
 * half value moves AWAY from zero in both directions (2.5 → 3, -2.5 → -3). A
 * non-finite input → `null` (the caller shows the neutral placeholder, never `NaN`).
 */
export function roundAwayFromZero(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(Math.abs(value));
  // `|| 0` collapses a possible `-0` (e.g. from -0.2) to a plain `0`.
  return (value < 0 ? -rounded : rounded) || 0;
}

// "YYYY-MM-DD" calendar date (optionally with a trailing time the parse ignores).
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Day-of-week (0=Sun … 6=Sat) for a location-local "YYYY-MM-DD" date string, or
 * `null` when missing / malformed. Reads the components through a FIXED
 * `Date.UTC(y, m-1, d)` — never `new Date("YYYY-MM-DD")` (which a west-of-UTC
 * viewer would shift a day) and never `toISOString` — so the card shows the
 * LOCATION's weekday reproducibly (AGENTS.md, FR-COMFORT-05). The `time` string is
 * already the location's local date (timezone=auto), so the index into the i18n
 * weekday table is the location's weekday.
 */
export function localWeekday(time: string | null | undefined): number | null {
  if (typeof time !== "string") return null;
  const m = DATE_ONLY.exec(time.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(Number(m[1]), month - 1, day);
  if (Number.isNaN(utc)) return null;
  const weekday = new Date(utc).getUTCDay();
  return Number.isNaN(weekday) ? null : weekday;
}
