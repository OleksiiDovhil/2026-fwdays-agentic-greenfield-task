// Server-side geocoding Route Handler — design.md D1, TC-DATA-01, NFR-COST-01,
// NFR-OBS-01. A Next 16 App Router Route Handler (Web Request/Response APIs; see
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
//
// WHY A ROUTE HANDLER (not a client-direct fetch to Open-Meteo):
//   1. The upstream contract stays SERVER-SIDE (TC-DATA-01). The Open-Meteo URL,
//      its query params (`count`/`language`/`format`), and its verbose response
//      shape live ONLY in this file behind the minimal `GeoSuggestion` DTO. The
//      client bundle carries only `/api/geocode` + `GeoSuggestion` — swapping or
//      tuning the geocoder later never touches the client.
//   2. No key implied in the bundle (NFR-COST-01). Open-Meteo geocoding is keyless,
//      but routing through the server keeps the "external calls live server-side,
//      parsed by zod before the UI" convention and leaves ONE auditable place
//      where any header/key would ever be added — a review can assert zero keys
//      reach the client.
//   3. One honest-degradation choke point (NFR-OBS-01): the zod parse, the non-OK
//      branch, the network-error branch, and the empty-`q` branch all resolve here
//      to a UNIFORM typed result, so the client never interprets a raw upstream
//      body or an opaque CORS failure.
//   4. Same-origin / CORS-free / encoding-controlled: the handler URL-encodes `q`
//      and applies the 120-char cap deterministically.
//
// HONEST DEGRADATION (NFR-OBS-01): this handler NEVER returns a raw 500 on bad
// input or a bad upstream. An empty/whitespace/missing `q` → 200 { suggestions: [] }
// (no upstream call). A non-OK upstream, a thrown fetch (network), an upstream
// TIMEOUT, a zod-failed 200 body, or a `.json()` that throws → a typed
// { error: "failed" } body the client maps to the calm error Notice. The whole
// body is wrapped so no unexpected throw escapes as a raw 500. It is NOT cached
// (Next 16 default; we do NOT set `dynamic = 'force-static'` — a per-query lookup
// must hit the network).
//
// MVP SECURITY POSTURE (deliberate — design.md D1): this is an UNAUTHENTICATED,
// KEYLESS relay to the keyless Open-Meteo geocoding API with NO app-level rate
// limiting. That is an accepted trade-off for the keyless, stateless MVP
// (ADR-0003): there is no key/quota to protect and no per-user state, and a
// debounced human-typed search is low-volume. The handler's own defences are the
// 120-char query cap (bounded upstream requests) and an upstream fetch TIMEOUT
// (bounded latency). For PRODUCTION hosting, abuse protection is expected to come
// from the platform/edge layer (e.g. Vercel/Cloudflare rate limiting or a WAF) —
// this is the natural place to add it without touching the client contract;
// application-level rate limiting is intentionally OUT OF SCOPE for the MVP.
import { parseGeocodingResult } from "@/lib/search/validation";
import type { GeocodeResult } from "@/lib/search/types";

// The keyless Open-Meteo geocoding endpoint and tuning. These constants live ONLY
// here (TC-DATA-01) — never in the client bundle.
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
// Suggestion limit (Open-Meteo `count`). 8 is a small, deliberate cap: enough to
// disambiguate same-name cities (e.g. several "Springfield"s or an oblast capital
// vs a village) while keeping the listbox short enough to scan by eye and arrow
// through in a few keystrokes, and the payload + render cheap. The client never
// sees this param — tuning it later stays server-side (TC-DATA-01).
const RESULT_COUNT = 8;
const MAX_QUERY_LENGTH = 120;
// Upstream fetch deadline (ms). A HUNG (not failed) Open-Meteo response would
// otherwise leave the request pending indefinitely; aborting after the deadline
// degrades to the typed error result (caught below), never a 500 or a stuck
// request. Shorter than the client's own timeout so the server resolves first.
const UPSTREAM_TIMEOUT_MS = 4000;

/** A calm, client-readable JSON result. Status 200 so the client `fetch` always
 *  resolves and reads the typed body — never an unhandled rejection / raw 500. */
function json(result: GeocodeResult): Response {
  return Response.json(result);
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Read `q` from the request URL. Trim, then hard-cap at 120 chars (defence in
    // depth) so an oversized paste can never produce an unbounded upstream request.
    const raw = new URL(request.url).searchParams.get("q") ?? "";
    const q = raw.trim().slice(0, MAX_QUERY_LENGTH);

    // Empty / whitespace / missing `q` → zero results WITHOUT calling Open-Meteo
    // (the client treats empty like "no query", never an error).
    if (q.length === 0) {
      return json({ suggestions: [] });
    }

    // Build the upstream URL. `URLSearchParams` URL-encodes the (possibly
    // non-ASCII) query deterministically; no API key, no auth header (keyless).
    const upstream = new URL(GEOCODING_ENDPOINT);
    upstream.searchParams.set("name", q);
    upstream.searchParams.set("count", String(RESULT_COUNT));
    upstream.searchParams.set("language", "uk");
    upstream.searchParams.set("format", "json");

    let response: Response;
    try {
      // Bound the upstream call: a network error OR a timeout (a hung upstream)
      // both reject here and degrade to the typed error result — never a 500,
      // never an indefinitely pending request.
      response = await fetch(upstream, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      // Network error or upstream timeout → calm typed error, never unhandled 500.
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

    // zod-parse + map. A structurally MALFORMED body (e.g. `results` is a string)
    // is treated exactly like a failed fetch (typed error, never partial data); a
    // valid body — including an absent or empty `results` — yields the (possibly
    // empty) suggestions list (zero results is NOT an error).
    const parsed = parseGeocodingResult(body);
    if (!parsed.ok) {
      return json({ error: "failed" });
    }
    return json({ suggestions: parsed.suggestions });
  } catch {
    // Belt-and-braces: any unforeseen throw still degrades to a calm typed error,
    // so the handler NEVER surfaces a raw 500 to the visitor (NFR-OBS-01).
    return json({ error: "failed" });
  }
}
