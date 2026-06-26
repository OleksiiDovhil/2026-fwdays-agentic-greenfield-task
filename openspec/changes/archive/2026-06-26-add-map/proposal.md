## Why

`add-map` is a **Wave 3** slice (capability plan §4.7, §6) on top of the archived
`add-app-shell` / `add-comfort-score` / `add-top-clock` / `add-bottom-jokes`
foundation and the validated `add-city-search`. It **branches off `city-search`**
(parallel-safe with `add-forecast`, a disjoint module) and gives the anonymous
visitor a spatial, interactive way to **see and change** the active location: an
OpenStreetMap-tiled Leaflet map centred on the current place, a labelled marker,
and **click-to-relocate**. It owns FR-MAP-01..05 and consumes one locked upstream:
the **active location** state (`useLocation()` from the LocationProvider) — it
**READS** the location to centre/mark the map and **WRITES** it on a click
(`setLocation({lat,lon,name})`), which the provider syncs to `?lat=&lon=&name=` and
which triggers the `forecast` capability's refetch. The forecast fetch itself is
**not** owned here.

The slice reuses the LOCKED conventions verbatim and writes no new cross-cutting
machinery: the active-location state (`lib/location/*` + `LocationProvider`,
`useLocation() → {location, setLocation}`), the shared calm inline error/empty
primitive `components/ui/Notice.tsx`, the centralised `lib/i18n` dictionary with
per-domain namespacing (it adds `map.*`, never reaching into `shell.*`), the
**`app/api/geocode` Route Handler data path** (TC-DATA-01) which the new
reverse-geocode handler mirrors exactly, and the **`dynamic(ssr:false)` +
same-footprint skeleton** pattern for a heavy client-only library (Leaflet here,
mirroring `add-forecast`'s Recharts).

**Reverse-geocoding reconciliation (ADR-0005, the load-bearing decision).**
FR-MAP-03 says a map click sets the location "reverse-geocoded via Open-Meteo",
but the **Open-Meteo geocoding API is FORWARD-ONLY** (name → coords) and has **no
reverse endpoint**, so that wording is not implementable as written. This slice
reconciles it honestly: on a click it sets the active location **by the clicked
coordinates immediately** (the forecast/comfort work off `lat`/`lon` and need no
name), and obtains a **display name** via **OSM Nominatim reverse geocoding** —
keyless, the same OSM ecosystem as the tiles (TC-STACK-04, TC-MAP-01) — through a
new Route Handler `app/api/reverse-geocode/route.ts` that mirrors the geocode
handler (server-side keyless fetch, zod-parse, typed result, honest degradation, a
short timeout, a descriptive `User-Agent`/`Referer` per Nominatim's usage policy).
If Nominatim fails / times out / rate-limits / returns a malformed body, the click
**still** sets the location and the popup falls back to a **calm coordinate-derived
label** (rounded `"lat, lon"`, or the i18n "Обране місце") — never a crash, never a
blank. See `docs/adr/ADR-0005-reverse-geocoding.md`.

The bar is high on the qualities the spec pins. The map is **keyless** OSM raster
tiles over **HTTPS** (TC-STACK-04, NFR-COST-01) with **mandatory attribution**
always visible bottom-right and a valid `Referer` per the OSM Tile Usage Policy
(FR-MAP-04, TC-MAP-01). Leaflet touches `window` so it is **client-only**, loaded
via `dynamic(() => import(...), { ssr:false })` with a same-footprint skeleton so
**no layout shift** occurs (FR-MAP-05). Every failure — a reverse-geocode network
error, a non-OK response, a malformed payload, a no-named-place result, or an
out-of-range/antimeridian click — degrades to a **calm inline state** with a
**silent console** (NFR-OBS-01); the popup name falls back to coordinates, never a
toast or a 500. All copy is Ukrainian-first with an English fallback, calm, with
**no exclamation marks** (NFR-I18N-01, BC-BRAND-01).

## What Changes

- **Server-side reverse-geocode Route Handler (`app/api/reverse-geocode/route.ts`,
  TC-DATA-01, ADR-0005):** a Next 16 App Router `GET(request)` (read
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  first) that reads `?lat=&lon=`, normalizes/bounds them (`lat ∈ [-90,90]`, `lon`
  wrapped into `[-180,180]`), performs the **keyless server-side fetch** to OSM
  **Nominatim** `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=&lon=&zoom=10&accept-language=uk`
  with a **descriptive `User-Agent`/`Referer`** and a **short timeout**, **zod-parses**
  the body via the pure `lib/geo` validator, and returns a **typed minimal**
  `{ name: string } | { name: null }` (a resolved display name, or `null` when there
  is no usable place). The client never sees the Nominatim URL or raw shape — only
  this stable internal contract. **Honest under failure** (NFR-OBS-01): missing /
  non-numeric / out-of-range `lat`/`lon`, a non-OK upstream, a network throw, a
  timeout, a `.json()` throw, or a zod-failed body all resolve to a typed
  `{ name: null }` with an OK status, never a raw 500 and never partial data. Not
  cached (Next 16 default; we do NOT set `dynamic = 'force-static'`).
- **Pure framework-free `lib/geo/` (TC-PURE-01):** `reverse-validation.ts` holds the
  **zod schema for the Nominatim reverse response** and a **total**
  `parseReverseName(body): { name: string | null }` that extracts a single display
  name (preferring a city/town/village locality, else the `display_name`, trimmed
  and length-bounded) — malformed / empty / non-object / missing-name bodies map to
  `{ name: null }`, **never throws** (mirrors the locked `lib/search`/`lib/location`
  `.safeParse` discipline). `coordinate-label.ts` holds a pure
  `coordinateLabel(lat, lon): string` producing a stable, rounded `"lat, lon"`
  fallback label, and a `normalizeLatLon(lat, lon)` that clamps latitude to
  `[-90,90]` and wraps longitude into `[-180,180]` (so an antimeridian/past-the-pole
  click is normalized before any request or location change). No `next/*`, no
  `react`, no DOM — colocated `*.test.ts`.
- **Client-only map filling the ShellContent map slot:** `components/map/LocationMap.tsx`
  is a thin wrapper that loads the real map via
  **`dynamic(() => import("./LocationMapClient"), { ssr:false, loading: () => <MapSkeleton/> })`**
  so Leaflet/react-leaflet (which touch `window`) **never run on the server**
  (FR-MAP-05); the `MapSkeleton` has the **same footprint** (width/height/aspect) so
  there is **no layout shift**. `components/map/LocationMapClient.tsx` (`"use client"`)
  renders the react-leaflet `MapContainer` centred/bounded to the active
  `useLocation()` location at a **city-level zoom**, an OSM **`TileLayer`** (standard
  HTTPS raster tiles), a single **`Marker`** at the location with a **`Popup`** naming
  the city, an **`AttributionControl`** showing `© OpenStreetMap contributors`
  bottom-right (always visible, TC-MAP-01), a `useMap`-based recenter (on a location
  change the view re-centres **without a full remount**), and a `useMapEvents` **click
  handler**. When there is no active location, a calm placeholder/skeleton is shown
  (no crash).
- **Click-to-set (FR-MAP-03, ADR-0005):** the click handler reads the click `latlng`,
  `normalizeLatLon`s it, and **immediately** `setLocation({lat, lon, name})` where
  `name` comes from `/api/reverse-geocode?lat=&lon=` (the internal route, NEVER
  Nominatim directly), falling back to `coordinateLabel(lat, lon)` / the i18n
  "Обране місце" when the reverse handler returns `{ name: null }` or the request
  fails. The location change drives the marker/popup/centre and triggers the
  forecast refetch (owned by `forecast`). The location is set from the coordinates
  even if the name resolves late or not at all.
- **i18n — a `map.*` namespace:** add `map.*` to `lib/i18n/uk.ts` + `en.ts` (sibling
  to the others, never reaching into `shell.*`): the map region's accessible label,
  the marker/popup aria label, the loading/skeleton label, the
  `map.fallbackName` ("Обране місце") coordinate-fallback display label, the
  reverse-geocode-failed inline copy, and the attribution text if templated. Calm
  tone, **no exclamation marks** (BC-BRAND-01, enforced across both locales by the
  existing i18n test).
- **Leaflet CSS:** Leaflet ships a stylesheet (`leaflet/dist/leaflet.css`) required
  for correct tile/marker/control/popup layout; the change documents and applies the
  CSS-load strategy (imported in the client map component / its module so it ships
  only with the client map chunk, never the server).

## Capabilities

### New Capabilities

- `map`: a keyless, client-only OpenStreetMap Leaflet map for the active location —
  the server-side **reverse-geocode Route Handler** (`app/api/reverse-geocode/route.ts`)
  keeping the Nominatim URL/shape off the client and degrading honestly (ADR-0005),
  the pure framework-free `lib/geo` (`parseReverseName` total zod parse →
  `{ name|null }`; `coordinateLabel` + `normalizeLatLon`, total), and the client map
  (`LocationMap` dynamic `ssr:false` wrapper + `MapSkeleton`; `LocationMapClient` with
  the OSM `TileLayer`, a `Marker` + city `Popup`, the always-visible
  `© OpenStreetMap contributors` `AttributionControl`, a non-remounting recenter on
  location change, and a click handler that normalizes the coordinates, sets the
  active location immediately, resolves a display name via the reverse handler, and
  falls back to a calm coordinate label).

### Modified Capabilities

<!-- None. This change introduces the map capability; no existing spec changes. It
CONSUMES the locked active-location state (useLocation — reads to centre/mark, writes
on click) and fills the ShellContent map slot (a slot the shell shipped for exactly
this purpose) — it does not edit any other capability's spec or app/page.tsx (§3a).
The forecast refetch is owned by the forecast capability; the map only emits the
location change. It adds a sibling map.* i18n namespace. ADR-0005 reconciles
FR-MAP-03's "reverse-geocoded via Open-Meteo" (Open-Meteo is forward-only) to OSM
Nominatim reverse geocoding, keyless, with a coordinate fallback. -->

## Impact

- **Specs:** the baseline `openspec/specs/map/spec.md` already exists (adopted at G2,
  6 requirements). The delta under `specs/map/spec.md` restates that contract as
  `## ADDED Requirements` for the record and for `openspec validate add-map --strict`;
  archive runs with **`--skip-specs`** because the baseline already holds it (OpenSpec
  Option B is not re-applied). ADR-0005 reconciles the reverse-geocoding provider
  honestly (Open-Meteo cannot reverse; OSM/Nominatim can) — the spec phrases the
  reverse step as keyless reverse-geocoding with a coordinate fallback, provider-tunable
  behind the route handler.
- **Code (new):** `app/api/reverse-geocode/route.ts` (the server-side reverse-geocode
  handler); `lib/geo/{reverse-validation,coordinate-label}.ts`, framework-free, with
  colocated `lib/geo/*.test.ts`; `lib/geo/types.ts` for the reverse result contract;
  `components/map/LocationMap.tsx` (the dynamic `ssr:false` wrapper),
  `components/map/LocationMapClient.tsx` (the react-leaflet map), and
  `components/map/MapSkeleton.tsx` (the same-footprint skeleton), with colocated jsdom
  tests; an integration test for the reverse-geocode handler over a **mocked**
  Nominatim response; and a browser-free eval case `evals/cases/map-copy.eval.ts`
  grading the reverse-geocode-fallback / map copy.
- **Code (extended):** `components/shell/ShellContent.tsx` — the inert
  `<div data-slot="map" aria-hidden="true" />` placeholder (inside the located-state
  branch) is replaced with the real `<LocationMap/>` (filling the slot the shell
  reserved; the shell's own located-state region, **not** an `app/page.tsx` edit,
  §3a). `lib/i18n/uk.ts` + `lib/i18n/en.ts` gain a `map.*` namespace (sibling to the
  others). The Leaflet stylesheet is loaded with the client map chunk.
- **Dependencies:** none added — `leaflet`, `react-leaflet`, and `@types/leaflet` are
  already installed (`package.json`) and `next`/`react` ship the Route Handler +
  `next/dynamic`. **No database, no auth, no email** (ADR-0003); the only external
  calls are the **keyless** OSM tile requests (from the browser, HTTPS, attributed —
  TC-MAP-01) and the **keyless** Nominatim reverse GET from the server, **zero paid
  keys** (NFR-COST-01, TC-STACK-04). **No Playwright** (TC-STACK-05); verification is
  **Vitest** only — pure unit tests for the zod parse / coordinate label / normalize,
  jsdom component tests for the map wrapper/skeleton (the client map is exercised with
  a **mocked react-leaflet** — a real Leaflet DOM needs a browser, env-gated per
  ADR-0004), and an integration test for the reverse-geocode handler over a mocked
  `fetch`. The per-slice "smoke" is a **service/render smoke over a MOCKED Nominatim
  payload** (handler → name; malformed → fallback; map skeleton renders), **not** a DB
  smoke.
- **Out of scope (see the spec's Exclusions):** non-OSM tile providers, vector tiles,
  satellite imagery, custom styles (OSM raster only, TC-STACK-04); drawing / routing /
  distance / geofencing / map-editing tools; marine / aviation / agriculture overlays
  and weather layers on the map; multiple simultaneous markers, clustering, or pinning
  cities (multi-city compare is owned by `weekend-compare`); persisting the last map
  view/zoom/location across reloads (no DB, no cookies, BC-PRIVACY-03); triggering
  **geolocation** from the map (opt-in, owned by `city-search`, BC-PRIVACY-02); offline
  tile caching or bulk pre-fetching (prohibited by the OSM Tile Usage Policy,
  TC-MAP-01); and the **forecast fetch itself** and its rendering/caching (owned by
  `forecast`; the map only emits the location change) — all intentionally excluded so
  testers do not report them as defects.
