// Deterministic, idempotent Open-Meteo / Nominatim response fixtures for the
// Phase 5 cross-cutting INTEGRATION layer — Vitest only, mocked `fetch`, no network,
// no DB (ADR-0003, ADR-0004, TC-STACK-05). These payloads match the REAL upstream
// shapes the route handlers parse:
//   - `app/api/geocode/route.ts`     -> Open-Meteo geocoding `search` ({ results: [...] })
//   - `app/api/forecast/route.ts`    -> Open-Meteo `v1/forecast` (column-oriented
//                                       `daily` + `hourly` + top-level `utc_offset_seconds`)
//   - `app/api/reverse-geocode/route.ts` -> OSM Nominatim `jsonv2` reverse ({ address, ... })
// so the integration flow drives the handlers' actual zod parsers + transforms, not
// a bespoke shortcut shape.
//
// SEED / IDEMPOTENCY DISCIPLINE (the test-engineer rule, adapted to a DB-less app):
// every builder RE-PINS its baseline on each call by constructing FRESH objects from
// literals — there is NO shared module-level mutable payload, so one test mutating a
// returned body (e.g. to corrupt a column for the degradation case) can NEVER leak
// into another test's copy. `structuredClone` is used where a nested literal could
// otherwise be aliased. Deterministic ids/keys (`fixture-*`, real-ish Open-Meteo
// ids) keep React list keys + identity stable across re-builds of the same city.
//
// LOCAL-DATE DISCIPLINE (AGENTS.md, FR-COMFORT-05): the daily `time` array is a
// fixed run of LOCAL "YYYY-MM-DD" calendar dates (timezone=auto), Wed..Tue, with the
// upcoming **Saturday 2026-06-27 + consecutive Sunday 2026-06-28** unambiguously
// interior to the window. These dates are chosen so a LOCAL-vs-UTC off-by-one would
// CHANGE the chosen weekend: a far-west viewer reading the date through the buggy
// `new Date("YYYY-MM-DD").getDay()` would see 2026-06-27 as a Friday and shift the
// weekend — the lib's `Date.UTC(y,m-1,d)+getUTCDay()` discipline does not. The
// integration test sets a far timezone and asserts the SAME weekend days are picked.

// ── Geocoding (`search`) ──────────────────────────────────────────────────────

/** One raw Open-Meteo geocoding result — the SHAPE the handler's zod parses. */
export type OpenMeteoGeoResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
  // Verbose upstream fields the mapper DROPS — present here to prove the boundary
  // strips them (the client only ever sees the minimal GeoSuggestion).
  elevation?: number;
  timezone?: string;
  feature_code?: string;
  population?: number;
};

/** The raw Open-Meteo geocoding `search` body ({ results: [...] }, possibly empty). */
export type OpenMeteoGeocodingBody = {
  results?: OpenMeteoGeoResult[];
  generationtime_ms?: number;
};

// The three cities the flow uses — fixed coordinates (real-ish), Ukrainian-first
// display names. Each city's forecast fixture below pins its lat/lon to the SAME
// coordinates so `keyOf` (rounded to 4 dp) matches across search -> forecast -> pin.
export const KYIV = {
  id: 703448,
  name: "Київ",
  admin1: "Київ",
  country: "Україна",
  country_code: "UA",
  latitude: 50.4501,
  longitude: 30.5234,
} as const;

export const LVIV = {
  id: 702550,
  name: "Львів",
  admin1: "Львівська область",
  country: "Україна",
  country_code: "UA",
  latitude: 49.8397,
  longitude: 24.0297,
} as const;

export const ODESA = {
  id: 698740,
  name: "Одеса",
  admin1: "Одеська область",
  country: "Україна",
  country_code: "UA",
  latitude: 46.4843,
  longitude: 30.7323,
} as const;

/**
 * A geocoding `search` body for "Kyiv" carrying 2-3 disambiguation candidates
 * (Kyiv first, then Lviv + Odesa as further same-country matches), each with the
 * verbose upstream fields the mapper must drop. FRESH copy on every call (no shared
 * mutation): the `results` array + its objects are rebuilt from literals.
 */
export function geocodingSearchBody(): OpenMeteoGeocodingBody {
  return {
    results: [
      {
        ...KYIV,
        elevation: 187,
        timezone: "Europe/Kyiv",
        feature_code: "PPLC",
        population: 2884000,
      },
      {
        ...LVIV,
        elevation: 296,
        timezone: "Europe/Kyiv",
        feature_code: "PPLA",
        population: 717803,
      },
      {
        ...ODESA,
        elevation: 40,
        timezone: "Europe/Kyiv",
        feature_code: "PPLA",
        population: 1010000,
      },
    ],
    generationtime_ms: 0.42,
  };
}

/** A geocoding body with zero matches (valid "Nothing found", NOT an error). */
export function geocodingEmptyBody(): OpenMeteoGeocodingBody {
  return { results: [], generationtime_ms: 0.1 };
}

// ── Forecast (`v1/forecast`) ──────────────────────────────────────────────────

// The 7-day LOCAL calendar window: Wed 2026-06-24 .. Tue 2026-06-30, spanning the
// upcoming Saturday (index 3) + consecutive Sunday (index 4). Fixed literals (NOT
// derived from `new Date()`), so the fixture is deterministic regardless of when /
// where the suite runs. See the local-date discipline note at the top.
export const FORECAST_DATES = [
  "2026-06-24", // Wed
  "2026-06-25", // Thu
  "2026-06-26", // Fri
  "2026-06-27", // Sat  <- upcoming Saturday (interior to the window)
  "2026-06-28", // Sun  <- its consecutive Sunday
  "2026-06-29", // Mon
  "2026-06-30", // Tue
] as const;

/** The interior weekend's local dates — the integration test asserts the selector
 *  picks exactly THESE, unmoved by the viewer's timezone. */
export const WEEKEND_SATURDAY = "2026-06-27";
export const WEEKEND_SUNDAY = "2026-06-28";
/** The interior weekend's indices into the 7-day arrays (for fixture authoring). */
export const SATURDAY_INDEX = 3;
export const SUNDAY_INDEX = 4;

// A raw Open-Meteo forecast body is COLUMN-oriented: `daily.*` are parallel arrays
// aligned by index against `daily.time`. Each city's per-day factor columns are
// authored so the comfort scores land in DISTINCT bands (asserted by the test):
//   Kyiv  -> pleasant weekend  -> green  (Sat 96 / Sun 89, avg 93)
//   Lviv  -> wet + windy       -> red    (Sat 2  / Sun 0,  avg 1)
//   Odesa -> moderate          -> yellow (Sat 59 / Sun 55, avg 57)
// (Values verified against the real `comfortScore` at fixture-design time.)

/** One day's weather factors (the per-index column values for a single day). */
type DayFactors = {
  weather_code: number;
  temperature_2m_max: number;
  temperature_2m_min: number;
  apparent_temperature_max: number;
  apparent_temperature_min: number;
  precipitation_probability_max: number | null;
  wind_speed_10m_max: number;
  uv_index_max: number;
  cloud_cover_mean: number;
};

/** The raw Open-Meteo forecast body shape the handler's zod parses + zips. */
export type OpenMeteoForecastBody = {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  daily: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    apparent_temperature_max: (number | null)[];
    apparent_temperature_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    uv_index_max: (number | null)[];
    cloud_cover_mean: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
  };
};

// Per-city, per-day factor tables. Index 3 = Saturday, index 4 = Sunday (the
// in-window weekend). Weekdays carry plausible filler so the 7-day grid is complete
// and the weekend days are NOT special-cased by position — only by their local date.
const KYIV_DAYS: DayFactors[] = [
  { weather_code: 3, temperature_2m_max: 24, temperature_2m_min: 14, apparent_temperature_max: 23, apparent_temperature_min: 13, precipitation_probability_max: 20, wind_speed_10m_max: 4, uv_index_max: 6, cloud_cover_mean: 40 },
  { weather_code: 2, temperature_2m_max: 25, temperature_2m_min: 15, apparent_temperature_max: 24, apparent_temperature_min: 14, precipitation_probability_max: 15, wind_speed_10m_max: 3, uv_index_max: 6, cloud_cover_mean: 30 },
  { weather_code: 1, temperature_2m_max: 24, temperature_2m_min: 15, apparent_temperature_max: 24, apparent_temperature_min: 14, precipitation_probability_max: 10, wind_speed_10m_max: 3, uv_index_max: 7, cloud_cover_mean: 25 },
  // Sat — pleasant
  { weather_code: 0, temperature_2m_max: 23, temperature_2m_min: 14, apparent_temperature_max: 22, apparent_temperature_min: 14, precipitation_probability_max: 5, wind_speed_10m_max: 2, uv_index_max: 5, cloud_cover_mean: 15 },
  // Sun — pleasant
  { weather_code: 1, temperature_2m_max: 24, temperature_2m_min: 15, apparent_temperature_max: 23, apparent_temperature_min: 15, precipitation_probability_max: 8, wind_speed_10m_max: 3, uv_index_max: 6, cloud_cover_mean: 20 },
  { weather_code: 3, temperature_2m_max: 22, temperature_2m_min: 13, apparent_temperature_max: 21, apparent_temperature_min: 12, precipitation_probability_max: 30, wind_speed_10m_max: 4, uv_index_max: 5, cloud_cover_mean: 55 },
  { weather_code: 61, temperature_2m_max: 20, temperature_2m_min: 12, apparent_temperature_max: 19, apparent_temperature_min: 11, precipitation_probability_max: 45, wind_speed_10m_max: 5, uv_index_max: 4, cloud_cover_mean: 70 },
];

const LVIV_DAYS: DayFactors[] = [
  { weather_code: 61, temperature_2m_max: 15, temperature_2m_min: 9, apparent_temperature_max: 14, apparent_temperature_min: 8, precipitation_probability_max: 60, wind_speed_10m_max: 8, uv_index_max: 3, cloud_cover_mean: 80 },
  { weather_code: 63, temperature_2m_max: 14, temperature_2m_min: 8, apparent_temperature_max: 13, apparent_temperature_min: 7, precipitation_probability_max: 70, wind_speed_10m_max: 9, uv_index_max: 2, cloud_cover_mean: 90 },
  { weather_code: 80, temperature_2m_max: 13, temperature_2m_min: 8, apparent_temperature_max: 12, apparent_temperature_min: 7, precipitation_probability_max: 75, wind_speed_10m_max: 10, uv_index_max: 2, cloud_cover_mean: 90 },
  // Sat — wet + windy
  { weather_code: 95, temperature_2m_max: 13, temperature_2m_min: 8, apparent_temperature_max: 12, apparent_temperature_min: 7, precipitation_probability_max: 85, wind_speed_10m_max: 11, uv_index_max: 2, cloud_cover_mean: 95 },
  // Sun — wet + windy
  { weather_code: 95, temperature_2m_max: 12, temperature_2m_min: 7, apparent_temperature_max: 11, apparent_temperature_min: 6, precipitation_probability_max: 90, wind_speed_10m_max: 12, uv_index_max: 1, cloud_cover_mean: 100 },
  { weather_code: 80, temperature_2m_max: 14, temperature_2m_min: 8, apparent_temperature_max: 13, apparent_temperature_min: 7, precipitation_probability_max: 65, wind_speed_10m_max: 9, uv_index_max: 3, cloud_cover_mean: 85 },
  { weather_code: 63, temperature_2m_max: 15, temperature_2m_min: 9, apparent_temperature_max: 14, apparent_temperature_min: 8, precipitation_probability_max: 55, wind_speed_10m_max: 8, uv_index_max: 3, cloud_cover_mean: 80 },
];

const ODESA_DAYS: DayFactors[] = [
  { weather_code: 2, temperature_2m_max: 20, temperature_2m_min: 14, apparent_temperature_max: 19, apparent_temperature_min: 14, precipitation_probability_max: 30, wind_speed_10m_max: 6, uv_index_max: 5, cloud_cover_mean: 50 },
  { weather_code: 3, temperature_2m_max: 19, temperature_2m_min: 14, apparent_temperature_max: 18, apparent_temperature_min: 13, precipitation_probability_max: 35, wind_speed_10m_max: 6, uv_index_max: 4, cloud_cover_mean: 55 },
  { weather_code: 2, temperature_2m_max: 20, temperature_2m_min: 14, apparent_temperature_max: 19, apparent_temperature_min: 14, precipitation_probability_max: 30, wind_speed_10m_max: 5, uv_index_max: 5, cloud_cover_mean: 50 },
  // Sat — moderate
  { weather_code: 3, temperature_2m_max: 19, temperature_2m_min: 13, apparent_temperature_max: 18, apparent_temperature_min: 13, precipitation_probability_max: 35, wind_speed_10m_max: 5, uv_index_max: 4, cloud_cover_mean: 55 },
  // Sun — moderate
  { weather_code: 80, temperature_2m_max: 20, temperature_2m_min: 14, apparent_temperature_max: 19, apparent_temperature_min: 14, precipitation_probability_max: 40, wind_speed_10m_max: 6, uv_index_max: 5, cloud_cover_mean: 60 },
  { weather_code: 2, temperature_2m_max: 21, temperature_2m_min: 15, apparent_temperature_max: 20, apparent_temperature_min: 14, precipitation_probability_max: 25, wind_speed_10m_max: 5, uv_index_max: 5, cloud_cover_mean: 45 },
  { weather_code: 1, temperature_2m_max: 22, temperature_2m_min: 15, apparent_temperature_max: 21, apparent_temperature_min: 15, precipitation_probability_max: 20, wind_speed_10m_max: 4, uv_index_max: 6, cloud_cover_mean: 35 },
];

// A 49-point hourly block (the next-48 h chart needs >= 48). Hours run from local
// midnight of the FIRST forecast date; temperatures are a deterministic, plausible
// diurnal-ish ripple around a city base — no `Math.random`.
function hourlyBlock(baseTemp: number): { time: string[]; temperature_2m: (number | null)[] } {
  const firstDate = FORECAST_DATES[0];
  const time: string[] = [];
  const temperature_2m: number[] = [];
  for (let i = 0; i < 49; i += 1) {
    const dayOffset = Math.floor(i / 24);
    const hourOfDay = i % 24;
    const date = FORECAST_DATES[Math.min(dayOffset, FORECAST_DATES.length - 1)] ?? firstDate;
    const hh = String(hourOfDay).padStart(2, "0");
    // ISO-LOCAL string, no zone suffix (timezone=auto convention).
    time.push(`${date}T${hh}:00`);
    // A gentle cosine ripple: coolest ~04:00, warmest ~15:00. Deterministic.
    const ripple = Math.round(5 * Math.cos(((hourOfDay - 15) / 24) * 2 * Math.PI));
    temperature_2m.push(baseTemp + ripple);
  }
  return { time, temperature_2m };
}

/** Build a complete column-oriented forecast body from a per-day factor table. */
function forecastBodyFrom(
  lat: number,
  lon: number,
  days: DayFactors[],
  baseTemp: number,
): OpenMeteoForecastBody {
  const time = [...FORECAST_DATES];
  return {
    latitude: lat,
    longitude: lon,
    timezone: "Europe/Kyiv",
    // Europe/Kyiv in late June is UTC+3 (EEST) -> 3 * 3600. The forecast handler
    // pins timezone=auto, so Open-Meteo returns this; the parser carries it onto
    // Forecast.utcOffsetSeconds (used by the animated background's day/night frame).
    utc_offset_seconds: 10_800,
    daily: {
      time,
      weather_code: days.map((d) => d.weather_code),
      temperature_2m_max: days.map((d) => d.temperature_2m_max),
      temperature_2m_min: days.map((d) => d.temperature_2m_min),
      apparent_temperature_max: days.map((d) => d.apparent_temperature_max),
      apparent_temperature_min: days.map((d) => d.apparent_temperature_min),
      precipitation_probability_max: days.map((d) => d.precipitation_probability_max),
      wind_speed_10m_max: days.map((d) => d.wind_speed_10m_max),
      uv_index_max: days.map((d) => d.uv_index_max),
      cloud_cover_mean: days.map((d) => d.cloud_cover_mean),
      sunrise: time.map((d) => `${d}T05:00`),
      sunset: time.map((d) => `${d}T21:00`),
    },
    hourly: hourlyBlock(baseTemp),
  };
}

/** Kyiv's 7-day forecast (pleasant weekend -> green). FRESH copy each call. */
export function kyivForecastBody(): OpenMeteoForecastBody {
  return forecastBodyFrom(KYIV.latitude, KYIV.longitude, KYIV_DAYS, 18);
}

/** Lviv's 7-day forecast (wet + windy weekend -> red). FRESH copy each call. */
export function lvivForecastBody(): OpenMeteoForecastBody {
  return forecastBodyFrom(LVIV.latitude, LVIV.longitude, LVIV_DAYS, 11);
}

/** Odesa's 7-day forecast (moderate weekend -> yellow). FRESH copy each call. */
export function odesaForecastBody(): OpenMeteoForecastBody {
  return forecastBodyFrom(ODESA.latitude, ODESA.longitude, ODESA_DAYS, 16);
}

/**
 * Route a forecast request to the right city body by matching `lat`/`lon` against
 * the three fixture cities (rounded to 4 dp, the app's `keyOf` granularity). Lets a
 * single `fetch` mock serve the PARALLEL compare fetches deterministically by URL.
 * Returns `null` for an unknown coordinate (the caller decides how to degrade).
 */
export function forecastBodyForCoords(
  lat: number,
  lon: number,
): OpenMeteoForecastBody | null {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (key === `${KYIV.latitude.toFixed(4)},${KYIV.longitude.toFixed(4)}`) {
    return kyivForecastBody();
  }
  if (key === `${LVIV.latitude.toFixed(4)},${LVIV.longitude.toFixed(4)}`) {
    return lvivForecastBody();
  }
  if (key === `${ODESA.latitude.toFixed(4)},${ODESA.longitude.toFixed(4)}`) {
    return odesaForecastBody();
  }
  return null;
}

// ── Nominatim reverse (`jsonv2`) ──────────────────────────────────────────────

/** The raw OSM Nominatim `jsonv2` reverse body shape the handler's zod parses. */
export type NominatimReverseBody = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  addresstype?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
};

/**
 * A Nominatim reverse body for a point in Odesa (a real-ish `jsonv2` shape: the
 * verbose `address` sub-object + `display_name`, all of which the parser projects
 * to the minimal `{ name }`). FRESH copy each call (the nested `address` is rebuilt).
 */
export function reverseGeocodeBody(): NominatimReverseBody {
  return {
    place_id: 12_345_678,
    osm_type: "relation",
    osm_id: 1_234_567,
    lat: "46.4843023",
    lon: "30.7322878",
    category: "boundary",
    type: "administrative",
    addresstype: "city",
    name: "Одеса",
    display_name: "Одеса, Одеський район, Одеська область, 65000, Україна",
    address: {
      city: "Одеса",
      county: "Одеський район",
      state: "Одеська область",
      postcode: "65000",
      country: "Україна",
      country_code: "ua",
    },
  };
}

/** A Nominatim `{ error }` body (no usable place) — the parser yields { name: null }. */
export function reverseGeocodeErrorBody(): { error: string } {
  return { error: "Unable to geocode" };
}

// ── A Response-like stub for the mocked `fetch` ───────────────────────────────

/**
 * A minimal `Response`-like stub matching exactly what the route handlers touch:
 * `.ok`, `.status`, `.json()`. Mirrors the stub the per-handler unit tests use, so
 * the integration layer drives the handlers through the identical fetch surface.
 * `jsonThrows` simulates a 200 whose body is not valid JSON (a real upstream fault).
 */
export function mockResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; jsonThrows?: boolean },
): Response {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: init?.jsonThrows
      ? async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }
      : // Defensive deep clone so a consumer mutating the parsed body cannot reach
        // back into the fixture literal (idempotency across awaits within a test).
        async () => structuredClone(body),
  } as unknown as Response;
}
