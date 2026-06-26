// Pure, framework-free "next N hours" slice — design.md D2, FR-FORECAST-03,
// TC-PURE-01.
//
// `nextHours(hourly, count = 48, now = Date.now())` slices the next `count` future
// hours FROM `now` out of the parsed hourly series. `now` is an INJECTED param
// (default `Date.now()`) — passing it explicitly keeps the function deterministic
// in unit tests (TC-PURE-01 forbids a hidden clock read in the pure layer; the
// default is the only concession and tests always inject `now`). When fewer than
// `count` future points exist it returns the ones it has (spec: fewer-than-48 still
// renders); an empty series → `[]`.
//
// Each point's local `time` is parsed via a FIXED `Date.UTC` of its ISO-local
// components — never `Date.parse` of the bare string (which Node interprets in the
// VIEWER's timezone) and never `toISOString`. This mirrors the comfort-score date
// discipline (AGENTS.md, FR-COMFORT-05): the comparison is reproducible regardless
// of where the code runs, because `now` and the point times are read on the SAME
// fixed-UTC basis the upstream `timezone=auto` strings encode.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.
import type { HourlyPoint } from "./types";

// "YYYY-MM-DDTHH[:MM[:SS]]" — the ISO-local form Open-Meteo emits under
// timezone=auto (no zone suffix). Minutes/seconds optional.
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?(?::(\d{2}))?$/;

/**
 * Parse an ISO-local time string to a fixed-UTC epoch (ms), or `null` when it is
 * missing / malformed. Reads the components and feeds `Date.UTC` so the value does
 * not shift with the viewer's timezone (AGENTS.md).
 */
function localEpoch(time: string | null | undefined): number | null {
  if (typeof time !== "string") return null;
  const m = ISO_LOCAL.exec(time.trim());
  if (!m) return null;
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    m[5] ? Number(m[5]) : 0,
    m[6] ? Number(m[6]) : 0,
  );
  return Number.isNaN(utc) ? null : utc;
}

/**
 * The next `count` future hours (inclusive of the hour AT `now`) from `hourly`.
 * Points whose time cannot be parsed are skipped; the series is assumed
 * chronological. Pure: never mutates the input, never reads a hidden clock.
 */
export function nextHours(
  hourly: readonly HourlyPoint[],
  count = 48,
  now: number = Date.now(),
): HourlyPoint[] {
  const out: HourlyPoint[] = [];
  for (const point of hourly) {
    if (out.length >= count) break;
    const epoch = localEpoch(point.time);
    if (epoch === null) continue;
    // A point AT or AFTER `now` is in the (present/)future; past points are skipped.
    if (epoch >= now) out.push(point);
  }
  return out;
}
