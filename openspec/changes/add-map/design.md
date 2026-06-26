## Context

`add-map` is a **Wave 3** slice (capability plan §4.7, §6) off the archived
`add-app-shell` / `add-comfort-score` / `add-top-clock` / `add-bottom-jokes`
foundation and the validated `add-city-search`. It **branches off `city-search`**
(parallel-safe with `add-forecast` — a disjoint module: `lib/geo`, the
`reverse-geocode` route, `components/map`). The shell shipped the region this slice
fills: `components/shell/ShellContent.tsx` renders an inert
`<div data-slot="map" aria-hidden="true" />` inside its **located-state** branch
(shown only when a location is active). This slice replaces that placeholder with a
real `<LocationMap/>` and adds a sibling `map.*` i18n namespace — it touches no other
shell file and does **not** edit the shared `app/page.tsx` serialize point (§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no auth,
no email**. The external dependencies are the **keyless** OSM raster tiles (browser →
OSM, HTTPS, attributed, TC-STACK-04/TC-MAP-01) and the **keyless** OSM Nominatim
reverse-geocoding API (server → Nominatim, ADR-0005) — no API key anywhere in the repo
or the bundle (NFR-COST-01). Tests are **Vitest** only — pure unit tests, jsdom
component tests (with a **mocked react-leaflet**, since a real Leaflet DOM needs a
browser), and a route-handler integration test over a **mocked** `fetch` — **no
Playwright** (TC-STACK-05, ADR-0004). The per-slice "smoke" is a **service/render
smoke over a MOCKED Nominatim payload**, not a DB smoke. The Next.js 16 App Router
**Route Handler** boundary and the **`dynamic`/client-component** rules apply: read
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`,
`05-server-and-client-components.md`, and `02-guides/lazy-loading.md` before writing
any handler / dynamic-import code.

The locked conventions reused **verbatim**, not re-built:

- **The `add-city-search` Route Handler data path (THE Wave-3 reuse pattern,
  TC-DATA-01)** — `app/api/geocode/route.ts` is the template: a Next 16 `GET` doing the
  keyless server `fetch`, with the upstream URL/params living ONLY in the handler,
  zod-parsing via the pure `lib/<domain>`, and returning a typed minimal result that
  degrades honestly (never a raw 500). `add-map` mirrors this exactly with
  `app/api/reverse-geocode/route.ts` + `lib/geo`.
- **The active-location state** — `lib/location/{types,validation,url}.ts` (pure,
  total, `Location = {lat, lon, name}`) and `components/providers/LocationProvider.tsx`,
  whose `useLocation() → {location, setLocation}` syncs `?lat=&lon=&name=`. The map
  **reads** it (centre/marker) AND **writes** it (on a click) — the only slice that
  does both. It never re-parses the URL; it reads the validated `location` and calls
  `setLocation`.
- **The shared inline error/empty primitive** — `components/ui/Notice.tsx` (`error` →
  `role="alert"`; `empty`/`info` → `role="status"`; calm i18n copy; no exclamation
  marks). The no-location placeholder and any reverse-geocode failure surface a calm
  state, never a toast or 500.
- **i18n** — the `t("namespace.key")` dotted accessor (UK default → EN fallback → "");
  add a `map.*` namespace, never reaching into `shell.*`. No runtime i18n library
  (NFR-I18N-01).
- **The dynamic-import pattern** — client-only widgets that pull a heavy/browser-only
  dep load via `dynamic(() => import(...), { ssr: false })` with a same-footprint
  skeleton (AGENTS.md module conventions; `add-forecast` applied it to Recharts, this
  slice applies it to Leaflet). The ARCHITECTURE LESSON (current-state): anything
  depending on the active location is **client-driven** (the map IS client-only here).

## Goals / Non-Goals

**Goals:**

- Render an interactive **Leaflet** map (via react-leaflet) using **OSM raster tiles**
  over **HTTPS**, centred/bounded to the active `useLocation()` location at a city-level
  zoom; re-centre on a location change **without a full remount** (FR-MAP-01).
- Place a single **`Marker`** at the active location with a **`Popup`** naming the city;
  move/relabel both when the location changes; fall back to a calm label when the name
  is unknown; contain an unusually long name without breaking layout (FR-MAP-02).
- Treat a **click** as a relocate: normalize the clicked coordinates, set the active
  location **immediately** by those coordinates, resolve a **display name** via a keyless
  reverse-geocode route handler with a **coordinate fallback**, and let the location
  change trigger the forecast refetch (FR-MAP-03, ADR-0005).
- Always show **`© OpenStreetMap contributors`** attribution bottom-right, at every zoom
  and viewport, with a valid `Referer` from the app origin — the OSM Tile Usage Policy
  (FR-MAP-04, TC-MAP-01).
- Load the map **client-only** via `dynamic(ssr:false)` so Leaflet never runs on the
  server, behind a **same-footprint skeleton** so there is **no layout shift** (FR-MAP-05).
- Keep the **Nominatim URL and response shape server-side** behind a Route Handler so the
  client bundle carries only `/api/reverse-geocode` + the `{ name }` contract and no key
  is implied (TC-DATA-01, NFR-COST-01).
- Degrade **every** failure (no-named-place, malformed payload, out-of-range click,
  network/timeout) to a calm state with a **silent console** on a healthy session
  (NFR-OBS-01); the handler never returns a raw 500; a click ALWAYS sets a usable
  location.
- Keep the pure layer (`lib/geo`) framework-free and 100% unit-testable (TC-PURE-01);
  React / DOM / Leaflet / `fetch` concerns live only in the client map and the route
  handler.

**Non-Goals (explicit Exclusions — see the spec):**

- Non-OSM tile providers, vector tiles, satellite imagery, custom map styles (OSM raster
  only, TC-STACK-04).
- Drawing / routing / distance measurement / geofencing / map editing.
- Marine / aviation / agriculture overlays or weather layers on the map.
- Multiple markers, clustering, or pinning cities (multi-city compare is owned by
  `weekend-compare`).
- Persisting the last map view / zoom / location across reloads (no DB, no cookies —
  BC-PRIVACY-03).
- Triggering **geolocation** from the map (opt-in, owned by `city-search`, BC-PRIVACY-02).
- Offline tile caching or bulk tile pre-fetching (prohibited by TC-MAP-01).
- The **forecast fetch** itself and its rendering/caching (owned by `forecast`; the map
  only emits the location change).
- Browser-rendered evidence (a real Leaflet render, videos, live axe, vision) — env-gated
  per ADR-0004; rendering is covered by jsdom tests over a mocked react-leaflet.

## Decisions

### D1 — Reverse-geocoding reconciliation: OSM Nominatim, keyless, behind a Route Handler (FR-MAP-03, ADR-0005, ADR-WORTHY)

- **The conflict, stated honestly.** FR-MAP-03 / the baseline spec say a map click sets
  the location "reverse-geocoded via Open-Meteo". But the **Open-Meteo geocoding API is
  FORWARD-ONLY** (`/v1/search?name=...`, name → coords) and has **no reverse endpoint**
  (coords → name). The requirement as literally written is **not implementable** against
  Open-Meteo. A capability spec must rest on a real keyless code path, so this is
  reconciled deliberately rather than by fabricating an Open-Meteo reverse call.
- **The reconciliation (the decision).** On a click we **set the active location by the
  clicked coordinates immediately** — the forecast/comfort capabilities work off
  `lat`/`lon` and need **no** name, so the location change is fully usable at once — and
  obtain the **display name** via **OSM Nominatim reverse geocoding**, the reverse
  counterpart Open-Meteo lacks, in the **same OSM ecosystem as the tiles** (TC-STACK-04,
  TC-MAP-01) and equally **keyless** (NFR-COST-01).
- **`app/api/reverse-geocode/route.ts`** is a Next 16 App Router **Route Handler**
  exporting an async `GET(request: Request)`, **mirroring `app/api/geocode/route.ts`
  exactly**:
  - reads `?lat=&lon=`, parses them as finite numbers and **normalizes** them
    (`normalizeLatLon`: clamp lat to `[-90,90]`, wrap lon into `[-180,180]`); missing /
    non-numeric `lat`/`lon` → a typed `{ name: null }` result **without** an upstream call;
  - performs the **keyless server-side** `fetch` to
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=<lat>&lon=<lon>&zoom=10&accept-language=uk`
    (no API key, no token) with a **descriptive `User-Agent`** and a **`Referer`**
    identifying the app (Nominatim usage policy) and an **`AbortSignal.timeout`** (a short
    upstream deadline, ~4 s, mirroring geocode's `UPSTREAM_TIMEOUT_MS`);
  - parses the body with the pure `lib/geo` zod schema (`parseReverseName`) into a minimal
    `{ name: string | null }` and returns `Response.json(result)`. The client hits
    **`/api/reverse-geocode?lat=&lon=`** and never sees the Nominatim URL, params, or raw
    shape.
- **Why a Route Handler over a client-direct Nominatim fetch (the same rationale geocode
  established, reused):** (1) the upstream contract stays server-side (TC-DATA-01) — the
  Nominatim URL/params and verbose response live in one server file behind the `{ name }`
  DTO; (2) one auditable place where any key/header would be added (a review asserts zero
  keys reach the client, NFR-COST-01); (3) one honest-degradation choke point (zod, non-OK,
  network, timeout, bad-params all resolve here to a typed result, NFR-OBS-01); (4)
  same-origin / CORS-free / encoding-controlled — and crucially **Nominatim's usage policy
  wants a real `User-Agent`/`Referer`**, which a server fetch sets reliably (a browser
  fetch cannot set `User-Agent` and would expose a cross-origin call).
- **Honest degradation (NFR-OBS-01).** The handler **never throws to a 500**: bad/missing
  `lat`/`lon` → `{ name: null }` (no upstream call); a **non-OK** Nominatim status, a
  **thrown** fetch (network), a **timeout** abort, a `.json()` throw, or a **zod-failed**
  body → `{ name: null }` with a **client-readable status (200)** so the client `fetch`
  resolves and reads the typed body. The whole body is wrapped so no unexpected throw
  escapes. The client then uses `coordinateLabel(lat, lon)` / the i18n `map.fallbackName`
  ("Обране місце") as the popup name — so a click **ALWAYS** sets a usable location, never
  a blank, never a crash. Not cached (Next 16 default; we do **not** set
  `dynamic = 'force-static'`).
- **Nominatim usage policy (TC-MAP-01-adjacent obligations, ADR-0005):** valid descriptive
  `User-Agent`/`Referer`; ≤ 1 req/s (a single human click is far below — no bulk/auto
  reverse, no scraping, no pre-fetch); results not persisted (BC-PRIVACY-03); HTTPS only;
  the short timeout bounds latency; the coordinate fallback covers a rate-limit/outage.
- **Trade-off:** a route handler adds one server hop (client → our route → Nominatim) vs a
  direct client fetch; for a per-click, on-demand name lookup the extra hop is negligible
  and buys the four properties above **plus** the reliable `User-Agent` Nominatim's policy
  asks for. A direct client fetch would bake the Nominatim URL/shape into the bundle,
  cannot set `User-Agent`, and exposes a cross-origin call. **This is the ADR-worthy
  decision — recorded in `docs/adr/ADR-0005-reverse-geocoding.md`** (Open-Meteo cannot
  reverse; OSM/Nominatim can; keyless; coordinate fallback; provider-swappable behind the
  handler).

### D2 — Pure framework-free `lib/geo`: total reverse parse + coordinate label + coordinate normalize (TC-PURE-01)

- **`lib/geo/types.ts`** — the internal contract crossing the Server↔Client boundary:
  `ReverseResult = { name: string | null }` (the only shape the client knows; the verbose
  Nominatim fields never leak past the server, TC-DATA-01). A `LatLon = { lat: number;
  lon: number }` helper for the normalize output.
- **`lib/geo/reverse-validation.ts`** — the **zod schema for the Nominatim reverse
  response** and a **total** `parseReverseName(body: unknown): ReverseResult`. Nominatim's
  `jsonv2` reverse response carries a top-level `display_name` (a full comma-joined label)
  and an `address` object with locality fields (e.g. `city` / `town` / `village` /
  `municipality` / `state`); an out-of-bounds or sea click returns an `{ error: ... }`
  object instead. **NOTE (no-hallucination):** the exact `address` sub-keys vary by place;
  the schema is written **permissively** — every field optional — and the parser PREFERS
  the most city-like locality (`city ?? town ?? village ?? municipality ?? county ??
  state`), else falls back to the top-level `display_name`, trimmed and length-bounded
  (≤ 120 chars, matching the `Location.name` bound). Confirm the field spellings against a
  real Nominatim reverse response at implementation; the permissive schema tolerates the
  actual shape. Following the locked `.safeParse` discipline the parse is **total**: a
  malformed / partial / non-object body, an `{ error }` body, or a body with no usable
  name → `{ name: null }` and **NEVER throws** to the UI. An empty-after-trim name →
  `{ name: null }` (the client uses the coordinate fallback). This is the spec's "schema
  validation fails → treated as no usable place, not rendered or allowed to throw".
- **`lib/geo/coordinate-label.ts`** — two pure helpers, both **total**:
  - `normalizeLatLon(lat: number, lon: number): LatLon` — clamps latitude to `[-90, 90]`
    and **wraps** longitude into `[-180, 180]` (e.g. `lon 190.5 → -169.5`, `lat 95 → 90`).
    Applied to a click's raw `latlng` (Leaflet can yield out-of-range / antimeridian
    values) BEFORE any reverse request or location change, so the marker/popup/centre, the
    reverse request, and the downstream forecast all receive normalized in-range
    coordinates (the spec's antimeridian scenario). Non-finite input degrades to a safe
    value (e.g. `0`) rather than producing `NaN`.
  - `coordinateLabel(lat: number, lon: number): string` — a stable, rounded `"lat, lon"`
    string (a fixed small precision, dot-decimal, the locale-agnostic minus) used as the
    popup display name when no reverse name resolves. Total over any finite input; for a
    non-finite input it returns the i18n fallback marker is the component's job (the lib
    returns a string, never throws).
- **Trade-off:** keeping the zod parse, the name-extraction preference, the wrap/clamp,
  and the label formatting in a framework-free module (rather than inline in the handler or
  the component) makes them **unit-tested deterministically** against a real-ish Nominatim
  payload and against malformed / empty / `{ error }` / out-of-range inputs without a
  server, jsdom, or Leaflet (TC-PURE-01). The cost is a couple of module boundaries, which
  the locked module convention already mandates. `normalizeLatLon` lives in the pure layer
  (not the component) precisely so the antimeridian behaviour is unit-tested without a map.

### D3 — Client-only map: `dynamic(ssr:false)` + same-footprint skeleton; bounded + marker + recenter (FR-MAP-01/02/05, ARCHITECTURE LESSON)

- **`components/map/LocationMap.tsx`** is the wrapper the slot mounts. It loads the real
  map via
  **`const LocationMapClient = dynamic(() => import("./LocationMapClient"), { ssr: false,
  loading: () => <MapSkeleton/> })`** so **Leaflet/react-leaflet never execute on the
  server** (they touch `window`/`document`; FR-MAP-05). `LocationMap` itself is a thin
  client component (`"use client"`, since `next/dynamic` with `ssr:false` must be called in
  a Client Component per the Next 16 lazy-loading doc) that renders `<LocationMapClient/>`
  inside a fixed-footprint container. **Why `ssr:false` (not `React.lazy`/Suspense):** the
  doc is explicit that a `React.lazy` client component is still SSR-prerendered by default;
  Leaflet would then run on the server and throw on `window`. `ssr:false` is the mechanism
  that disables that prerender (FR-MAP-05's "no Leaflet markup/runtime in SSR output").
- **`components/map/MapSkeleton.tsx`** is a calm placeholder occupying **exactly the same
  footprint** (the same width / height / aspect-ratio box) as the mounted map, with the
  i18n `map.loading` accessible label, so swapping the real map in causes **no layout
  shift** (CLS; FR-MAP-05's "skeleton holds the layout"). The skeleton and the map share a
  single sizing wrapper (one source of truth for the box) so the footprints cannot drift.
  The skeleton is also the **no-location placeholder** (or a sibling calm state) so the map
  region is never silently blank.
- **`components/map/LocationMapClient.tsx`** (`"use client"`) renders the react-leaflet
  tree against the active `useLocation()` location (read-only here for centring/marking):
  - **`MapContainer`** centred on `[location.lat, location.lon]` at a **city-level zoom**
    (e.g. ~11), with pan/zoom interactive (FR-MAP-01's "pan and zoom").
  - **`TileLayer`** with the **standard OSM raster tile URL over HTTPS**
    (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) — the only tile source
    (TC-STACK-04). Tiles are requested by the browser from the app origin, so each carries a
    valid `Referer` (TC-MAP-01); no scraping / bulk pre-fetch (Leaflet fetches only the
    visible viewport by default).
  - **`Marker`** at `[location.lat, location.lon]` with a **`Popup`** whose content is the
    location `name` (or the coordinate fallback when empty/unknown). The popup content wraps
    / truncates a long name within a bounded width so it cannot overflow the popup, controls,
    or attribution (the spec's long-name scenario).
  - **`AttributionControl`** pinned bottom-right (D4).
  - A **recenter** child using **`useMap()`**: on a location change it calls
    `map.setView([lat, lon], zoom)` in an effect keyed on the location, so the view
    re-centres **without remounting** the `MapContainer` (no tile flash; FR-MAP-01's
    "not fully remounted"). The `MapContainer` key is **stable** (NOT keyed on the location)
    precisely so React does not remount it on every location change.
  - A **click handler** child using **`useMapEvents({ click })`** (D5).
- **Leaflet's default marker-icon issue:** Leaflet resolves its marker icon images from a
  CSS-relative path that bundlers break; the client map sets up the marker icon explicitly
  (the standard `L.Icon`/`L.icon` default-icon fix or a provided icon) so the marker
  renders (a code comment documents this; it is a client-only concern, never on the server).
- **No-location state:** when `useLocation().location` is `null`, the client map renders the
  calm placeholder/skeleton (no `MapContainer`, no crash) — though in practice the slot lives
  in the shell's **located** branch, so the map normally mounts only with a location; it
  still guards `null` (the safe `useLocation()` default).
- **Trade-off:** `dynamic(ssr:false)` means a brief skeleton before the map paints (vs an
  eagerly-bundled map that would inflate the initial JS, blow NFR-PERF-03, and crash on the
  server's missing `window`). For a below-the-fold map the skeleton is the right trade; the
  cost is one extra dynamic boundary + a skeleton, which the locked pattern already
  prescribes. Re-centring via `useMap().setView` (vs re-keying the `MapContainer`) avoids a
  full remount + tile re-fetch flash, at the cost of a small effect — the correct trade for
  FR-MAP-01.

### D4 — Attribution always visible, bottom-right; OSM Tile Usage Policy (FR-MAP-04, TC-MAP-01)

- The map **always** shows **`© OpenStreetMap contributors`** in the **bottom-right** via
  Leaflet's attribution control (react-leaflet `AttributionControl` at `position="bottomright"`,
  or the `TileLayer`'s `attribution` prop — whichever single source the component uses, the
  attribution string is present whenever tiles are shown). It stays visible at **every** zoom
  level and viewport and **survives** pan / zoom / click-to-relocate (FR-MAP-04's two
  scenarios) because it is a persistent control, not transient UI. The attribution text is
  centralised in `map.*` if templated (NFR-I18N-01), but the literal
  `© OpenStreetMap contributors` is the required wording.
- **OSM Tile Usage Policy compliance (TC-MAP-01):** HTTPS tiles only; mandatory attribution
  (above); tiles fetched by the browser from the app origin so each request carries a valid
  `Referer` identifying the app (not blank, not third-party); **no scraping, no bulk
  pre-fetching** (Leaflet loads only the visible viewport; the slice does no offline cache /
  pre-fetch). The marker icon and controls add no third-party hosts. This is verified by the
  spec scenarios + review (the build/network panel is browser-gated per ADR-0004; the policy
  conformance — HTTPS URL, attribution string present, OSM-only host — is asserted in the
  jsdom test over the mocked react-leaflet and by code review).
- **Trade-off:** none of substance — attribution is mandatory and a persistent control is the
  standard, lowest-risk way to keep it always visible. Using Leaflet's own attribution control
  (vs a hand-rolled overlay) guarantees it survives interaction and zoom without bespoke
  plumbing.

### D5 — Click-to-set: normalize → set location immediately → resolve name with coordinate fallback (FR-MAP-03)

- A **`useMapEvents({ click })`** child reads the click's `e.latlng` (`{ lat, lng }`),
  **normalizes** it via `normalizeLatLon(lat, lng)` (clamp lat, wrap lon — the antimeridian
  scenario), and then drives the relocate:
  1. **Set the location immediately** by the normalized coordinates:
     `setLocation({ lat, lon, name })`. The location change is what re-centres the map, moves
     the marker, and (via the LocationProvider's URL sync) triggers the `forecast` capability's
     refetch — so the forecast re-fetch and the marker/centre always happen, even if the name
     resolves late or not at all. The provider owns the URL sync (the map never writes the URL
     itself).
  2. **Resolve the display name** by calling **`/api/reverse-geocode?lat=&lon=`** (the internal
     route, NEVER Nominatim directly). On a typed `{ name: string }` the location's `name`
     is the resolved place (e.g. `Одеса`). On `{ name: null }`, a network error, or a timeout,
     the name is **`coordinateLabel(lat, lon)`** (or the i18n `map.fallbackName` "Обране місце")
     — the spec's "no named place" / "malformed payload" / "request fails" scenarios all land
     here, calmly.
- **Two viable sequencings (the component picks one, both honest):** (a) **coordinate-first** —
  `setLocation` with `coordinateLabel` immediately, then on the reverse response **upgrade** the
  `name` (a second `setLocation` with the same coords + the resolved name) if it still matches
  the active location; or (b) **await-then-set-once** — fetch the name first (with the
  coordinate fallback on failure) and `setLocation` once with the final name. **Decision:**
  prefer **(a) coordinate-first** so the location/marker/forecast update with zero added latency
  and the name fills in when it arrives — this best satisfies "the active location is still set
  to the clicked coordinates" on every failure path and "a forecast re-fetch is triggered" even
  while the name is pending. The upgrade is **guarded** (apply the resolved name only if the
  active location is still the clicked point) so a quick second click never gets the first
  click's late name — the same latest-wins discipline `SearchBox` uses (AbortController +
  identity guard). The component must avoid a `setLocation` loop (the upgrade sets the SAME
  coords, only the name differs, and is applied at most once per click).
- **Reverse-geocode failure copy (NFR-OBS-01):** a failed reverse lookup is **not** an error
  the visitor must see — the location is set and named-by-coordinates, the map works. The spec's
  "reverse geocoding request fails → a calm inline Ukrainian message" is satisfied by the
  coordinate-label fallback being a calm, legible label (and, if the component chooses to show
  anything, a quiet `map.reverseFailed` Notice that never blocks the map and carries no `!`).
  The **previous active location remains usable** (a failed click that the visitor ignores
  leaves the prior location selected; a completed click sets the new coordinates with a fallback
  name). No toast, no 500, no uncaught exception; the console stays silent.
- **Trade-off:** coordinate-first + a guarded name-upgrade adds a second `setLocation` on the
  happy path (one extra URL `replace`), but it removes all name-latency from the relocate and
  makes every failure path trivially correct (the location is always set immediately). The
  alternative (await-then-set-once) is simpler but delays the marker/forecast until the name
  resolves, which reads worse and complicates "set the coordinates even when reverse fails".

### D6 — Honest degradation everywhere; console silent during map usage (NFR-OBS-01)

- The slice reduces every outcome to a calm state, never a toast / 500 / uncaught throw: the
  **no-location** placeholder (calm), the **loading** skeleton (calm, same footprint), the
  **resolved** map (tiles + marker + popup + attribution), and every **reverse failure**
  (no-name / malformed / out-of-range / network / timeout) handled by the **coordinate-label
  fallback** so the click still sets a usable location. The **route handler** (D1) is the first
  line: every server-side fault collapses to a typed `{ name: null }` the client reads, so the
  client `fetch` always resolves and branches on the typed shape — no unhandled rejection, no
  opaque body to misread.
- **zod is the gate (the spec's payload contract).** The Nominatim body is parsed by the
  `lib/geo` schema before any name is used; a 200 whose body fails the schema (malformed JSON,
  missing fields, wrong types, an `{ error }` body) is treated as **no usable place**
  (`{ name: null }`) — discarded, never rendered, never thrown (the spec's "malformed payload"
  scenario).
- **Coordinate normalization is silent (the spec's antimeridian scenario):** an out-of-range /
  past-the-antimeridian click is **normalized** by `normalizeLatLon` before the location change
  — silently, in the UI/data, **not** via `console.warn`. The marker, popup, centre, reverse
  request, and forecast all receive the normalized coordinates.
- **Console silence (the spec's dedicated requirement).** On a healthy session — initial render,
  pan, zoom, click-to-relocate (including a click that yields no named place) — **no**
  `console.error` / `console.warn`. The reverse `fetch` is guarded (abort + identity, the
  effect ignores a stale resolution on unmount / a newer click), caught errors are handled into
  the fallback (never logged), and the client map's expected conditions are communicated through
  the UI (the coordinate label) or silently normalized — never the console.
- **Trade-off:** reusing the shared `Notice` for the (rare) visible message and the
  coordinate-label fallback for the name keeps the calm tone, the a11y roles, and the
  no-exclamation copy consistent app-wide — the "build the inline-error pattern once, reuse
  everywhere" mandate; the cost is that the fallback label + any reverse-failed copy must read
  well, which the `map.*` copy handles and the eval grades.

### D7 — Pure `lib/geo` boundary + the Leaflet CSS load strategy

- `lib/geo` is **framework-free** (TC-PURE-01): zod + plain TS only, no `next/*`, no `react`,
  no DOM. The route handler and (for the coordinate label / normalize) the client component
  import from it, so the parsing/normalizing logic has a single source of truth and is
  unit-tested without a server, jsdom, or Leaflet.
- **Leaflet CSS strategy (documented, tasks 1.x):** Leaflet ships `leaflet/dist/leaflet.css`
  which is **required** for correct tile positioning, the zoom/attribution controls, and the
  popup chrome (without it the map renders broken). The CSS is loaded **with the client map
  chunk** — imported inside `LocationMapClient.tsx` (or a module it imports) — so it ships only
  when the client map mounts and **never** as part of the server/initial payload (consistent
  with the `ssr:false` client-only boundary). The exact import mechanism (`import
  "leaflet/dist/leaflet.css"` in the client module, given the Next 16 + Tailwind 4 PostCSS
  setup) is confirmed at implementation against the build; a code comment records the chosen
  strategy. The map's own layout uses the locked `surface`/`border` tokens for the
  container/skeleton (no new color → nothing new for NFR-A11Y-02).
- **Trade-off:** importing the CSS in the client module (vs a global `app/globals.css` import)
  keeps Leaflet's styles scoped to the lazy client chunk, so the initial page does not pay for
  them and the server never processes map-only CSS — at the cost of the import living in the
  component module rather than the global stylesheet, which is the correct trade for a
  client-only widget.

### D8 — i18n: a `map.*` namespace; the calm fallback label and aria/loading copy

- Add a **`map.*`** namespace to `lib/i18n/uk.ts` + `en.ts` (sibling to the others, never
  reaching into `shell.*`) carrying every user-visible string: `map.regionLabel` (the map
  region's accessible name), `map.markerLabel` (the marker / popup aria label), `map.loading`
  (the skeleton / loading accessible label), **`map.fallbackName`** ("Обране місце" — the
  coordinate-fallback display label when no reverse name resolves), `map.reverseFailed` (the
  calm reverse-geocode-failed inline copy, if the component surfaces one), and
  `map.attribution` only if the attribution is templated (the literal
  `© OpenStreetMap contributors` is the required wording, FR-MAP-04). Calm tone, **no
  exclamation marks** (BC-BRAND-01, enforced across both locales by the existing
  `lib/i18n/i18n.test.ts` sweep). The `map.fallbackName` / `map.reverseFailed` copy is
  **eval-graded** (≥ 90).
- **Trade-off:** owning a fresh `map.*` namespace (vs reusing another) keeps the slice's copy
  in its own domain per the locked convention and lets the map copy read well in context
  (graded by the eval); the small cost is a few keys.

## Data model

No persistent data, no DB, no schema (ADR-0003). State is ephemeral: the active location lives
in the **URL** (`?lat=&lon=&name=`, owned by the locked LocationProvider); the map holds no
server state and persists nothing across reloads (BC-PRIVACY-03 — no map-view persistence). The
**internal data contract** (what crosses the Server↔Client boundary) and the pure surface:

- **`ReverseResult = { name: string | null }`** (`lib/geo/types.ts`) — the reverse-geocode
  handler's response; the minimal typed projection of the Nominatim reverse response, the only
  shape the client knows (`name` = a resolved display name, or `null` → the client uses the
  coordinate fallback). The verbose Nominatim fields never cross the boundary (TC-DATA-01).
- **`LatLon = { lat: number; lon: number }`** — the `normalizeLatLon` output.
- **`Location = { lat, lon, name }`** — the locked active-location shape the map reads via
  `useLocation().location` and writes via `setLocation` (imported from
  `lib/location/types.ts`; not redefined).
- The pure surface (`lib/geo`): the zod **reverse-response schema**, the **total parse**
  `parseReverseName(body): ReverseResult` (malformed/empty/`{error}` → `{ name: null }`, never
  throws), `normalizeLatLon(lat, lon): LatLon` (clamp lat / wrap lon, total), and
  `coordinateLabel(lat, lon): string` (rounded `"lat, lon"`, total).
- **In-component (`LocationMapClient`):** the read `location` (from `useLocation()`), the map
  zoom (constant), and the click handler's transient reverse-`fetch` state (an `AbortController`
  + a captured click identity for the guarded name-upgrade). All in-memory only.

## Error handling strategy

- **Two layers, both calm (NFR-OBS-01).** The **route handler** (D1) collapses every
  server-side fault to a typed `{ name: null }`: bad/missing `lat`/`lon` (no upstream call),
  non-OK Nominatim / network throw / timeout / `.json()` throw / zod-failed body. It **never**
  lets an exception escape as a raw 500 (the whole body is guarded). The **client** (D5/D6)
  maps `{ name }` to the popup label: a resolved name, else the **coordinate-label fallback** —
  and the location is **always set** from the clicked coordinates regardless.
- **Typed result shape (the precise contract):** the handler returns
  `Response.json({ name } satisfies ReverseResult)` — `{ name: "Одеса" }` on success or
  `{ name: null }` on any failure / no-usable-place path — always with a **client-readable
  status (200)** so the client `fetch` resolves and reads the typed body (never an unhandled
  rejection).
- **zod is the gate.** The Nominatim body is parsed before any name is used; a body that fails
  (malformed JSON, missing/extra-shaped fields, wrong types, an `{ error }` body) is treated as
  **no usable place** (`{ name: null }`), exactly like a failed fetch — never rendered, never
  thrown.
- **Coordinate normalization (the antimeridian scenario).** A click's raw `latlng` is
  normalized by `normalizeLatLon` (clamp lat, wrap lon) **before** the reverse request and the
  location change, so every downstream consumer (marker, popup, centre, reverse request,
  forecast) receives in-range coordinates — silently (no console).
- **Guarded latest-wins (D5).** The reverse `fetch` captures the click's coordinate identity;
  the name-upgrade is applied only if the active location is still that point (abort + identity
  guard), so a quick second click never gets the first click's late name.
- **Untrusted URL params** for the active location are already handled by the locked
  `lib/location` validation (non-numeric / out-of-range / comma-decimal / oversized `name` →
  `null`, calm empty state, no throw); this slice relies on that for the location it reads and
  adds the handler's own `lat`/`lon` normalize as defence in depth for the reverse route.

## Risks / Trade-offs

- **FR-MAP-03 not implementable as written (highest — the load-bearing risk):** "reverse-
  geocoded via Open-Meteo" cannot be built (Open-Meteo is forward-only). Mitigation — the
  **honest reconciliation in ADR-0005 / D1**: keyless **OSM Nominatim** reverse behind a route
  handler, with the location set by coordinates immediately and a coordinate-label fallback so
  the click always works. Documented in the proposal, this design, the served spec, and the
  ADR — never a fabricated Open-Meteo reverse call.
- **Leaflet crashes on the server / inflates the initial bundle (FR-MAP-05, NFR-PERF-03):**
  Leaflet touches `window`; SSR-ing it throws, and eager bundling blows the ≤ 200 KB budget.
  Mitigation — **`dynamic(() => import("./LocationMapClient"), { ssr:false })` + a same-
  footprint `MapSkeleton`** (D3); the build output is inspected to confirm Leaflet is in a lazy
  client chunk (not the initial bundle) and the SSR HTML has no Leaflet markup/runtime; the
  jsdom test asserts the wrapper renders the skeleton when the client chunk has not loaded.
- **Layout shift when the map mounts (FR-MAP-05, NFR-PERF-02):** a skeleton of a different size
  would jump the page. Mitigation — the **skeleton and the map share one fixed-footprint sizing
  wrapper** (D3) so the footprints cannot drift; the test asserts the skeleton occupies the
  map's box.
- **OSM Tile Usage Policy breach (TC-MAP-01):** missing attribution, HTTP tiles, a blank/third-
  party `Referer`, or tile scraping would violate the policy. Mitigation — **HTTPS OSM tiles,
  the always-visible `© OpenStreetMap contributors` `AttributionControl`, browser-origin
  `Referer`, viewport-only loading, no pre-fetch** (D4); asserted by the spec scenarios + the
  jsdom test (HTTPS URL + attribution string present) + review.
- **Nominatim policy breach / rate-limit / outage (ADR-0005):** missing `User-Agent`, bulk
  reverse calls, or a hard dependency on Nominatim being up. Mitigation — a **descriptive
  `User-Agent`/`Referer`, a single per-click lookup (no bulk/auto), a short timeout, no
  persistence, and the coordinate-label fallback** so a rate-limit/outage degrades calmly (D1);
  the provider is swappable behind the route handler.
- **Wrong name after a quick second click (FR-MAP-03):** overlapping reverse lookups could
  attribute the first click's late name to the second location. Mitigation — the **guarded
  name-upgrade** (abort + captured-identity, D5); the location is set by coordinates immediately
  and the name applies only if the point is still active (the jsdom test, over a mocked
  `/api/reverse-geocode`, drives the guard).
- **Out-of-range / antimeridian click (the spec scenario):** a raw `lon 190.5` or `lat 95`
  could send a nonsense reverse/forecast request or misplace the marker. Mitigation —
  `normalizeLatLon` in the **pure layer**, applied before any request/location change (D2/D5);
  unit-tested without a map.
- **Testing a client-only Leaflet map under jsdom (ADR-0004, no Playwright):** jsdom has no real
  Leaflet rendering (no canvas/DOM measurement, no real tiles). Mitigation — split so the
  **logic is testable without a real Leaflet DOM**: (1) the pure `lib/geo` (parse / normalize /
  label) is unit-tested directly; (2) the route handler is integration-tested over a mocked
  Nominatim `fetch`; (3) `react-leaflet` is **mocked** in the jsdom component test (its
  `MapContainer`/`TileLayer`/`Marker`/`Popup`/`AttributionControl`/`useMap`/`useMapEvents`
  replaced with light stand-ins that record props and expose the click handler), so the test
  asserts the click → `normalizeLatLon` → `setLocation` + reverse-name logic, the marker label /
  fallback, the HTTPS tile URL, and the attribution string — **without** a browser; (4) the
  **`dynamic(ssr:false)` wrapper** is asserted to render the `MapSkeleton` when the client chunk
  is not loaded. A real-browser render (tiles, panning) is **env-gated** per ADR-0004
  (chrome-devtools MCP), reported pending, never faked.
- **Copy quality (the delivery bar, eval ≥ 90):** the `map.fallbackName` ("Обране місце") and
  any `map.reverseFailed` copy is graded, not just asserted. Mitigation — calm, blame-free
  Ukrainian in `map.*` (D8); a browser-free eval case grades the fallback / reverse-failed copy
  against the rubric, targeting every dimension ≥ 90.
- **Scope creep:** the temptation to add satellite/vector tiles, drawing/routing, multiple
  markers/clustering, map-view persistence, or map-driven geolocation is resisted — those are
  explicit **Exclusions** / owned by other capabilities; this slice renders the bounded OSM map
  + marker + click-to-relocate and emits the location change (D1–D8).

## ADR note

The **reverse-geocoding reconciliation** (D1) is a genuinely new architectural decision — the
requirement names a provider (Open-Meteo) that cannot do the job — and is recorded as
**`docs/adr/ADR-0005-reverse-geocoding.md`** (Accepted): keyless **OSM Nominatim** reverse
behind the locked route-handler data path, with the location set by coordinates immediately and
a coordinate-label fallback, honoring Nominatim's usage policy, provider-swappable behind the
handler. The **server-side Route Handler data path** itself is a faithful **reuse** of the
pattern `add-city-search` D1 established (TC-DATA-01) — no new decision there. The **client-only
`dynamic(ssr:false)` + same-footprint-skeleton policy for a heavy browser-only library**
(Leaflet here, Recharts in `add-forecast`) is already prescribed by the AGENTS.md module
conventions and applied by `add-forecast`, so this design documents it rather than mandating a
second standalone ADR. The **client-driven** posture (the map is client-only, reading
`useLocation()`) is the **ARCHITECTURE LESSON** already recorded in `docs/current-state.md` — an
applied decision, not a new one.
