// Pure, framework-free, TOTAL day/night decision for the animated background —
// design.md D4, FR-ANIM-02, TC-PURE-01.
//
// THE CONTRACT (FR-ANIM-02): decide day vs night IN THE ACTIVE LOCATION's own
// local frame — NEVER the viewer's clock or timezone. Open-Meteo returns today's
// `sunrise`/`sunset` already expressed in the active location's own time zone
// (timezone=auto) as ISO-local strings WITHOUT a zone suffix (e.g.
// "2026-06-26T05:00"), and the SAME response carries the location's
// `utc_offset_seconds`. The helper takes the ABSOLUTE current instant
// (`Date.now()` from the viewer's machine — a single point in time, the same
// everywhere on Earth) and shifts it by the LOCATION's offset to get the
// location's wall clock, then compares TIME-OF-DAY (minutes since local midnight)
// against the sun times' time-of-day. Comparing time-of-day (not full instants)
// means a calendar-date mismatch between "now" and today's sun strings can never
// flip the result. Because the conversion uses the LOCATION's offset — not the
// viewer's `getHours()`/timezone — a viewer in any timezone sees the LOCATION's
// day/night (the normal "explore another city" case).
//
// Back-compat: `utcOffsetSeconds` is the 4th, optional parameter. When it is
// null/undefined/non-finite, the helper falls back to reading the LOCAL
// time-of-day components of the passed `now` (treating it as already in the
// location's wall-clock frame) — so a caller that injects a location-local
// `Date` (the pure unit tests) still works, and a real caller that lacks the
// offset degrades to the day default below rather than guessing the viewer's
// frame.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM globals. TOTAL:
// any null / missing / malformed sun time OR a missing offset (no way to reach
// the location's frame) → `true` (day), the deterministic safe default
// (FR-ANIM-02 "missing sun times fall back to the day gradient"). Never throws,
// never logs.

const MINUTES_PER_DAY = 24 * 60;

// "YYYY-MM-DDTHH:MM" — an ISO-local timestamp WITHOUT a zone suffix. The time
// component is REQUIRED (a date-only string is malformed → the day fallback).
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Minutes since local midnight (0..1439) for an ISO-local "YYYY-MM-DDTHH:MM"
 * wall-clock string, or `null` for a missing / malformed / out-of-range string
 * (polar `null`, an absent field, garbage, or a date with no time). Only the
 * wall-clock TIME components are used — the calendar date is intentionally
 * ignored so "now" and today's sun strings compare by time-of-day.
 */
function sunTimeOfDay(time: string | null | undefined): number | null {
  if (typeof time !== "string") return null;
  const m = ISO_LOCAL.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Coerce a `Date | number` to absolute epoch milliseconds, or `null`. */
function asEpochMs(now: Date | number): number | null {
  const ms = typeof now === "number" ? now : now instanceof Date ? now.getTime() : NaN;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

/**
 * Minutes since the LOCATION's local midnight for the current instant.
 *
 * With a finite `utcOffsetSeconds` (the location's offset from Open-Meteo): shift
 * the absolute instant by the offset and read its `getUTC*` components — those
 * ARE the location's wall clock (UTC + offset = local), so the viewer's own
 * timezone is never consulted. Without an offset: fall back to the LOCAL
 * time-of-day components of `now` (treating it as already in the location's
 * frame — the injected-`Date` unit-test path). Returns `null` for an unreadable
 * instant.
 */
function nowTimeOfDay(
  now: Date | number,
  utcOffsetSeconds: number | null | undefined,
): number | null {
  const epochMs = asEpochMs(now);
  if (epochMs === null) return null;

  if (typeof utcOffsetSeconds === "number" && Number.isFinite(utcOffsetSeconds)) {
    // Shift the absolute instant into the location's frame; getUTC* now reads the
    // location's wall clock. `((x % D) + D) % D` keeps it in 0..1439 across the
    // day boundary the offset may push it over.
    const shifted = new Date(epochMs + utcOffsetSeconds * 1000);
    const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }

  // No offset: read the passed instant's LOCAL time-of-day (the location-local
  // `Date` the pure tests inject conveys the location's wall clock this way).
  const d = typeof now === "number" ? new Date(now) : now;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * `isDaytime(now, sunrise, sunset, utcOffsetSeconds?)` — pure, TOTAL day/night
 * decision in the ACTIVE LOCATION's local frame (design.md D4, FR-ANIM-02).
 *
 * @param now            the ABSOLUTE current instant (`Date.now()` ms or a Date).
 * @param sunrise        today's location-local ISO sunrise ("YYYY-MM-DDTHH:MM").
 * @param sunset         today's location-local ISO sunset.
 * @param utcOffsetSeconds the LOCATION's UTC offset in seconds (Open-Meteo
 *   `utc_offset_seconds`); used to shift `now` into the location's frame. When
 *   absent/null/non-finite, `now` is read in its own local frame (the injected-
 *   `Date` path).
 *
 * Compares the location-local time-of-day against the sun times' time-of-day:
 * at/after sunrise AND before sunset → `true` (day); otherwise → `false`
 * (night). Inclusive at sunrise, exclusive at sunset. A null / missing /
 * malformed sunrise OR sunset, or an unreadable "now", → `true` (day). Never
 * throws, never logs.
 */
export function isDaytime(
  now: Date | number,
  sunrise: string | null,
  sunset: string | null,
  utcOffsetSeconds?: number | null,
): boolean {
  const sunriseTod = sunTimeOfDay(sunrise);
  const sunsetTod = sunTimeOfDay(sunset);
  // A missing / malformed boundary forces the safe DAY default (no throw).
  if (sunriseTod === null || sunsetTod === null) return true;

  const nowTod = nowTimeOfDay(now, utcOffsetSeconds);
  // An unreadable "now" likewise falls back to day rather than throwing.
  if (nowTod === null) return true;

  // Inclusive at sunrise, exclusive at sunset (time-of-day comparison).
  return nowTod >= sunriseTod && nowTod < sunsetTod;
}
