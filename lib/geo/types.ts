// The internal data contract that crosses the Server↔Client boundary — design.md
// D2, TC-DATA-01. Framework-free (TC-PURE-01): plain types only, no `next/*`, no
// `react`, no DOM. The reverse-geocode Route Handler (`app/api/reverse-geocode`)
// and the client map (`components/map/LocationMapClient`) both import these so the
// minimal reverse-geocode contract has a SINGLE source of truth and the verbose
// OSM Nominatim response shape never leaks past the server.

/**
 * The reverse-geocode handler's response contract (D1/D2). The minimal typed
 * projection of the Nominatim reverse response — the ONLY shape the client knows.
 * `name` is a resolved display name, or `null` → the client falls back to a calm
 * coordinate-derived label (`coordinateLabel` / `map.fallbackName`). The verbose
 * Nominatim fields (`address`, `display_name`, `osm_id`, …) never cross the
 * boundary (TC-DATA-01).
 */
export type ReverseResult = { name: string | null };

/**
 * The `normalizeLatLon` output — a finite, in-range coordinate pair. `lat` is
 * clamped to [-90, 90]; `lon` is wrapped into [-180, 180]. Used as the marker /
 * popup / centre position, the reverse request's params, and the downstream
 * forecast coordinates after a click (the antimeridian scenario, D2/D5).
 */
export type LatLon = { lat: number; lon: number };
