// Minimal per-day input shape the comfort scorer consumes — design.md D5,
// FR-COMFORT-02. Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.
//
// `comfortScore` reads only the fields it needs; this type pins that shape so
// `add-forecast` can produce it straight from its zod-validated Open-Meteo daily
// block (the field names mirror the forecast daily contract, so the mapping is a
// pass-through). Every field is optional AND nullable on purpose: any factor can
// be absent in a real Open-Meteo payload, and `comfortScore` is total over all of
// them (a missing factor degrades to a neutral mid-band value, never best/worst).
export type ComfortInput = {
  /** Location-local calendar date, "YYYY-MM-DD" (forecast's timezone=auto). */
  time?: string | null;
  /** Apparent (feels-like) daytime high in °C (apparent_temperature_max). */
  apparentHigh?: number | null;
  /** Apparent (feels-like) night low in °C (apparent_temperature_min). */
  apparentLow?: number | null;
  /** Precipitation probability, integer percent 0..100 (precipitation_probability_max). */
  precipProbability?: number | null;
  /** Wind speed in m/s (wind_speed_*_max, windspeed_unit=ms). */
  windSpeed?: number | null;
  /** Mean cloud cover, integer percent 0..100 (cloud_cover_mean). */
  cloudCover?: number | null;
  /** Maximum UV index, dimensionless (uv_index_max). */
  uvIndex?: number | null;
};

export default ComfortInput;
