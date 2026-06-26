// Pure, framework-free zod parse + column→row transform for the Open-Meteo
// forecast response — design.md D2, FR-FORECAST-01, TC-PURE-01.
//
// zod only: no `next/*`, no `react`, no DOM (TC-PURE-01), so it is unit-tested
// deterministically against a real-ish payload and against malformed/empty/short/
// bad-hourly bodies without a server or jsdom. Mirrors the locked `lib/search` /
// `lib/location` `.safeParse` discipline.
//
// The upstream `daily` block is COLUMN-oriented: parallel arrays aligned by index
// against `daily.time`. The schema validates each column, then the parser ZIPS the
// columns per index into `DailyForecast[]`. The `hourly` block is likewise
// `{ time: string[]; temperature_2m: (number|null)[] }`, validated BEFORE the daily
// cards render (spec: the hourly block is part of the payload contract).
//
// TOTAL contract: a malformed / partial / non-object body, a body whose shape fails
// the schema, a MISSING/non-array/non-numeric HOURLY block, OR a schema-valid but
// ZERO-day body (empty `daily.time`) → `{ error: "failed" }` and NEVER throws. A
// SHORT daily array (1..6) is VALID. A per-day nullable field absent for a day →
// `null` (not zero, not dropped). `cloud_cover_mean` may be ABSENT entirely (some
// Open-Meteo plans omit the daily mean) → every day's cloudCover is `null`, the
// comfort neutral fallback covers it (never a fabricated value).
import { z } from "zod";
import type { DailyForecast, Forecast, ForecastResult, HourlyPoint } from "./types";

// A nullable-number column (an absent per-day value is an explicit `null`).
const numberColumn = z.array(z.number().nullable());
// A string column (dates / sunrise / sunset are ISO-local strings).
const stringColumn = z.array(z.string());

// The daily block: `time` keys the index; every weather column is a parallel array.
// `cloud_cover_mean` is OPTIONAL (some plans omit it). The others are required —
// a body missing a required daily field fails the contract (spec: "missing required
// daily fields … treated as a failed fetch").
const dailySchema = z.object({
  time: stringColumn,
  weather_code: numberColumn,
  temperature_2m_max: numberColumn,
  temperature_2m_min: numberColumn,
  apparent_temperature_max: numberColumn,
  apparent_temperature_min: numberColumn,
  precipitation_probability_max: numberColumn,
  wind_speed_10m_max: numberColumn,
  uv_index_max: numberColumn,
  cloud_cover_mean: numberColumn.optional(),
  sunrise: stringColumn,
  sunset: stringColumn,
});

// The hourly block — validated like any failed fetch when absent/non-array/
// non-numeric (the test corrupts `temperature_2m` to a string and to string
// entries). Entries are nullable numbers (an absent hour is `null`).
const hourlySchema = z.object({
  time: stringColumn,
  temperature_2m: numberColumn,
});

const forecastSchema = z.object({
  daily: dailySchema,
  hourly: hourlySchema,
});

type DailyColumns = z.infer<typeof dailySchema>;

/** Read column `col` at index `i`, defaulting an absent/short column to `null`. */
function at(col: readonly (number | null)[] | undefined, i: number): number | null {
  if (!col) return null;
  const v = col[i];
  return v === undefined ? null : v;
}

/** Read a string column at index `i`, defaulting an absent/short entry to `null`. */
function strAt(col: readonly string[] | undefined, i: number): string | null {
  if (!col) return null;
  const v = col[i];
  return v === undefined ? null : v;
}

/** Zip the validated daily columns per index into chronological `DailyForecast[]`. */
function zipDays(daily: DailyColumns): DailyForecast[] {
  return daily.time.map((time, i) => ({
    time,
    weatherCode: at(daily.weather_code, i),
    tempMax: at(daily.temperature_2m_max, i),
    tempMin: at(daily.temperature_2m_min, i),
    apparentHigh: at(daily.apparent_temperature_max, i),
    apparentLow: at(daily.apparent_temperature_min, i),
    precipProbability: at(daily.precipitation_probability_max, i),
    windMax: at(daily.wind_speed_10m_max, i),
    cloudCover: at(daily.cloud_cover_mean, i),
    uvIndex: at(daily.uv_index_max, i),
    sunrise: strAt(daily.sunrise, i),
    sunset: strAt(daily.sunset, i),
  }));
}

/** Map the validated hourly columns into `HourlyPoint[]` in order. */
function zipHourly(hourly: z.infer<typeof hourlySchema>): HourlyPoint[] {
  return hourly.time.map((time, i) => ({
    time,
    temperature: at(hourly.temperature_2m, i),
  }));
}

/**
 * Total parse of an untrusted Open-Meteo forecast body.
 *
 * `.safeParse`s the whole body (both blocks). On success it zips the columns and
 * returns `{ forecast: { days, hourly } }`. A schema failure, OR a schema-valid
 * body whose `daily.time` is EMPTY (zero days — no day to render), returns
 * `{ error: "failed" }`. NEVER throws; never mutates the argument (reads only).
 */
export function parseForecast(body: unknown): ForecastResult {
  const parsed = forecastSchema.safeParse(body);
  if (!parsed.success) return { error: "failed" };

  const { daily, hourly } = parsed.data;

  // A schema-valid ZERO-day body is degraded: there is no day to render, and an
  // empty grid is never shown (spec: "empty daily array degrades to the
  // failed-fetch state").
  if (daily.time.length === 0) return { error: "failed" };

  const forecast: Forecast = {
    days: zipDays(daily),
    hourly: zipHourly(hourly),
  };
  return { forecast };
}
