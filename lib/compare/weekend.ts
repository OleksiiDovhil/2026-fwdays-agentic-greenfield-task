// Pure, total weekend selector for the compare table — design.md D3, §2.1,
// FR-COMPARE-02, FR-COMFORT-05, TC-PURE-01.
//
// Framework-free: imports no `next/*`, no `react`, no DOM globals, no
// `Date.now()`, no `Math.random()`. `selectWeekend` is a pure function — identical
// inputs yield identical outputs, it never mutates its argument, never throws, and
// emits no console noise. It RETURNS the `DailyForecast` objects (not values) so the
// row builder reads their display + comfort fields, staying consistent with the
// forecast the user sees and with comfort-score's `upcomingWeekend` pairing.
import type { DailyForecast, Forecast } from "@/lib/forecast/types";

/**
 * Parse a "YYYY-MM-DD" calendar-date string into its weekday (0=Sun … 6=Sat) and
 * its UTC epoch-day (whole days since 1970-01-01), or null for a missing /
 * malformed string.
 *
 * This is the SAME fixed-`Date.UTC(y, m-1, d)` discipline the locked
 * `comfort-score` `upcomingWeekend` / `lib/forecast/format.ts localWeekday` use: the
 * `time` string is already the location's local calendar date (the forecast pins
 * timezone=auto), so reading it through `Date.UTC` + `getUTCDay()` avoids the
 * timezone shift that `new Date("YYYY-MM-DD").getDay()` introduces for a
 * west-of-UTC viewer. NEVER `toISOString()`, NEVER `new Date("YYYY-MM-DD")`, NEVER
 * the viewer's clock (AGENTS.md, FR-COMFORT-05). The epoch-day lets the selector
 * test calendar adjacency (Saturday + 1 day == Sunday) across month/year edges.
 */
function parseLocalDate(
  time: string | null | undefined,
): { weekday: number; epochDay: number } | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  const weekday = new Date(utc).getUTCDay();
  if (Number.isNaN(weekday)) return null;
  return { weekday, epochDay: Math.floor(utc / 86_400_000) };
}

export type SelectedWeekend = {
  /** The upcoming Saturday's day object, or null when none is in the window. */
  saturday: DailyForecast | null;
  /** The Saturday's CONSECUTIVE Sunday (or a leading Sunday tail), or null. */
  sunday: DailyForecast | null;
};

/**
 * `selectWeekend(forecast)` — find the upcoming **Saturday** (weekday 6) in
 * `forecast.days` and its **consecutive Sunday** (Saturday + 1 calendar day) by the
 * location-local `time` date (design.md D3). Mirrors the locked `upcomingWeekend`
 * pairing so the two averaged days are always the SAME weekend — never a leading
 * Sunday paired with a different week's trailing Saturday.
 *
 * Degrades calmly + totally (never throws, no NaN):
 *   - first Saturday + its consecutive Sunday present → both objects;
 *   - a Saturday whose next-day Sunday is absent       → `{ saturday, sunday: null }`
 *     (never borrows a different week's Sunday);
 *   - no Saturday but a Sunday present (today=Sunday tail) → `{ null, <first Sunday> }`;
 *   - neither in the window (short / out-of-range / empty `days`) → `{ null, null }`;
 *   - null / undefined / malformed input                → `{ null, null }`.
 */
export function selectWeekend(
  forecast: Forecast | null | undefined,
): SelectedWeekend {
  const days = forecast?.days;
  if (!Array.isArray(days)) return { saturday: null, sunday: null };

  // The FIRST weekend day in chronological order anchors the weekend (mirroring
  // `upcomingWeekend`): if it is a Saturday, pair it with its CONSECUTIVE Sunday; if
  // it is a Sunday (this weekend's tail, with no Saturday before it in range), that
  // lone Sunday is the weekend — a LATER, non-consecutive Saturday belongs to a
  // DIFFERENT weekend and must NOT be borrowed (the split-weekend trap).
  let anchor: { day: DailyForecast; weekday: number; epochDay: number } | null = null;
  // Map epoch-day → the Sunday day object, so "Saturday + 1" is a direct lookup.
  const sundaysByEpochDay = new Map<number, DailyForecast>();

  for (const day of days) {
    const parsed = parseLocalDate(day?.time);
    if (!parsed) continue;
    if (parsed.weekday === 0 && !sundaysByEpochDay.has(parsed.epochDay)) {
      sundaysByEpochDay.set(parsed.epochDay, day);
    }
    // Record the earliest weekend day (by epoch-day, robust to input order).
    const isWeekend = parsed.weekday === 6 || parsed.weekday === 0;
    if (isWeekend && (anchor === null || parsed.epochDay < anchor.epochDay)) {
      anchor = { day, weekday: parsed.weekday, epochDay: parsed.epochDay };
    }
  }

  if (anchor === null) return { saturday: null, sunday: null };

  if (anchor.weekday === 6) {
    // The anchor is a Saturday → pair only with ITS consecutive Sunday (next day);
    // a non-consecutive Sunday is NOT paired (it belongs to a different weekend).
    const consecutiveSunday = sundaysByEpochDay.get(anchor.epochDay + 1) ?? null;
    return { saturday: anchor.day, sunday: consecutiveSunday };
  }

  // The anchor is a leading Sunday (this weekend's tail) → the lone Sunday; no later
  // Saturday is paired with it.
  return { saturday: null, sunday: anchor.day };
}
