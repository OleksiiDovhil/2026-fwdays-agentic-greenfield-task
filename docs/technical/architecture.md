# Architecture — Weather Explorer

System architecture of Weather Explorer: a keyless, privacy-first, Ukrainian-first
weekend trip planner. Link-dense; the requirements (`docs/requirements.md`) and the
ADRs (`docs/adr/`) are the authority. Module names below are taken from the code on
disk, not invented.

## 1. Shape of the system

A single-page Next.js 16.2 (App Router) / React 19.2 / TypeScript-strict app. No
database, no auth, no email, no server-side persistence (**ADR-0003**). All data is
read live from keyless upstreams; state that must survive a reload lives in the URL,
session state lives in memory only. Deploys as a static-first Next app with **zero
env secrets** (see `docs/technical/deployment.md`).

Layers:

- **`lib/<domain>/`** — framework-free pure logic (no `next/*`, no `react`, no DOM),
  100% unit-testable (**TC-PURE-01**). Holds zod validators, types, and total
  transforms.
- **`app/api/<name>/route.ts`** — three Next 16 Route Handlers that do the keyless
  server-side `fetch` to the upstreams and return typed results (**TC-DATA-01**).
- **`components/`** — the UI: thin server shell + client islands for everything that
  depends on the visitor's clock or the active location.
- **`app/`** — the statically-prerendered page composition + root layout + providers.

## 2. The `lib/<domain>/` pure layer + the route-handler data path

AGENTS.md describes a `validation.ts` / `queries.ts` / `service.ts` convention. In
this **keyless** app the keyless `fetch` and orchestration were realized in the
**Route Handlers** (the one auditable place an upstream URL/params may live,
TC-DATA-01) rather than separate `queries.ts`/`service.ts` files — so the pure layer
is validators + transforms, and the handler is the orchestrator. The realized pattern
per upstream:

| Domain (`lib/`) | Pure files (zod + transforms) | Route handler (keyless fetch + orchestrate) |
|---|---|---|
| `lib/forecast/` | `validation.ts`, `types.ts`, `weather-code.ts`, `hourly.ts`, `format.ts` | `app/api/forecast/route.ts` |
| `lib/search/` | `validation.ts`, `types.ts`, `flag.ts` | `app/api/geocode/route.ts` |
| `lib/geo/` | `reverse-validation.ts`, `coordinate-label.ts`, `types.ts` | `app/api/reverse-geocode/route.ts` |
| `lib/scoring/` | `comfort.ts`, `types.ts` (pure, no upstream) | — (consumed by forecast/compare) |
| `lib/compare/` | `weekend.ts`, `row.ts`, `key.ts` (re-exports `lib/location/key.ts`) | — (reuses `/api/forecast`) |
| `lib/animated-bg/` | `day-night.ts`, `scene.ts` (pure, no upstream) | — |
| `lib/location/` | `types.ts`, `validation.ts`, `url.ts`, `key.ts` | — |
| `lib/clock/` · `lib/jokes/` · `lib/i18n/` · `lib/a11y/` | pure helpers + colocated tests | — |

**Handler contract (all three, TC-DATA-01 + NFR-OBS-01):** a `GET` that validates
inputs, does the keyless `fetch` with `AbortSignal.timeout`, **zod-parses the upstream
body** via the domain's pure validator, and returns a typed `{ ... }` success or a
typed `{ error: "failed" }` — **never a raw 500**, never letting the upstream shape
reach the client. The Open-Meteo/Nominatim URLs, param lists, and unit pins live
**only** in the handler; the client bundle carries the DTO + the `/api/...` path only
(verified: no upstream host/key in `.next/static`).

## 3. Client-driven rendering off a static page (the key constraint)

`app/page.tsx` is **statically prerendered** (no dynamic API). The architecture lesson
(caught by a build-output review in `add-forecast`): anything depending on the
visitor's clock OR the active location (`?lat=&lon=`) **must be client-driven** — a
server component would bake build-time/server-timezone values. So:

- `app/page.tsx` composes **named slot components** as the integration seam — later
  slices fill their slot, never edit `page.tsx`: `AppHeader` (logo + theme + clock
  slot), `ShellContent` (empty-vs-located responsive grid; forecast/map/compare
  slots), `AppFooter` (Open-Meteo + OSM credits + jokes slot), `WeatherBackground`
  (bg slot). See `components/shell/`.
- Client islands (`"use client"`): `SearchBox`, `ForecastSection`, `LocationMap`
  (via `dynamic(ssr:false)`), `CompareSection`, `WeatherBackground`, `TopClock`,
  `FooterJoke`. Each fetches/reads on the client off `useLocation()` or its own
  clock. `/` stays static; map (Leaflet) and chart (Recharts) are **lazy chunks**
  (NFR-PERF-03).

## 4. Providers and the WeatherContext publish flow

Mounted once in `app/layout.tsx` (a server component) in this exact nesting, wrapping
`{children}` inside a `<Suspense>` (Next 16 requires `useSearchParams` under Suspense):

```
ThemeProvider → LocationProvider → WeatherProvider → PinProvider → {children}
```

- **`LocationProvider`** (`useLocation()`) — the single active-location source,
  syncing `?lat=&lon=&name=` via `router.replace` (`lib/location/url.ts`). city-search
  and map **write** it; forecast / animated-bg / weekend-compare **read** it.
- **`WeatherProvider`** (`useWeather()`, **ADR-worthy cross-slice seam**) — an
  in-memory, fetch-free relay (ADR-0003). `ForecastSection` already owns the only
  weather fetch; on a successful forecast it **publishes** a `WeatherSnapshot`
  (`{ todayCategory, sunrise, sunset, utcOffsetSeconds, isLoaded }`); the decorative
  `WeatherBackground` **consumes** it — so the background needs no duplicate request
  (TC-DATA-01 / NFR-COST-01). Outside a provider it returns `NOT_LOADED_WEATHER`.
- **`PinProvider`** (`usePins()`) — the in-memory pinned-city list (0..3, cap +
  dedupe enforced in the provider). In-memory only, resets on reload (ADR-0003,
  BC-PRIVACY-03 — a test spies on `Storage.setItem`/`document.cookie`).
- **`ThemeProvider`** — light/dark, cookie-free. Reads the OS preference via
  **`useSyncExternalStore`** (server snapshot `"light"` === first client render → no
  hydration mismatch); `data-theme` is written only on an explicit override
  (`globals.css` `prefers-color-scheme` paints the system theme, no FOUC). This is
  the **G7 hydration fix** (see §8).

## 5. Comfort scoring

`lib/scoring/comfort.ts` — `comfortScore(daily): { value: 0..100, rationale }` is a
**pure total function** (**FR-COMFORT-01/02/03**): defined for every input from
feels-like temp, precip probability, wind, cloud cover, UV; rationale is a single
Ukrainian sentence ≤ 80 chars, no emoji. `bandOf(value)` → green ≥ 70 / yellow 40–69
/ red < 40 (`ComfortBadge`, color-not-only). `upcomingWeekend(days)` and
`lib/compare/weekend.ts selectWeekend` pair a Saturday only with its **consecutive**
Sunday by the location-local `time` date via a fixed `Date.UTC` parse — never
`toISOString`, never the viewer's clock (**FR-COMFORT-05**; the split-weekend bug was
fixed in review).

## 6. Day/night, the hourly window, and the location frame (timezone discipline)

Day-bound logic uses the **active location's** frame, not the viewer's — the recurring
correctness theme of this project:

- `lib/animated-bg/day-night.ts isDaytime(...)` shifts the absolute instant by the
  location's `utcOffsetSeconds` and compares time-of-day (**FR-ANIM-02**).
- `lib/forecast/hourly.ts nextHours(hourly, count, now, utcOffsetSeconds?)` — the
  48-hour window. Open-Meteo `timezone=auto` returns location-local timestamps; the
  4th param shifts `now` into that frame (`now + utcOffsetSeconds*1000`). This is the
  **G7 timezone fix** (see §8): the caller `ForecastSection.tsx` threads
  `forecast.utcOffsetSeconds`.

`Forecast.utcOffsetSeconds` is captured additively in `lib/forecast/{types,validation}.ts`
from the upstream `utc_offset_seconds`; the upstream key stays server-side, only the
DTO field reaches the client.

## 7. Internationalization and brand tone

`lib/i18n/{uk,en,index}.ts` — `t("namespace.key")` resolves nested dot-paths
(Ukrainian default → English fallback → ""). No runtime i18n library (**NFR-I18N-01**).
Per-domain namespaces (`search.*`, `forecast.*`, `comfort.*`, `map.*`, `compare.*`,
`clock.*`, `jokes.*`) extend `uk.ts`/`en.ts`; never reach into `shell.*`. Tone is calm
and practical with **no exclamation marks** anywhere in product copy (**BC-BRAND-01**,
swept by `lib/i18n/i18n.test.ts`). Empty/error copy is **eval-graded ≥ 90** (the
project bar).

## 8. Upstream data sources + their constraints

| Upstream | Used for | Keyless? | Policy / constraint |
|---|---|---|---|
| **Open-Meteo Forecast** (`/v1/forecast`) | 7-day daily + 48h hourly + sun + `utc_offset_seconds` | Yes (**TC-STACK-03**, NFR-COST-01) | `timezone=auto`, units pinned server-side; never exposed to client |
| **Open-Meteo Geocoding** (`/v1/search`) | City search suggestions (forward only) | Yes | server-side relay; **forward-only**, has no reverse endpoint (**ADR-0005**) |
| **OSM Nominatim** (`/reverse`) | Reverse-geocode a map click → display name | Yes (**ADR-0005**) | Nominatim usage policy: descriptive User-Agent/Referer, ≤ 1 req/s, HTTPS, no storage; degrades to a coordinate label on failure |
| **OSM raster tiles** (`*.tile.openstreetmap.org`) | Map tiles (Leaflet) | Yes (**TC-STACK-04**) | OSM Tile Usage Policy (**TC-MAP-01**): HTTPS, "© OpenStreetMap contributors" attribution always shown, valid Referer, no scraping |

ADR-0005 reconciles FR-MAP-03 honestly: Open-Meteo cannot reverse-geocode, so the
clicked point sets the location from coordinates **immediately** (forecast works off
lat/lon) and the name is a best-effort Nominatim enrichment that never blocks the click.

## 9. Honest-under-failure + security posture

- **NFR-OBS-01:** no input or upstream call produces a generic 500 or a silent blank.
  The shared `components/ui/Notice.tsx` (error → `role=alert`; empty/info →
  `role=status`) + `app/error.tsx` + `ErrorBoundary` are the calm degrade surfaces;
  the console stays silent on a healthy session.
- **Headers** (`next.config.ts`): CSP with `default-src 'self'`, `connect-src 'self'`
  (the only fetches are our own routes), `img-src` locked to `'self' data:` + OSM
  tiles, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`. `script-src` carries
  `'unsafe-inline'` (Next hydration) — a documented post-MVP hardening item (no XSS
  sink today; risk **R-08b** in `risk-register.md`). Leaflet marker icons are
  same-origin (no third-party CDN in `.next/static`).

## 10. ADR index

| ADR | Decision |
|---|---|
| [ADR-0001](../adr/ADR-0001-stack.md) | Adopt the requirement-mandated Next.js 16 / React 19 / TS / Tailwind 4 stack |
| [ADR-0002](../adr/ADR-0002-context-architecture.md) | Static vs dynamic context budget |
| [ADR-0003](../adr/ADR-0003-no-database-keyless.md) | No DB / auth / email — keyless, stateless; state in URL + memory |
| [ADR-0004](../adr/ADR-0004-testing-and-evidence-tooling.md) | Vitest layers; no Playwright; chrome-devtools MCP for E2E (env-gated) |
| [ADR-0005](../adr/ADR-0005-reverse-geocoding.md) | Reverse geocoding via OSM Nominatim (keyless) with a coordinate fallback |

See also `docs/technical/deployment.md`, the QA matrix
(`docs/qa/requirements-traceability-matrix.md`), and the per-domain specs under
`openspec/specs/`.
