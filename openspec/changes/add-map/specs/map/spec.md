## ADDED Requirements

<!--
This delta restates the baseline `openspec/specs/map/spec.md` contract (adopted at
G2, 6 requirements) verbatim as ADDED requirements, for the record and so
`openspec validate add-map --strict` can validate the change against a delta.
Archive runs with `--skip-specs` because the baseline spec already holds this
content (the requirements are NOT re-applied via OpenSpec Option B). Keep this file
in sync with the baseline if the baseline changes.

RECONCILIATION (ADR-0005): FR-MAP-03's "reverse-geocoded via Open-Meteo" is not
implementable — the Open-Meteo geocoding API is FORWARD-ONLY (name → coords) with no
reverse endpoint. Per ADR-0005 the click sets the active location by the clicked
coordinates immediately (forecast/comfort need only lat/lon) and obtains a display
NAME via keyless OSM Nominatim reverse geocoding behind a Route Handler, falling back
to a calm coordinate-derived label when the name cannot be resolved. The scenarios
below are phrased around "reverse-geocode the clicked point to a display name,
keyless, zod-parsed, with a coordinate fallback" so the contract is honest and the
provider stays an implementation detail behind the route handler.
-->

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
active location: it reverse-geocodes the clicked coordinates to a display name,
sets the active location to the clicked point with that name, and triggers a
fresh forecast fetch for that location (FR-MAP-03). Reverse geocoding SHALL be
keyless and performed via a server-side Route Handler that keeps the upstream
URL and response shape off the client (TC-DATA-01); per ADR-0005 it uses OSM
Nominatim (the keyless reverse counterpart Open-Meteo lacks), in the same OSM
ecosystem as the map tiles. The reverse-geocode response SHALL be parsed and
validated against the expected shape (zod schema) before any resolved name is
used; a response that fails schema validation SHALL be treated as "no usable
place" rather than rendered or allowed to throw, and the active location SHALL
still be set to the clicked coordinates with a calm coordinate-derived fallback
label. The forecast re-fetch is owned by the `forecast` capability; this
capability is responsible only for emitting the location change with the
resolved (or fallback) name and coordinates.

#### Scenario: Clicking the map relocates and refetches

- **GIVEN** the active location is `Київ`
- **WHEN** the visitor clicks the map at coordinates near Odesa
  (`46.4825, 30.7233`)
- **THEN** the clicked coordinates are reverse-geocoded (keyless, via the
  server-side Route Handler)
- **AND** the active location is updated to the resolved place (name `Одеса`,
  lat/lon at or near the clicked point)
- **AND** the marker, popup, and map centre update to the new location
- **AND** a forecast re-fetch is triggered for the new active location

#### Scenario: Reverse geocoding returns no named place

- **GIVEN** the visitor clicks the map at a point with no named place nearby
  (for example, open sea)
- **WHEN** reverse geocoding returns no usable place
- **THEN** the active location is still set to the clicked coordinates
- **AND** the marker popup uses the coordinate fallback label (no exclamation
  marks)
- **AND** the forecast is still re-fetched for those coordinates
- **AND** no error toast is shown and the console stays silent (NFR-OBS-01)

#### Scenario: Malformed reverse-geocode payload is treated as no usable place

- **GIVEN** the visitor clicks the map at coordinates `46.4825, 30.7233`
- **WHEN** reverse geocoding returns a 200 response whose body fails the
  expected shape (malformed JSON, missing required fields, or values of the
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
- **WHEN** the reverse-geocoding request fails (network error, timeout, or
  non-2xx response)
- **THEN** the active location is still set to the clicked coordinates with the
  calm coordinate fallback label (no raw error, no 500, no exclamation marks)
- **AND** the previous active location remains usable until the click completes
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
