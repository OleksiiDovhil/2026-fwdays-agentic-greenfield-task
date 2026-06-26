// Server-side reverse-geocoding Route Handler — design.md D1, ADR-0005,
// TC-DATA-01, NFR-COST-01, NFR-OBS-01. A Next 16 App Router Route Handler (Web
// Request/Response APIs; see
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md),
// MIRRORING `app/api/geocode/route.ts` exactly (the locked Wave-3 data path).
//
// WHY A ROUTE HANDLER (not a client-direct fetch to Nominatim) — the same
// rationale `app/api/geocode/route.ts` established, reused, PLUS the Nominatim
// policy point:
//   1. The upstream contract stays SERVER-SIDE (TC-DATA-01). The Nominatim reverse
//      URL, its query params (`format`/`zoom`/`accept-language`), and its verbose
//      response shape live ONLY in this file behind the minimal `{ name }`
//      (`ReverseResult`) DTO. The client bundle carries only `/api/reverse-geocode`
//      + that DTO — swapping the reverse provider later (e.g. a self-hosted
//      Nominatim) never touches the client.
//   2. No key implied in the bundle (NFR-COST-01). Nominatim reverse is keyless,
//      but routing through the server keeps the "external calls live server-side,
//      parsed by zod before the UI" convention and leaves ONE auditable place
//      where any header/key would ever be added.
//   3. One honest-degradation choke point (NFR-OBS-01): the zod parse, the non-OK
//      branch, the network/timeout branch, and the bad-params branch all resolve
//      here to a UNIFORM typed `{ name }` result, so the client never interprets a
//      raw upstream body or an opaque CORS failure.
//   4. Nominatim's usage policy WANTS a real `User-Agent`/`Referer` identifying the
//      app — a SERVER fetch sets these reliably; a browser fetch cannot set
//      `User-Agent` and would expose a cross-origin call. (ADR-0005.)
//
// REVERSE-GEOCODE RECONCILIATION (ADR-0005): FR-MAP-03 names Open-Meteo, but
// Open-Meteo geocoding is FORWARD-ONLY (no reverse endpoint). This handler uses OSM
// Nominatim reverse — the reverse counterpart Open-Meteo lacks, in the same OSM
// ecosystem as the tiles, equally keyless — with a coordinate-label fallback on the
// client so a click ALWAYS sets a usable location.
//
// HONEST DEGRADATION (NFR-OBS-01): this handler NEVER returns a raw 500. Missing /
// non-numeric `lat`/`lon` → 200 { name: null } WITHOUT an upstream call. A non-OK
// upstream, a thrown fetch (network), an upstream TIMEOUT, a zod-failed 200 body, or
// a `.json()` that throws → 200 { name: null } the client maps to the coordinate
// fallback. The whole body is wrapped so no unexpected throw escapes. It is NOT
// cached (Next 16 default; we do NOT set `dynamic = 'force-static'` — a per-click
// lookup must hit the network).
import { parseReverseName } from "@/lib/geo/reverse-validation";
import { normalizeLatLon } from "@/lib/geo/coordinate-label";
import type { ReverseResult } from "@/lib/geo/types";

// The keyless OSM Nominatim reverse endpoint and tuning. These constants live ONLY
// here (TC-DATA-01) — never in the client bundle.
const REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
// `zoom=10` ≈ city granularity, matching the marker's city-level intent (ADR-0005);
// `accept-language=uk` for Ukrainian-first display names (NFR-I18N-01).
const REVERSE_ZOOM = "10";
const ACCEPT_LANGUAGE = "uk";
// Upstream fetch deadline (ms) — mirrors geocode's UPSTREAM_TIMEOUT_MS. A HUNG
// (not failed) Nominatim response would otherwise leave the request pending; an
// abort after the deadline degrades to { name: null } (caught below), never a 500.
const UPSTREAM_TIMEOUT_MS = 4000;
// A descriptive, app-identifying User-Agent + Referer, per Nominatim's usage
// policy (https://operations.osmfoundation.org/policies/nominatim/). Keyless — no
// auth header.
//
// PRODUCTION NOTE (ADR-0005): Nominatim's policy asks for a way to CONTACT the
// operator (a real domain or email) in the User-Agent. This MVP is keyless,
// stateless, and not tied to a real domain, so we ship an honest app identifier
// WITHOUT fabricating a contact. A production deployment SHOULD set a real contact
// here (e.g. `WeatherExplorer/1.0 (+https://your-domain; contact@your-domain)`),
// or — better at scale — swap to a self-hosted Nominatim behind this same handler
// (the one auditable place the upstream lives, TC-DATA-01).
const USER_AGENT = "WeatherExplorer/1.0 (keyless weekend-trip weather planner)";
const APP_REFERER = "WeatherExplorer";

/** A calm, client-readable JSON result. Status 200 so the client `fetch` always
 *  resolves and reads the typed body — never an unhandled rejection / raw 500. */
function json(result: ReverseResult): Response {
  return Response.json(result);
}

/** Parse a search param as a finite number, or `null` if absent / non-numeric. */
function finiteParam(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Read `lat`/`lon` from the request URL. Missing / non-numeric (incl. "NaN",
    // "Infinity", empty) → { name: null } WITHOUT calling Nominatim (defence in
    // depth against a tampered URL; mirrors geocode's empty-`q` short-circuit).
    const params = new URL(request.url).searchParams;
    const latRaw = finiteParam(params.get("lat"));
    const lonRaw = finiteParam(params.get("lon"));
    if (latRaw === null || lonRaw === null) {
      return json({ name: null });
    }

    // Normalize BEFORE the upstream call (clamp lat / wrap lon) so an out-of-range
    // / past-the-antimeridian coordinate never produces a nonsense reverse request
    // (the spec's antimeridian scenario — silent, no console).
    const { lat, lon } = normalizeLatLon(latRaw, lonRaw);

    // Build the upstream URL. No API key, no auth header (keyless).
    const upstream = new URL(REVERSE_ENDPOINT);
    upstream.searchParams.set("format", "jsonv2");
    upstream.searchParams.set("lat", String(lat));
    upstream.searchParams.set("lon", String(lon));
    upstream.searchParams.set("zoom", REVERSE_ZOOM);
    upstream.searchParams.set("accept-language", ACCEPT_LANGUAGE);

    let response: Response;
    try {
      // Bound the upstream call: a network error OR a timeout (a hung upstream)
      // both reject here and degrade to { name: null } — never a 500, never an
      // indefinitely pending request. The descriptive User-Agent/Referer satisfy
      // Nominatim's usage policy (set reliably by a server fetch).
      response = await fetch(upstream, {
        headers: {
          "User-Agent": USER_AGENT,
          Referer: APP_REFERER,
          "Accept-Language": ACCEPT_LANGUAGE,
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      // Network error or upstream timeout → calm typed result, never unhandled 500.
      return json({ name: null });
    }

    // A non-OK upstream status (rate limit, 5xx, …) → calm typed result, never
    // partial data from the upstream error body.
    if (!response.ok) {
      return json({ name: null });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A 200 whose `.json()` itself throws (malformed payload) → calm typed result.
      return json({ name: null });
    }

    // zod-parse + map (the pure `lib/geo` validator). A malformed body, an
    // `{ error }` body, or a body with no usable place → { name: null } (treated as
    // no usable place, never partial data, never the raw Nominatim shape). The
    // client receives ONLY the minimal typed `{ name }`.
    const result: ReverseResult = parseReverseName(body);
    return json(result);
  } catch {
    // Belt-and-braces: any unforeseen throw still degrades to a calm typed result,
    // so the handler NEVER surfaces a raw 500 to the visitor (NFR-OBS-01).
    return json({ name: null });
  }
}
