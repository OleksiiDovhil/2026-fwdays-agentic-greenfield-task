# Map Specification

## Purpose

Give the anonymous visitor a spatial, interactive way to see and change the
active location: an OpenStreetMap-tiled Leaflet map centred on the current
place, a labelled marker for it, and click-to-relocate that reverse-geocodes
the chosen point and drives a fresh forecast. The map is keyless and renders
only on the client, with a same-footprint SSR skeleton so layout never shifts.
It honours the OSM Tile Usage Policy at all times (HTTPS tiles, mandatory
attribution, valid Referer, no scraping).

## Requirements

### Requirement: Render OSM-tiled map bounded to the active location

The system SHALL render an interactive Leaflet map (via react-leaflet) using
OpenStreetMap raster tiles, with its view centred on the active location's
coordinates at a city-appropriate zoom (FR-MAP-01). Tiles SHALL be requested
over HTTPS from a standard OSM tile endpoint, with no tile scraping or bulk
pre-fetching, and SHALL be sent from the application's own origin so each tile
request carries a valid `Referer` identifying the app, satisfying the OSM Tile
Usage Policy (TC-MAP-01). When the active location changes, the map view SHALL
re-centre on the new coordinates without a full remount.

#### Scenario: Map centres on the active location

- **GIVEN** an active location with lat `50.4501` and lon `30.5234` (Kyiv)
- **WHEN** the map renders
- **THEN** an interactive Leaflet map is shown using OSM raster tiles
- **AND** the map view is centred on `50.4501, 30.5234` at a city-level zoom
- **AND** all tile requests use `https://` URLs

#### Scenario: Tile requests carry a valid Referer from the app origin

- **GIVEN** the map is rendered and loading OSM tiles in the browser
- **WHEN** tile requests are inspected (for example via the network panel)
- **THEN** each tile request is sent from the application's own origin and
  carries a non-empty `Referer` header identifying that origin (not blank and
  not a third-party origin), per the OSM Tile Usage Policy (TC-MAP-01)
- **AND** no tiles are fetched by scraping or bulk pre-fetching outside the
  visible viewport

#### Scenario: Map re-centres when the active location changes

- **GIVEN** the map is centred on Kyiv (`50.4501, 30.5234`)
- **WHEN** the active location changes to Lviv (`49.8397, 24.0297`)
- **THEN** the map view re-centres on `49.8397, 24.0297`
- **AND** the map is not fully remounted (no tile flash from a fresh container)

#### Scenario: Pan and zoom controls are interactive

- **GIVEN** the rendered map
- **WHEN** the visitor drags the map or uses the zoom controls
- **THEN** the map pans and zooms smoothly and loads tiles for the new viewport
- **AND** no warnings or errors are emitted to the console (NFR-OBS-01)

### Requirement: Show a marker with a city-naming popup

The system SHALL place a single marker at the active location's coordinates,
and the marker's popup SHALL name the active location's city (FR-MAP-02). When
the active location changes, the marker SHALL move to the new coordinates and
its popup label SHALL update accordingly.

#### Scenario: Marker labels the current city

- **GIVEN** an active location named `Київ` at `50.4501, 30.5234`
- **WHEN** the map renders
- **THEN** exactly one marker is shown at `50.4501, 30.5234`
- **AND** opening (or clicking) the marker shows a popup containing `Київ`

#### Scenario: Marker and popup follow the active location

- **GIVEN** a marker labelled `Київ`
- **WHEN** the active location changes to `Львів` at `49.8397, 24.0297`
- **THEN** the marker moves to `49.8397, 24.0297`
- **AND** the popup label now reads `Львів`

#### Scenario: Marker label falls back when the city name is unknown

- **GIVEN** an active location whose name is empty or unknown (for example, a
  point picked over water or an unnamed region)
- **WHEN** the marker popup is shown
- **THEN** the popup displays a calm Ukrainian fallback label (for example, the
  formatted coordinates) instead of an empty popup, no exclamation marks
- **AND** no error is thrown and the console stays silent (NFR-OBS-01)

#### Scenario: An unusually long place name does not break the popup layout

- **GIVEN** an active location whose resolved name is unusually long (for
  example a 120-character compound place-and-region string)
- **WHEN** the marker popup is shown
- **THEN** the long name is contained within the popup (wrapped or truncated)
  and does not overflow the popup, the map controls, or the attribution
- **AND** the popup, marker, map centre, and surrounding layout do not break or
  shift, and the console stays silent (NFR-OBS-01)

### Requirement: Click-to-relocate via reverse geocoding updates the location and refetches the forecast

The system SHALL treat a click (tap) on the map as a request to change the
active location: it reverse-geocodes the clicked coordinates via Open-Meteo,
sets the active location to the resolved place, and triggers a fresh forecast
fetch for that location (FR-MAP-03). Reverse geocoding SHALL be keyless. The
reverse-geocode response SHALL be parsed and validated against the expected
shape (zod schema) before any resolved name is used; a response that fails
schema validation SHALL be treated as "no usable place" rather than rendered or
allowed to throw. The forecast re-fetch is owned by the `forecast` capability;
this capability is responsible only for emitting the location change with the
resolved name and coordinates.

#### Scenario: Clicking the map relocates and refetches

- **GIVEN** the active location is `Київ`
- **WHEN** the visitor clicks the map at coordinates near Odesa
  (`46.4825, 30.7233`)
- **THEN** the clicked coordinates are reverse-geocoded via Open-Meteo
- **AND** the active location is updated to the resolved place (name `Одеса`,
  lat/lon at or near the clicked point)
- **AND** the marker, popup, and map centre update to the new location
- **AND** a forecast re-fetch is triggered for the new active location

#### Scenario: Reverse geocoding returns no named place

- **GIVEN** the visitor clicks the map at a point with no named place nearby
  (for example, open sea)
- **WHEN** Open-Meteo reverse geocoding returns zero results
- **THEN** the active location is still set to the clicked coordinates
- **AND** the marker popup uses the coordinate fallback label (no exclamation
  marks)
- **AND** the forecast is still re-fetched for those coordinates
- **AND** no error toast is shown and the console stays silent (NFR-OBS-01)

#### Scenario: Malformed reverse-geocode payload is treated as no usable place

- **GIVEN** the visitor clicks the map at coordinates `46.4825, 30.7233`
- **WHEN** Open-Meteo reverse geocoding returns a 200 response whose body fails
  the expected shape (malformed JSON, missing required fields, or values of the
  wrong type — schema/zod validation fails)
- **THEN** the response is discarded and treated as "no usable place" rather
  than parsed into a name
- **AND** the active location is still set to the clicked coordinates
  (`46.4825, 30.7233`)
- **AND** the marker popup uses the coordinate fallback label (no exclamation
  marks)
- **AND** the forecast is still re-fetched for those coordinates
- **AND** no uncaught exception is thrown and the console stays silent
  (no `console.error` or `console.warn`) (NFR-OBS-01)

#### Scenario: Out-of-range or antimeridian click coordinates are normalized before the location change

- **GIVEN** a click resolves to raw coordinates outside the valid range — for
  example a longitude past the antimeridian (`lon` `190.5`, equivalent to
  `-169.5`) or a latitude beyond the pole (`lat` `95.0`)
- **WHEN** the map turns that click into an active-location change
- **THEN** the coordinates are normalized or clamped to a valid range
  (`lat` within `[-90, 90]`, `lon` wrapped into `[-180, 180]`) before the
  location change is emitted
- **AND** the marker, popup, and map centre all receive the normalized
  coordinates (e.g. `lon -169.5`), not the raw out-of-range values
- **AND** the reverse-geocode request and the downstream forecast fetch are
  issued with the normalized, in-range `lat`/`lon`
- **AND** no error is thrown and the console stays silent (NFR-OBS-01)

#### Scenario: Reverse geocoding request fails

- **GIVEN** the visitor clicks the map
- **WHEN** the Open-Meteo reverse-geocoding request fails (network error,
  timeout, or non-2xx response)
- **THEN** a calm inline Ukrainian message is surfaced (no raw error, no 500,
  no exclamation marks)
- **AND** the previous active location remains selected and usable
- **AND** the failure is handled without uncaught exceptions; the console emits
  no unhandled error or warning (NFR-OBS-01)

### Requirement: Display OpenStreetMap attribution at bottom-right

The system SHALL always display the attribution text `© OpenStreetMap
contributors` in the bottom-right corner of the map (FR-MAP-04). The
attribution SHALL remain visible at every zoom level and viewport size and is
required by the OSM Tile Usage Policy (TC-MAP-01). The attribution SHALL be
present whenever OSM tiles are shown.

#### Scenario: Attribution is visible on the rendered map

- **GIVEN** the rendered map showing OSM tiles
- **WHEN** the visitor views the map at any zoom level
- **THEN** the text `© OpenStreetMap contributors` is visible in the
  bottom-right corner of the map

#### Scenario: Attribution survives interaction

- **GIVEN** the visible attribution control
- **WHEN** the visitor pans, zooms, or relocates by clicking the map
- **THEN** the `© OpenStreetMap contributors` attribution remains visible in
  the bottom-right corner

### Requirement: Client-only map with a same-footprint SSR skeleton

The system SHALL load the map as a client-only component via
`dynamic(() => import(...), { ssr: false })`, so Leaflet never executes during
server-side rendering (FR-MAP-05). Before the client bundle mounts (and during
SSR), the system SHALL render a skeleton placeholder that occupies exactly the
same footprint (width and height / aspect ratio) as the mounted map, so no
layout shift occurs when the map appears.

#### Scenario: Map is not server-rendered

- **GIVEN** the homepage is rendered on the server
- **WHEN** the initial HTML is produced
- **THEN** no Leaflet map markup or Leaflet runtime is present in the SSR output
- **AND** no reference to `window`, `document`, or other DOM globals is
  evaluated during SSR for the map (no SSR error or warning) (NFR-OBS-01)

#### Scenario: Skeleton holds the layout until the map mounts

- **GIVEN** the SSR output and the moment before the client map mounts
- **WHEN** the page is displayed and then the client map hydrates
- **THEN** a skeleton placeholder of the same footprint is shown in place of
  the map
- **AND** when the map mounts, it replaces the skeleton in the same box with no
  layout shift (the surrounding content does not jump)

### Requirement: Console is silent during map usage (NFR-OBS-01)

The system SHALL keep the browser console free of warnings and errors during a
healthy map session: initial render, panning, zooming, clicking to relocate,
and reverse-geocoding success and handled-failure paths (NFR-OBS-01). Expected,
handled conditions (no reverse-geocoding result, a malformed reverse-geocode
payload, out-of-range click coordinates, and request failure) SHALL be surfaced
in the UI or silently normalized, never via `console.error` or `console.warn`.

#### Scenario: Healthy session produces no console noise

- **GIVEN** a healthy map session
- **WHEN** the visitor loads the map, pans, zooms, and clicks to relocate
  (including a click that yields no named place)
- **THEN** no `console.error` or `console.warn` output is produced
- **AND** all expected conditions are communicated through the UI, not the
  console

## Out of scope (exclusions)

These are intentionally unsupported in the MVP and SHALL NOT be reported as
defects:

- Non-OSM tile providers, vector tiles, satellite imagery, or custom map styles
  — OSM raster tiles only (TC-STACK-04).
- Drawing, routing, distance measurement, geofencing, or any map editing tools.
- Marine, aviation, or agriculture overlays and weather layers on the map
  (out of scope per `docs/requirements.md` "Out of scope (MVP)").
- Multiple simultaneous markers, clustering, or pinning cities on the map; the
  optional multi-city comparison is owned by `weekend-compare`, not the map.
- Persisting the last map view, zoom, or location across reloads (no database,
  no cookies, no server-side persistence).
- Triggering geolocation from the map; geolocation is opt-in and owned by
  `city-search` (BC-PRIVACY-02).
- Offline tile caching or bulk tile pre-fetching of any kind (prohibited by the
  OSM Tile Usage Policy, TC-MAP-01).
- The forecast fetch itself and its rendering/caching are owned by the
  `forecast` capability; the map only emits the location change.
