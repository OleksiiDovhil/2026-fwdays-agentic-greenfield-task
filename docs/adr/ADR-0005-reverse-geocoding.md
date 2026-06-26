# ADR-0005: Reverse geocoding for map clicks (OSM Nominatim, keyless)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** orchestrator + map-slice author

## Context

`docs/requirements.md` FR-MAP-03 and the baseline `openspec/specs/map/spec.md`
require that a click (tap) on the map change the active location and that the
clicked coordinates be **"reverse-geocoded via Open-Meteo"** to obtain the place
name, after which a fresh forecast is fetched. The product is **keyless,
stateless, privacy-first** (ADR-0003; NFR-COST-01; BC-PRIVACY-01/02/03) and all
weather/geocoding data is meant to come from Open-Meteo, with OSM raster tiles
for the map (TC-STACK-03/04, TC-MAP-01).

There is a **factual conflict** in the requirement: the **Open-Meteo geocoding
API is FORWARD-ONLY** (it resolves a place *name* → coordinates via
`/v1/search?name=...`). It exposes **no reverse endpoint** (coordinates → name).
So FR-MAP-03 as literally written — "reverse-geocoded via Open-Meteo" — is not
implementable against the actual Open-Meteo API. A capability spec must be backed
by a real, keyless code path; this ADR reconciles the requirement honestly rather
than fabricating an Open-Meteo reverse call that does not exist.

A second, independent fact softens the conflict: the **forecast and comfort
capabilities work off `lat`/`lon` only** — they do not need a place name. The
name is purely a **display label** (the marker popup and the URL `name` param).
So a map click can always set a fully-usable active location from the clicked
coordinates *immediately*; obtaining a human-readable name is a separable,
best-effort enrichment that must never block or break the location change.

## Decision

On a map click we **set the active location by the clicked coordinates
immediately** (`setLocation({ lat, lon, name })`) — the forecast/comfort work off
`lat`/`lon` and need no name — and obtain the display **name** via **OSM
Nominatim reverse geocoding**, the reverse counterpart that Open-Meteo lacks, in
the **same OSM ecosystem as the map tiles** (TC-STACK-04, TC-MAP-01) and equally
**keyless** (NFR-COST-01):

- **Endpoint:** `https://nominatim.openstreetmap.org/reverse` with
  `format=jsonv2`, the normalized `lat`/`lon`, `zoom=10` (≈ city granularity, to
  match the marker's city-level intent), and `accept-language=uk` (Ukrainian-first
  display, NFR-I18N-01). No API key, no token (keyless).
- **Through a Route Handler** `app/api/reverse-geocode/route.ts`, **mirroring
  `app/api/geocode/route.ts` exactly** (the locked TC-DATA-01 data path): the
  Nominatim URL/params and the server-side `fetch` live ONLY in the handler; the
  body is **zod-parsed** by a pure framework-free `lib/geo` validator into a
  minimal typed `{ name }` result; the handler degrades **honestly** (never a raw
  500) and never lets the upstream shape cross to the client. It applies a **short
  upstream timeout** (`AbortSignal.timeout`) and sends a descriptive
  **`User-Agent`** (and a `Referer`) identifying the app, per Nominatim's usage
  policy.
- **Honest degradation (NFR-OBS-01):** if Nominatim fails, times out,
  rate-limits, returns a non-OK status, or returns a body that fails the zod
  schema, the handler returns a typed "no name" result and the client falls back
  to a **calm coordinate-derived label** — a rounded `"lat, lon"` string, or the
  i18n `map.fallbackName` ("Обране місце") — so a map click **ALWAYS** sets a
  usable location. Never a crash, never a blank popup, never a thrown 500. The
  console stays silent on every handled path.

This is a **deliberate, keyless reconciliation of FR-MAP-03**: Open-Meteo cannot
reverse-geocode, OSM/Nominatim can, and Nominatim is already the project's OSM
data source for the map. The map's baseline spec is updated/served by the
`add-map` change to describe the click as reverse-geocoding the clicked point to a
display name (keyless, zod-parsed, with a coordinate fallback) and emitting the
location change — without naming a specific reverse provider in the requirement
text — so the contract is honest and provider-tunable behind the route handler.

## Nominatim usage policy (obligations we accept)

Nominatim's public endpoint is a free, community-run service with a published
[usage policy](https://operations.osmfoundation.org/policies/nominatim/). We
honor it: a valid descriptive `User-Agent`/`Referer` identifying the app; an
absolute cap of ≤ 1 request/second (a single human map click is far below this —
there is no bulk/auto reverse-geocoding, no scraping, no pre-fetching); results
are not stored (BC-PRIVACY-03 — no DB, no cache to disk); and HTTPS only. The
short timeout bounds latency, and the coordinate fallback means a rate-limit or
outage degrades calmly rather than breaking the click. For production scale, the
reverse provider can be swapped (e.g. a self-hosted Nominatim) behind the same
route handler without touching the client — the one auditable place the upstream
lives (TC-DATA-01).

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| OSM Nominatim reverse via a route handler + coordinate fallback (chosen) | Keyless; same OSM ecosystem as the tiles; reverse is exactly what Open-Meteo lacks; honest degradation; provider-swappable behind the handler | Adds one keyless dependency (Nominatim) + its usage policy; best-effort name |
| Take FR-MAP-03 literally — call Open-Meteo to reverse | Matches the requirement's words | **Impossible** — Open-Meteo has no reverse endpoint; would be a fabricated/broken call |
| No reverse at all — always show coordinates as the label | Zero new dependency; simplest | A click over a known city shows raw numbers, not "Одеса" — a visibly poorer FR-MAP-03 result; the popup/URL never name the place |
| A different keyless reverse geocoder (e.g. BigDataCloud client-side) | Also keyless | Outside the OSM ecosystem the tiles already use; another vendor + policy to vet; the route-handler pattern keeps OSM consistency and one auditable upstream |

## Consequences

- A new keyless Route Handler `app/api/reverse-geocode/route.ts` and a pure
  `lib/geo/{reverse-validation.ts, coordinate-label.ts}` (framework-free,
  TC-PURE-01) are added by `add-map`, mirroring the geocode handler + `lib/search`.
- The map slice depends on Nominatim's availability **only** for the display
  name; the location change, the forecast fetch, and the marker always work via
  the coordinate fallback. This keeps the keyless/stateless posture (ADR-0003)
  and the honest-failure rule (NFR-OBS-01) intact.
- The map baseline spec (served by `add-map`) phrases the reverse step as
  "reverse-geocode the clicked point to a display name, keyless, zod-parsed, with
  a calm coordinate fallback" rather than binding it to Open-Meteo, so the
  contract is implementable and the provider stays an implementation detail behind
  the route handler.
- No secrets, no quota to protect, no persistence — consistent with the rest of
  the stack. The reverse provider is swappable without a client change.
