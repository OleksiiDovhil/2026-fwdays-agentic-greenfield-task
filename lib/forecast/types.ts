// The internal forecast contract crossing the Server↔Client boundary — design.md
// D2, FR-FORECAST-01, FR-COMFORT-02, TC-PURE-01.
//
// This is the SINGLE source of truth shared by the route handler and the client:
// the minimal typed projection of the verbose, column-oriented Open-Meteo forecast
// response (the raw shape + the long param list stay server-side, TC-DATA-01). The
// client bundle carries only these types + `/api/forecast`.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM, no `fetch`. The
// `ComfortInput` type is IMPORTED from the locked `lib/scoring/types.ts` (the
// cross-capability contract) — forecast does NOT redefine it.
import type { ComfortInput } from "@/lib/scoring/types";

/** A single hourly temperature point (the next-48 h chart's datum). */
export type HourlyPoint = {
  /** ISO-local time string ("YYYY-MM-DDTHH:00", timezone=auto — no zone suffix). */
  time: string;
  /** Temperature in °C, or `null` for an absent hour. */
  temperature: number | null;
};

/**
 * One forecast day. Carries EVERYTHING `comfortScore` needs as a `ComfortInput`
 * (so `toComfortInput` is a near pass-through, FR-COMFORT-02) PLUS the display
 * fields the cards need. Every weather value is nullable on purpose: any factor
 * can be absent in a real Open-Meteo payload, and the card formatters +
 * comfort-score's neutral fallback are total over `null` (never a fabricated 0).
 */
export type DailyForecast = {
  /** Location-local calendar date, "YYYY-MM-DD" (timezone=auto). */
  time: string;
  /** Open-Meteo WMO weather_code (display icon + condition label). */
  weatherCode: number | null;
  /** temperature_2m_max, °C (display hi). */
  tempMax: number | null;
  /** temperature_2m_min, °C (display lo). */
  tempMin: number | null;
  /** apparent_temperature_max, °C (comfort). */
  apparentHigh: number | null;
  /** apparent_temperature_min, °C (comfort). */
  apparentLow: number | null;
  /** precipitation_probability_max, integer percent 0..100 (display + comfort). */
  precipProbability: number | null;
  /** wind_speed_10m_max, m/s (display + comfort). */
  windMax: number | null;
  /** cloud_cover_mean, integer percent 0..100 (comfort). */
  cloudCover: number | null;
  /** uv_index_max, dimensionless (comfort). */
  uvIndex: number | null;
  /** ISO-local sunrise time (display, today only), or `null` at extreme latitudes. */
  sunrise: string | null;
  /** ISO-local sunset time (display, today only), or `null`. */
  sunset: string | null;
};

/**
 * The full validated forecast. `days` is 1..7 chronological (a short array renders
 * the days it has, per spec); `hourly` is the parsed hourly series (the section
 * slices the next 48 h via `nextHours`).
 */
export type Forecast = {
  days: DailyForecast[];
  hourly: HourlyPoint[];
};

/**
 * The route handler's response contract: `{ forecast }` on success / a typed error
 * shape on any failure path (non-OK upstream / network / zod failure / bad params /
 * zero-day). Status is always client-readable (200) so the client `fetch` resolves
 * and branches on the typed shape — never a raw 500 (NFR-OBS-01).
 */
export type ForecastResult = { forecast: Forecast } | { error: "failed" };

/**
 * The ONE daily→comfort mapping point (the only place the field names are bridged,
 * FR-COMFORT-02). The single rename is `windMax → windSpeed`; the other comfort
 * factors pass through by name. Display-only fields (`weatherCode`, `tempMax`,
 * `tempMin`, `sunrise`, `sunset`) are intentionally NOT carried onto the
 * `ComfortInput`. Pure; preserves `null` factors as `null` so comfort-score's
 * neutral fallback applies.
 */
export function toComfortInput(day: DailyForecast): ComfortInput {
  return {
    time: day.time,
    apparentHigh: day.apparentHigh,
    apparentLow: day.apparentLow,
    precipProbability: day.precipProbability,
    windSpeed: day.windMax,
    cloudCover: day.cloudCover,
    uvIndex: day.uvIndex,
  };
}
