## 1. Setup (i18n `map.*` namespace; Leaflet CSS load strategy)

> No database, no migrations, no auth, no email (ADR-0003). No new deps — `leaflet`,
> `react-leaflet`, and `@types/leaflet` are installed (`package.json`). Reuse the
> LOCKED conventions: `lib/i18n` namespaces + `t()`, `useLocation()` (READ for
> centre/marker, WRITE on click), the shared `components/ui/Notice.tsx`, the
> `app/api/geocode` Route Handler data path (mirrored by the new reverse-geocode
> handler), the `dynamic(ssr:false)` + same-footprint-skeleton pattern, and the
> ShellContent map slot. This slice introduces NO new color — the map container /
> skeleton reuse the existing `surface`/`border` tokens; nothing new for NFR-A11Y-02.
> Reverse-geocoding is reconciled per ADR-0005 (Open-Meteo is forward-only → keyless
> OSM Nominatim reverse, coordinate fallback).

- [ ] 1.1 Add a `map` namespace to `lib/i18n/uk.ts` (sibling to the other namespaces
  — never edit `shell.*`), with calm Ukrainian copy, **no exclamation marks**
  (BC-BRAND-01, D8, NFR-I18N-01): `map.regionLabel` (the map region's accessible
  name), `map.markerLabel` (the marker / popup aria label), `map.loading` (the
  skeleton / loading accessible label), **`map.fallbackName`** ("Обране місце" — the
  coordinate-fallback display label when no reverse name resolves), `map.reverseFailed`
  (the calm reverse-geocode-failed inline copy, if the component surfaces one), and
  `map.attribution` ONLY if the attribution is templated (the literal `© OpenStreetMap
  contributors` is the required FR-MAP-04 wording — prefer it verbatim). EVAL-GRADED:
  `map.fallbackName` / `map.reverseFailed` (≥ 90).
- [ ] 1.2 Mirror the same `map.*` keys in `lib/i18n/en.ts` (strict fallback subset,
  identical key shape). Same calm tone, no exclamation marks (D8, NFR-I18N-01).
- [ ] 1.3 Confirm `leaflet` / `react-leaflet` / `@types/leaflet` are already
  dependencies (they are, `package.json`); add NO new dependency.
- [ ] 1.4 Document + apply the **Leaflet CSS load strategy** (D7): Leaflet ships
  `leaflet/dist/leaflet.css`, REQUIRED for correct tile positioning, the zoom /
  attribution controls, and the popup chrome. Load it **with the client map chunk**
  — `import "leaflet/dist/leaflet.css"` inside `LocationMapClient.tsx` (or a module it
  imports) — so it ships only when the client map mounts and NEVER as part of the
  server / initial payload (consistent with the `ssr:false` client-only boundary).
  Confirm the import mechanism against the Next 16 + Tailwind 4 (PostCSS) build at
  implementation; record the chosen strategy in a code comment. (Also document the
  standard Leaflet default-marker-icon fix as a client-only concern — see 4.3.)

## 2. Pure domain logic (`lib/geo` — framework-free, TC-PURE-01)

> No `next/*`, no `react`, no DOM globals — 100% unit-testable, total (never throws
> to the UI). Colocated `*.test.ts` with `@trace` ids. Write the section 5 unit tests
> FIRST and confirm they FAIL (red) before implementing (test-first per AGENTS.md).
> Mirror the locked `lib/search`/`lib/location` `.safeParse` discipline.

- [ ] 2.1 `lib/geo/types.ts` (D2) — the internal contract crossing the Server↔Client
  boundary: `ReverseResult = { name: string | null }` (a resolved display name, or
  `null` → the client uses the coordinate fallback; the verbose Nominatim shape never
  crosses the boundary, TC-DATA-01); and `LatLon = { lat: number; lon: number }` (the
  `normalizeLatLon` output). Import the locked `Location` from `lib/location/types.ts`
  where needed (do NOT redefine it).
- [ ] 2.2 `lib/geo/reverse-validation.ts` (D2, FR-MAP-03, ADR-0005) — a **zod schema
  for the Nominatim `jsonv2` reverse response** and a **total** `parseReverseName(body:
  unknown): ReverseResult`. The response carries a top-level `display_name` (a full
  comma-joined label) and an `address` object with locality fields (e.g. `city` /
  `town` / `village` / `municipality` / `county` / `state`); an out-of-bounds / sea
  click returns an `{ error: ... }` object. Write the schema **permissively** (every
  field optional) and PREFER the most city-like locality (`city ?? town ?? village ??
  municipality ?? county ?? state`), else fall back to the top-level `display_name`,
  trimmed and length-bounded (≤ 120, matching `Location.name`). **TOTAL:** a malformed
  / partial / non-object body, an `{ error }` body, or a body with no usable name (incl.
  empty-after-trim) → `{ name: null }`, NEVER throws (the spec's "schema validation
  fails → treated as no usable place"). NOTE (no-hallucination): confirm the exact
  Nominatim `address` field spellings against a real reverse response at implementation;
  the permissive schema tolerates the actual shape.
- [ ] 2.3 `lib/geo/coordinate-label.ts` (D2, FR-MAP-03) — two pure, **total** helpers:
  (a) `normalizeLatLon(lat: number, lon: number): LatLon` — clamp latitude to
  `[-90, 90]` and **wrap** longitude into `[-180, 180]` (e.g. `lon 190.5 → -169.5`,
  `lat 95 → 90`); a non-finite input degrades to a safe value (e.g. `0`), never `NaN`.
  (b) `coordinateLabel(lat: number, lon: number): string` — a stable, rounded
  `"lat, lon"` string (a fixed small precision, dot-decimal) used as the popup display
  name when no reverse name resolves; total over any finite input, never throws.

## 3. Server (`app/api/reverse-geocode` Route Handler — keyless Nominatim fetch + zod + typed result)

> Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
> BEFORE writing. This is the ONLY place the Nominatim URL/params and the server
> `fetch` live (TC-DATA-01, ADR-0005) — MIRROR `app/api/geocode/route.ts` exactly.
> Keyless (TC-STACK-04, NFR-COST-01). Honest under failure (NFR-OBS-01): never a raw 500.

- [ ] 3.1 `app/api/reverse-geocode/route.ts` (D1, TC-DATA-01, ADR-0005) — export an
  async `GET(request: Request)`. Read `lat` + `lon` from the request URL's search
  params; parse them as finite numbers and **normalize** them via
  `normalizeLatLon` (`lib/geo`). Missing / non-numeric `lat`/`lon` → a typed
  `{ name: null }` result the client treats as fallback WITHOUT calling Nominatim
  (mirroring geocode's empty-`q` short-circuit; defence in depth against a tampered
  URL). The handler is NOT cached (Next 16 default; do NOT set `dynamic = 'force-static'`).
- [ ] 3.2 Keyless server-side fetch (D1, TC-STACK-04, NFR-COST-01, ADR-0005): for valid
  normalized `lat`/`lon`, `fetch` the OSM Nominatim reverse API (no API key, no auth
  header) — `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=<lat>&lon=<lon>&zoom=10&accept-language=uk`
  — with a **descriptive `User-Agent`** and a **`Referer`** identifying the app
  (Nominatim usage policy) and an **`AbortSignal.timeout`** (a short upstream deadline,
  ~4 s, mirroring geocode's `UPSTREAM_TIMEOUT_MS`). The Nominatim URL/params + the
  policy headers live ONLY here.
- [ ] 3.3 Parse + map (D1/D2): parse the upstream body with `lib/geo` (`parseReverseName`)
  and return `Response.json(result)` where `result` is `{ name } satisfies ReverseResult`.
  The client receives only the minimal typed `{ name }`, never the raw Nominatim shape.
- [ ] 3.4 Honest degradation — never a raw 500 (D1/D6, NFR-OBS-01): wrap the body so no
  exception escapes. Missing/non-numeric `lat`/`lon` → `{ name: null }` (no upstream
  call). A **non-OK** Nominatim status, a **thrown** fetch (network), a **timeout**
  abort, a `.json()` that throws, or a **zod-failed** 200 body → `{ name: null }
  satisfies ReverseResult` with a client-readable status (200, so the client `fetch`
  RESOLVES and reads the body — never an unhandled rejection, never partial data). Keep
  the server console clean on every failure path. Document in a comment why a route
  handler is used over a client-direct fetch (D1) — incl. that Nominatim's policy wants
  a real `User-Agent`/`Referer` a server fetch sets reliably — mirroring the
  `app/api/geocode/route.ts` header, and cite ADR-0005.

## 4. UI (`LocationMap` dynamic `ssr:false` + `MapSkeleton`; `LocationMapClient`; fill the slot)

> `"use client"` for the wrapper + client map — the ONLY place React / Leaflet /
> `fetch` / the click handler live. Client-ONLY per the ARCHITECTURE LESSON + FR-MAP-05
> (Leaflet touches `window`; it must never run on the server). Reuse `useLocation()`
> (READ for centre/marker, WRITE on click), `components/ui/Notice.tsx`, and the
> `dynamic(ssr:false)` + same-footprint-skeleton pattern. Do NOT edit `app/page.tsx`
> beyond the ShellContent slot file (§3a). All copy from `lib/i18n` `map.*` (no `!`).

- [ ] 4.1 `components/map/MapSkeleton.tsx` (D3, FR-MAP-05) — a calm placeholder
  occupying EXACTLY the same footprint (the same width / height / aspect-ratio box) as
  the mounted map, with the i18n `map.loading` accessible label. The skeleton and the
  map MUST share a single fixed-footprint sizing wrapper (one source of truth for the
  box) so the footprints cannot drift (no CLS). It doubles as the no-location
  placeholder so the map region is never silently blank.
- [ ] 4.2 `components/map/LocationMap.tsx` (`"use client"`, D3, FR-MAP-05) — the wrapper
  the slot mounts. Load the real map via `const LocationMapClient = dynamic(() =>
  import("./LocationMapClient"), { ssr: false, loading: () => <MapSkeleton/> })` so
  Leaflet/react-leaflet NEVER execute on the server (no SSR Leaflet markup/runtime, no
  `window` access during SSR). Render `<LocationMapClient/>` inside the fixed-footprint
  container. (Per the Next 16 lazy-loading doc, `dynamic(ssr:false)` must be called in a
  Client Component — hence `"use client"`; document WHY `ssr:false` and not
  `React.lazy`/Suspense: a lazy client component is still SSR-prerendered by default and
  Leaflet would crash on `window`.)
- [ ] 4.3 `components/map/LocationMapClient.tsx` (`"use client"`, D3, FR-MAP-01/02):
  render the react-leaflet tree against the active `useLocation()` location (READ for
  centring/marking). Import the Leaflet CSS here (1.4) and apply the standard Leaflet
  default-marker-icon fix (a client-only concern, documented). Compose:
  `MapContainer` centred on `[location.lat, location.lon]` at a city-level zoom (~11),
  pan/zoom interactive; an OSM `TileLayer` with the standard HTTPS raster URL
  (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) — the only tile source
  (TC-STACK-04); a single `Marker` at `[location.lat, location.lon]` with a `Popup`
  whose content is the location `name` (or the coordinate fallback when empty/unknown),
  the popup content wrapping/truncating a long name within a bounded width so it cannot
  overflow (the long-name scenario). The `MapContainer` key is STABLE (NOT keyed on the
  location). When `location` is `null`, render the calm placeholder (no `MapContainer`,
  no crash).
- [ ] 4.4 Recenter without remount (D3, FR-MAP-01): a child component using `useMap()`
  that, in an effect keyed on the active location, calls `map.setView([lat, lon],
  zoom)` so the view re-centres on a location change WITHOUT remounting the
  `MapContainer` (no tile flash). Mirror the marker/popup move + relabel to the new
  location (the marker follows because it is rendered at the active location's coords).
- [ ] 4.5 Click-to-set (D5, FR-MAP-03, ADR-0005): a child using `useMapEvents({ click })`
  that reads `e.latlng`, `normalizeLatLon`s it (clamp lat / wrap lon — the antimeridian
  scenario), then drives the relocate **coordinate-first**: (a) `setLocation({lat, lon,
  name: coordinateLabel(lat, lon)})` IMMEDIATELY (so the location/marker/centre update
  and the LocationProvider's URL sync triggers the forecast refetch at once — the
  forecast fetch is owned by `forecast`); (b) call `/api/reverse-geocode?lat=&lon=` (the
  internal route, NEVER Nominatim directly) and, on a typed `{ name: string }`,
  **UPGRADE** the location's `name` (a second `setLocation` with the SAME coords + the
  resolved name) — guarded so it applies ONLY IF the active location is still the
  clicked point (AbortController + captured-identity, latest-wins like `SearchBox`),
  applied at most once per click (no `setLocation` loop). On `{ name: null }` / network
  error / timeout, keep the coordinate-label name (no upgrade). The location is ALWAYS
  set from the clicked coordinates regardless of the name path.
- [ ] 4.6 Attribution always visible bottom-right (D4, FR-MAP-04, TC-MAP-01): show
  `© OpenStreetMap contributors` via Leaflet's attribution control (react-leaflet
  `AttributionControl position="bottomright"`, OR the `TileLayer` `attribution` prop —
  ONE single source so the string is present whenever tiles are shown) so it stays
  visible at every zoom/viewport and SURVIVES pan / zoom / click-to-relocate. HTTPS
  tiles only; browser-origin `Referer`; viewport-only loading; NO scraping / pre-fetch
  (OSM Tile Usage Policy).
- [ ] 4.7 Honest degradation (D6, NFR-OBS-01): a failed reverse lookup is NOT an error
  the visitor must see — the location is set + named-by-coordinates and the map works;
  if the component surfaces anything for the spec's "request fails" scenario, use a
  quiet `map.reverseFailed` Notice that never blocks the map and carries no `!`. Do NOT
  `console.log` caught errors (handle them into the coordinate fallback); abort the
  in-flight reverse request and ignore a stale resolution on unmount / a newer click (no
  "update on unmounted component"); the out-of-range normalize is SILENT (no
  `console.warn`). Keep the console silent on a healthy session.
- [ ] 4.8 Fill the ShellContent map slot (D7, §3a): in
  `components/shell/ShellContent.tsx` REPLACE the inert `<div data-slot="map"
  aria-hidden="true" />` (inside the LOCATED-state branch) with the real
  `<LocationMap/>`, preserving the responsive grid region (`grid-cols-1 md:grid-cols-2
  xl:grid-cols-3`) and the sibling `forecast`/`compare` slot placeholders.
  `LocationMap` MAY span grid columns. This is the shell's OWN located-state region — do
  NOT edit `app/page.tsx`.

## 5. Tests (Vitest only — unit + jsdom component + route-handler integration; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–4 to green.
> Every test file carries `@trace` ids. Never weaken a test to pass it; if a test
> contradicts the spec, change it deliberately. Use a mocked `fetch` for the network;
> do NOT hit the real Nominatim (keyless, but tests are deterministic and offline).
> jsdom has NO real Leaflet rendering — the client map is exercised with a **mocked
> react-leaflet** (its `MapContainer`/`TileLayer`/`Marker`/`Popup`/`AttributionControl`/
> `useMap`/`useMapEvents` replaced with light stand-ins that record props + expose the
> click handler), so the click→setLocation + reverse-name logic is tested WITHOUT a
> browser. A real-browser render is env-gated per ADR-0004 (chrome-devtools MCP).

- [ ] 5.1 Unit `lib/geo/reverse-validation.test.ts` (FR-MAP-03, ADR-0005, D2): feed a
  **real-ish** Nominatim `jsonv2` reverse body (a `display_name` + an `address` with
  `city`/`town`) and assert `parseReverseName` returns the most city-like name (trimmed,
  ≤ 120). Then feed **malformed** bodies (non-object; `null`; an `{ error: "Unable to
  geocode" }` body; an `address` with no usable locality and no `display_name`; a name
  that is whitespace-only) → assert each returns `{ name: null }` and NEVER throws. Feed
  a body where ONLY `display_name` is present → assert it falls back to `display_name`.
  `@trace FR-MAP-03`.
- [ ] 5.2 Unit `lib/geo/coordinate-label.test.ts` (FR-MAP-03, D2): assert
  `normalizeLatLon` clamps `lat 95 → 90`, `lat -95 → -90`, and WRAPS `lon 190.5 →
  -169.5`, `lon -181 → 179`, leaving in-range values unchanged; a non-finite input → a
  safe value (e.g. `0`), never `NaN`. Assert `coordinateLabel(50.4501, 30.5234)` returns
  a stable rounded `"lat, lon"` string (fixed precision, dot-decimal) and is total over
  any finite input (no throw). `@trace FR-MAP-03`.
- [ ] 5.3 Integration `app/api/reverse-geocode/route.test.ts` (TC-DATA-01, NFR-OBS-01,
  ADR-0005, D1): with `global.fetch` MOCKED, call the route's `GET` with
  `?lat=46.4825&lon=30.7233` and a mocked real-ish Nominatim body → assert it returns
  `{ name: "Одеса" }` (typed, minimal; the raw Nominatim shape never crosses the
  boundary). Assert the upstream URL is the KEYLESS Nominatim reverse host with the
  pinned params (`format=jsonv2`, `lat`, `lon`, `zoom=10`, `accept-language=uk`) and NO
  api key / auth header (NFR-COST-01), AND that a descriptive `User-Agent` (and
  `Referer`) header is sent (Nominatim policy). Mock a **non-OK** upstream, a **thrown**
  fetch, a **timeout** (an aborted/rejected fetch), a `.json()` that throws, and a
  **zod-failed** 200 body → assert each returns `{ name: null }` (NOT a raw 500, NOT
  partial data) with a client-readable status. Assert a **missing/non-numeric**
  `lat`/`lon` → `{ name: null }` WITHOUT calling Nominatim. Assert an **out-of-range**
  `lat`/`lon` (e.g. `lon=190.5`) is NORMALIZED before the upstream call (the sent `lon`
  is `-169.5`). Assert the server console stays clean on the failure paths. `@trace
  TC-DATA-01, NFR-OBS-01, FR-MAP-03`.
- [ ] 5.4 jsdom `components/map/LocationMap.test.tsx` — the client-only dynamic wrapper
  (FR-MAP-05, D3): assert the `dynamic(ssr:false)` wrapper renders the `MapSkeleton`
  (the `map.loading` accessible label, the same-footprint box) when the client chunk is
  NOT yet loaded — i.e. the wrapper does NOT synchronously render Leaflet, and the
  skeleton holds the layout. (Drive this by asserting the loading fallback / that no
  `MapContainer` stand-in is present before the lazy import resolves.) `@trace FR-MAP-05,
  NFR-PERF-03`.
- [ ] 5.5 jsdom `components/map/LocationMapClient.test.tsx` — bounded + marker +
  attribution over a **mocked react-leaflet** (FR-MAP-01/02/04, TC-MAP-01, D3/D4):
  `vi.mock("react-leaflet", ...)` with light stand-ins. With a mocked `useLocation()`
  active location (`Київ`, `50.4501, 30.5234`), render `LocationMapClient` and assert:
  the `TileLayer` stand-in received an `https://` OSM tile URL (TC-MAP-01); exactly one
  `Marker` at the location with a `Popup` containing `Київ`; the attribution string
  `© OpenStreetMap contributors` is present (FR-MAP-04). With a location whose `name`
  is empty → assert the popup shows the coordinate fallback label (not blank). With a
  120-char name → assert it is rendered within the popup (the component bounds it). No
  console warning. `@trace FR-MAP-01, FR-MAP-02, FR-MAP-04, TC-MAP-01`.
- [ ] 5.6 jsdom click→setLocation + reverse-name (FR-MAP-03, NFR-OBS-01, D5): over the
  mocked react-leaflet (capture the `useMapEvents` `click` handler) and a mocked
  `useLocation()` (spy `setLocation`) and a mocked `fetch` for `/api/reverse-geocode`:
  (a) invoke the click handler with a `latlng` near Odesa and a mocked `{ name: "Одеса" }`
  → assert `setLocation` is called with the clicked coords IMMEDIATELY (coordinate-label
  name) AND then UPGRADED to `{ name: "Одеса" }` at the same coords; (b) a click whose
  reverse returns `{ name: null }` → assert `setLocation` is called with the coords + the
  coordinate-label fallback and NO upgrade; (c) a click whose `/api/reverse-geocode`
  rejects (network) → same coordinate-label fallback, no throw, console clean; (d) a
  click at an OUT-OF-RANGE `latlng` (`lon 190.5`) → assert `setLocation` and the
  reverse request receive the NORMALIZED coords (`lon -169.5`), silently (no
  `console.warn`); (e) a quick second click before the first reverse resolves → assert
  the first click's late name does NOT overwrite the second location (guarded
  latest-wins). `@trace FR-MAP-03, NFR-OBS-01`.
- [ ] 5.7 jsdom console silence on a healthy session (NFR-OBS-01, D6): render the map
  (mocked react-leaflet) with an active location and invoke a click that resolves to a
  name → assert NO `console.error` / `console.warn` is emitted; assert the out-of-range
  normalize path (5.6d) also emits nothing to the console. `@trace NFR-OBS-01`.
- [ ] 5.8 EVAL `evals/cases/map-copy.eval.ts` (FR-MAP-03, NFR-OBS-01, BC-BRAND-01):
  browser-free cases whose `produce()` imports the pure `lib/i18n` dictionary and
  returns the user-visible `map.*` copy — one for the coordinate-fallback display label
  (`map.fallbackName`, "Обране місце") and one for the reverse-geocode-failed copy
  (`map.reverseFailed`). Rubric (mark gating lines `CRITICAL:`): natural fluent
  Ukrainian; no exclamation marks; the fallback label reads as a calm "a chosen place"
  (never an error / a dead end); the reverse-failed copy is calm + blame-free (the map
  still works, the location is set) and never alarmist; concise, no ALL-CAPS / jargon /
  error codes / coordinates-as-scary-numbers. Group by `dimension` (e.g.
  `map-fallback-clarity`, `map-reverse-failed-clarity`), mirror `@trace`. Fail LOUDLY if
  any key resolves blank (so the case is RED until the namespace ships). Target every
  dimension ≥ 90. `@trace FR-MAP-03, NFR-OBS-01, BC-BRAND-01`.

## 6. Validation, docs, and archive prep

- [ ] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red) for the right
  reason (missing modules, not weak assertions), then implement sections 1–4 to green
  (test-first per AGENTS.md). Never weaken a test to pass it; if a test contradicts the
  spec, change it deliberately, not silently.
- [ ] 6.2 Run `npm run lint` — zero errors/warnings (incl. the import-boundary check:
  `lib/geo` has no `next/*`/`react`/DOM imports, TC-PURE-01; no inline UI literals,
  NFR-I18N-01; `react-leaflet`/`leaflet` imported ONLY in the client map components).
- [ ] 6.3 Run `npm run test:run` — all unit + jsdom component + route-handler
  integration tests green.
- [ ] 6.4 Run `npm run build` — production build succeeds; console clean. Confirm the
  `app/api/reverse-geocode` route compiles as a Route Handler (dynamic, not cached); the
  client bundle carries NO `nominatim.openstreetmap.org` reference and no key
  (TC-DATA-01, NFR-COST-01); the SSR output has **no Leaflet markup/runtime** and
  **Leaflet is in a lazy client chunk, not the initial bundle** (FR-MAP-05, NFR-PERF-03)
  — inspect the `next build` output / `.next/static`; and the OSM tile URL is HTTPS with
  attribution present (TC-MAP-01).
- [ ] 6.5 Run `node scripts/check-eval-ratchet.mjs` (the graded-quality bar) — the new
  `map.*` eval dimensions are ≥ 90 and the committed score does not drop. (The eval-suite
  judge workflow, maker≠checker, grades the copy and writes results; the maker does not
  self-grade — record SKIP if `evals/results/latest.json` is absent.)
- [ ] 6.6 Run `npx openspec validate add-map --strict` — zero errors/warnings ("Change
  'add-map' is valid").
- [ ] 6.7 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [ ] 6.8 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark `add-map`
  implemented/validated/archived, and record the conventions for downstream reuse: the
  `map.*` i18n namespace; the **`app/api/reverse-geocode` Route Handler** data path
  (keyless OSM Nominatim reverse, zod-parsed, typed `{ name }`, honest degradation — the
  same TC-DATA-01 pattern as geocode, reconciled per ADR-0005 because Open-Meteo is
  forward-only); `lib/geo/{types,reverse-validation,coordinate-label}.ts` as the pure geo
  layer (`parseReverseName` total → `{ name|null }`, `normalizeLatLon` clamp/wrap,
  `coordinateLabel`); `components/map/{LocationMap,LocationMapClient,MapSkeleton}.tsx`
  (the `dynamic(ssr:false)` client-only Leaflet map + same-footprint skeleton + the
  click→reverse→fallback flow) filling the ShellContent map slot; the map being the only
  slice that BOTH reads and writes `useLocation()`; and that ADR-0005 is accepted. Plus
  the exact next step (Wave 4: `add-animated-bg`, then Wave 5: `add-weekend-compare`).
- [ ] 6.9 SERVICE/RENDER smoke over a MOCKED Nominatim payload (NOT a DB smoke — there is
  no DB, ADR-0003), step by step: (a) with `global.fetch` mocked to a real-ish Nominatim
  reverse body, call the `app/api/reverse-geocode` `GET` with `?lat=46.4825&lon=30.7233`
  and assert it returns typed `{ name: "Одеса" }` (minimal, no raw Nominatim shape); (b)
  mock a malformed / `{ error }` body and assert `{ name: null }` (NOT a raw 500); (c)
  mock a non-OK / thrown / timed-out upstream and assert `{ name: null }`; (d) under
  jsdom with a **mocked react-leaflet**, render `<LocationMap/>` and assert the
  `MapSkeleton` renders (same-footprint, `map.loading` label) before the client chunk
  loads, and (with the client map) the OSM `TileLayer` HTTPS URL + the single `Marker`
  with the city `Popup` + the `© OpenStreetMap contributors` attribution are present;
  (e) invoke the captured click handler with a `latlng` + a mocked reverse name and
  assert `setLocation` is called with the (normalized) coords and then upgraded to the
  resolved name, with a clean console. Capture the pass output as the smoke evidence.
- [ ] 6.10 GATED on 6.9 passing: `npx openspec archive add-map --yes --skip-specs` (the
  baseline `openspec/specs/map/spec.md` already holds the contract, so the delta is NOT
  re-applied via Option B). Do not archive before the service/render smoke passes.
