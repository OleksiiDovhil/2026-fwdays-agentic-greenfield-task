// Server-side forecast Route Handler — design.md D1, TC-DATA-01, NFR-COST-01,
// NFR-OBS-01. A Next 16 App Router Route Handler (Web Request/Response APIs; see
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
// A faithful REUSE of `app/api/geocode/route.ts` applied to the forecast endpoint
// (the same TC-DATA-01 pattern; no new architectural decision).
//
// WHY A ROUTE HANDLER (not a client-direct fetch to Open-Meteo):
//   1. The upstream contract stays SERVER-SIDE (TC-DATA-01). The Open-Meteo
//      forecast URL, its (long) `daily`/`hourly` param lists, the unit pins, and
//      its verbose COLUMN-oriented response shape live ONLY in this file behind the
//      minimal `Forecast` DTO. The client bundle carries only `/api/forecast` +
//      the `Forecast`/`DailyForecast`/`HourlyPoint` types — tuning the variable
//      list later never touches the client.
//   2. No key implied in the bundle (NFR-COST-01). Open-Meteo is genuinely keyless,
//      but routing through the server keeps the "external calls live server-side,
//      parsed by zod before the UI" convention and leaves ONE auditable place where
//      any header/key would ever be added — a review can assert zero keys reach the
//      client.
//   3. One honest-degradation choke point (NFR-OBS-01): the zod parse, the non-OK
//      branch, the network-error branch, and the bad-params branch all resolve here
//      to a UNIFORM typed `Forecast` result, so the client receives a uniform shape
//      and never interprets a raw upstream body or an opaque CORS failure.
//   4. Same-origin / CORS-free / encoding-controlled: the handler validates/encodes
//      `lat`/`lon` deterministically.
//
// HONEST DEGRADATION (NFR-OBS-01): this handler NEVER returns a raw 500. Missing /
// non-numeric / OUT-OF-RANGE `lat`/`lon` → a typed { error: "failed" } WITHOUT any
// upstream call (defence in depth against a tampered URL producing an unbounded /
// nonsense request). A non-OK upstream status, a thrown fetch (network), an upstream
// TIMEOUT, a `.json()` that throws, a zod-failed 200 body, OR a schema-valid
// ZERO-day body → a typed { error: "failed" } the client maps to the calm error
// Notice. The whole body is wrapped so no unexpected throw escapes as a raw 500. It
// is NOT cached (Next 16 default; we do NOT set `dynamic = 'force-static'` — a
// per-location lookup must hit the network).
import { parseForecast } from "@/lib/forecast/validation";
import type { ForecastResult } from "@/lib/forecast/types";

// The keyless Open-Meteo FORECAST endpoint and the pinned request. These constants
// live ONLY here (TC-DATA-01) — never in the client bundle.
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
// The daily fields the cards + comfort-score need (FR-FORECAST-01, FR-COMFORT-02).
// `cloud_cover_mean` is requested where Open-Meteo serves it; the parser derives a
// per-day `null` where it is absent (never a fabricated value).
const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "uv_index_max",
  "cloud_cover_mean",
  "sunrise",
  "sunset",
].join(",");
const HOURLY_FIELDS = "temperature_2m";
const FORECAST_DAYS = 7;
// Upstream fetch deadline (ms). A HUNG (not failed) Open-Meteo response would
// otherwise leave the request pending indefinitely; aborting after the deadline
// degrades to the typed error result (caught below), never a 500 or a stuck
// request. Shorter than the client's own timeout so the server resolves first.
const UPSTREAM_TIMEOUT_MS = 6000;

/** A calm, client-readable JSON result. Status 200 so the client `fetch` always
 *  resolves and reads the typed body — never an unhandled rejection / raw 500. */
function json(result: ForecastResult): Response {
  return Response.json(result);
}

/**
 * Parse a search param as a finite number IN `[min, max]`, or `null` when missing /
 * non-numeric / out-of-range. Empty string → `null` (a tampered/blank coordinate
 * never reaches Open-Meteo).
 */
function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    // Parse + bound-check `lat`/`lon` (defence in depth, NFR-OBS-01). A missing /
    // non-numeric / out-of-range coordinate degrades WITHOUT an upstream call
    // (mirroring geocode's empty-`q` short-circuit).
    const lat = parseCoord(params.get("lat"), -90, 90);
    const lon = parseCoord(params.get("lon"), -180, 180);
    if (lat === null || lon === null) {
      return json({ error: "failed" });
    }

    // Build the upstream URL. No API key, no auth header (keyless, NFR-COST-01).
    const upstream = new URL(FORECAST_ENDPOINT);
    upstream.searchParams.set("latitude", String(lat));
    upstream.searchParams.set("longitude", String(lon));
    upstream.searchParams.set("daily", DAILY_FIELDS);
    upstream.searchParams.set("hourly", HOURLY_FIELDS);
    upstream.searchParams.set("temperature_unit", "celsius");
    upstream.searchParams.set("windspeed_unit", "ms");
    upstream.searchParams.set("timezone", "auto");
    upstream.searchParams.set("forecast_days", String(FORECAST_DAYS));

    let response: Response;
    try {
      // Bound the upstream call: a network error OR a timeout (a hung upstream)
      // both reject here and degrade to the typed error result — never a 500,
      // never an indefinitely pending request.
      response = await fetch(upstream, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return json({ error: "failed" });
    }

    // A non-OK upstream status → calm typed error, never partial data from the
    // upstream error body.
    if (!response.ok) {
      return json({ error: "failed" });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A 200 whose `.json()` itself throws (malformed payload) → calm typed error.
      return json({ error: "failed" });
    }

    // zod-parse + zip (BOTH blocks). A structurally malformed body, a missing/bad
    // hourly block, or a schema-valid ZERO-day body all return { error: "failed" }
    // from `parseForecast` — treated exactly like a failed fetch, never partial
    // data. The client receives only the minimal typed `Forecast`.
    return json(parseForecast(body));
  } catch {
    // Belt-and-braces: any unforeseen throw still degrades to a calm typed error,
    // so the handler NEVER surfaces a raw 500 to the visitor (NFR-OBS-01).
    return json({ error: "failed" });
  }
}
