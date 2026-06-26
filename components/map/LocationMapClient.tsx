"use client";

// The client-only react-leaflet map — design.md D3/D4/D5/D6, FR-MAP-01/02/03/04,
// TC-MAP-01, NFR-OBS-01. The ONLY place React / Leaflet / `fetch` / the click
// handler live for the map. Loaded EXCLUSIVELY via `LocationMap`'s
// `dynamic(ssr:false)` so Leaflet never runs on the server and ships in a LAZY
// chunk (FR-MAP-05). It READS `useLocation()` for the centre/marker AND WRITES it
// on a click — the only slice that does both.
//
// LEAFLET CSS STRATEGY (D7, tasks 1.4): `leaflet/dist/leaflet.css` is REQUIRED for
// correct tile positioning + the zoom/attribution controls + the popup chrome. It
// is imported HERE (inside the client module) so it ships ONLY with this lazy chunk
// when the map mounts — NEVER in the server/initial payload (consistent with the
// `ssr:false` client-only boundary). Vite leaves it inert under Vitest (CSS not
// processed); Next 16 + Tailwind 4 (PostCSS) bundle it with the chunk in the build.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  AttributionControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
// The Leaflet marker icon PNGs are imported so the BUNDLER emits them as
// SAME-ORIGIN assets — NO third-party CDN egress (BC-PRIVACY-01/03, NFR-COST-01,
// TC-STACK-04 keyless). A previous version pointed these at unpkg.com (a tracker /
// off-origin request); serving them from our own build keeps the map fully
// keyless and free of third-party network calls.
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useLocation } from "@/components/providers/LocationProvider";
import { coordinateLabel, normalizeLatLon } from "@/lib/geo/coordinate-label";
import type { ReverseResult } from "@/lib/geo/types";
import { MAP_FOOTPRINT } from "@/components/map/MapSkeleton";
import { t } from "@/lib/i18n";

// A `.png` import is a `StaticImageData` ({ src }) under the Next build and a bare
// URL string under Vite/Vitest — accept both. Either way the URL is SAME-ORIGIN
// (the bundler rehosts the asset), so no unpkg / cross-origin fetch.
function assetUrl(asset: string | { src: string }): string {
  return typeof asset === "string" ? asset : asset.src;
}

// LEAFLET DEFAULT-MARKER-ICON FIX (D3, client-only): Leaflet resolves its marker
// icon images from a CSS-relative path that bundlers (webpack/turbopack) break, so
// the marker would render invisible. Point the default icon at the SAME-ORIGIN,
// bundler-emitted assets imported above. This touches Leaflet internals (jsdom-
// free); it runs at module import, which only happens client-side (this module is
// loaded via ssr:false). `delete _getIconUrl` forces Leaflet to use the URLs below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: assetUrl(markerIcon2x),
  iconUrl: assetUrl(markerIcon),
  shadowUrl: assetUrl(markerShadow),
});

// City-level zoom (FR-MAP-01): close enough to read a city, not the whole world.
const CITY_ZOOM = 11;
// The standard OSM raster tile template over HTTPS — the ONLY tile source
// (TC-STACK-04). Browser-fetched from the app origin, so each tile carries a valid
// Referer (TC-MAP-01); Leaflet loads only the visible viewport (no scraping/pre-fetch).
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
// The required OSM attribution wording (FR-MAP-04). The literal is centralised in
// `map.attribution`; the AttributionControl reads it off the TileLayer.
const OSM_ATTRIBUTION = t("map.attribution");

/**
 * Recenter WITHOUT remount (D3, FR-MAP-01): a `useMap()` child that, on a location
 * change, calls `map.setView([lat, lon], zoom)` in an effect keyed on the
 * coordinates — so the view re-centres without re-keying / remounting the
 * MapContainer (no tile flash). The marker follows because it is rendered at the
 * active location's coords.
 */
function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], CITY_ZOOM);
  }, [map, lat, lon]);
  return null;
}

/**
 * Click-to-relocate (D5, FR-MAP-03, ADR-0005): a `useMapEvents({ click })` child.
 * On a click it NORMALIZES the raw latlng (clamp lat / wrap lon — the antimeridian
 * scenario, silently), then drives the relocate COORDINATE-FIRST:
 *   1. `setLocation({ lat, lon, name: coordinateLabel })` IMMEDIATELY — so the
 *      location/marker/centre update and the LocationProvider's URL sync triggers
 *      the forecast refetch (owned by `forecast`) at once, even while the name is
 *      pending or never resolves.
 *   2. Resolve the display name via the INTERNAL `/api/reverse-geocode` route
 *      (NEVER Nominatim directly). On a typed `{ name: string }` it UPGRADES the
 *      name (a second `setLocation`, same coords) — GUARDED so it applies only if
 *      this click is still the latest (a monotonic id + AbortController, the
 *      latest-wins discipline `SearchBox` uses), at most once per click. On
 *      `{ name: null }` / network error / timeout it keeps the coordinate label
 *      and reports the failure via `onReverseFailed(true)` so the parent surfaces
 *      a quiet `map.reverseFailed` hint.
 * The location is ALWAYS set from the clicked coordinates regardless of the name
 * path. Caught errors are handled into the fallback — NEVER logged (console stays
 * silent on a healthy session, NFR-OBS-01).
 */
function ClickToRelocate({
  setLocation,
  onReverseFailed,
}: {
  setLocation: ReturnType<typeof useLocation>["setLocation"];
  /** Report whether the latest click's reverse lookup produced a usable name. */
  onReverseFailed: (failed: boolean) => void;
}) {
  // A monotonic click id: the reverse upgrade applies only if its click is still
  // the latest (so a quick second click never gets the first click's late name).
  const latestClickRef = useRef(0);
  // The in-flight reverse request, aborted when a newer click supersedes it.
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight reverse request on unmount (no stale resolution / no
  // "update on unmounted component"; the latest-id guard already drops the result).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useMapEvents({
    click: (e) => {
      // Normalize the raw click (Leaflet can yield out-of-range / antimeridian
      // values) BEFORE the location change + the reverse request — silently.
      const { lat, lon } = normalizeLatLon(e.latlng.lat, e.latlng.lng);
      const fallback = coordinateLabel(lat, lon);

      const clickId = latestClickRef.current + 1;
      latestClickRef.current = clickId;

      // 1. Set the clicked coordinates IMMEDIATELY with the calm coordinate label.
      setLocation({ lat, lon, name: fallback });
      // Clear any prior reverse-failed hint while THIS click's lookup is pending.
      onReverseFailed(false);

      // Supersede any prior in-flight reverse request.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 2. Resolve the display name via the INTERNAL route (never Nominatim).
      const url = `/api/reverse-geocode?lat=${encodeURIComponent(
        String(lat),
      )}&lon=${encodeURIComponent(String(lon))}`;

      fetch(url, { signal: controller.signal })
        .then((res) => res.json())
        .then((body: ReverseResult) => {
          // Discard a stale resolution (a newer click has happened) — the first
          // click's late name must never land on the second location.
          if (latestClickRef.current !== clickId) return;
          const name = body?.name;
          if (typeof name === "string" && name.trim().length > 0) {
            // UPGRADE the name (same coords) — applied at most once per click.
            setLocation({ lat, lon, name: name.trim() });
            onReverseFailed(false);
          } else {
            // { name: null } → no usable place name. Keep the coordinate-label
            // fallback and surface the calm hint (the click itself succeeded).
            onReverseFailed(true);
          }
        })
        .catch(() => {
          // A superseded/aborted request OR a network/timeout error → keep the
          // coordinate-label fallback already set. Handled silently (no console).
          // Only the LATEST click's failure surfaces the hint (a superseded click
          // must not flip it back on after a newer click cleared it).
          if (latestClickRef.current === clickId) onReverseFailed(true);
        });
    },
  });

  return null;
}

export function LocationMapClient() {
  const { location, setLocation } = useLocation();
  // Whether the LATEST click's reverse lookup yielded no usable place name — drives
  // the calm `map.reverseFailed` hint (the click still set a usable location, so
  // this is a quiet note, never a loud error, NFR-OBS-01). False on first render and
  // on every success.
  const [reverseFailed, setReverseFailed] = useState(false);

  // No active location → a calm, same-footprint placeholder with visible copy (the
  // region is never silently blank, no crash, no MapContainer). In practice the
  // slot lives in the shell's LOCATED branch, so the map normally mounts only with
  // a location; this guards the safe `useLocation()` null default.
  if (location === null) {
    return (
      <div
        aria-label={t("map.regionLabel")}
        className={`${MAP_FOOTPRINT} flex items-center justify-center rounded-lg border border-border bg-surface p-4 text-center text-sm text-muted-foreground`}
      >
        {t("map.loading")}
      </div>
    );
  }

  const center: [number, number] = [location.lat, location.lon];
  // The popup name: the resolved place name, or the calm coordinate fallback when
  // empty/unknown (never a blank popup). An empty-after-trim name → the fallback.
  const popupName =
    location.name.trim().length > 0 ? location.name : t("map.fallbackName");

  return (
    <MapContainer
      // A STABLE configuration (NOT keyed on the location) so a location change
      // re-centres via `Recenter` without remounting the map (no tile flash).
      center={center}
      zoom={CITY_ZOOM}
      scrollWheelZoom
      // The default attribution control is replaced by an explicit bottom-right one
      // (D4) so the OSM credit is always visible and survives pan/zoom/click.
      attributionControl={false}
      className={`${MAP_FOOTPRINT} rounded-lg border border-border`}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <AttributionControl position="bottomright" prefix={false} />

      <Marker position={center}>
        {/* The popup bounds a long name within a fixed max width so it wraps and
            cannot overflow the popup, controls, or attribution (the long-name
            scenario). `break-words` keeps an unbroken 120-char string contained. */}
        <Popup>
          <span
            aria-label={t("map.markerLabel")}
            className="block max-w-[16rem] break-words text-sm font-medium"
          >
            {popupName}
          </span>
          {/* When the reverse lookup found no usable place name, surface a QUIET
              muted note (FR-MAP-03 "request fails → a calm inline message") — the
              location IS set and the map works, so this is a small hint, NOT a
              live-region error (no role/alert, no exclamation marks, BC-BRAND-01). */}
          {reverseFailed ? (
            <span
              data-slot="reverse-failed"
              className="mt-1 block max-w-[16rem] text-pretty text-xs text-muted-foreground"
            >
              {t("map.reverseFailed")}
            </span>
          ) : null}
        </Popup>
      </Marker>

      <Recenter lat={location.lat} lon={location.lon} />
      <ClickToRelocate setLocation={setLocation} onReverseFailed={setReverseFailed} />
    </MapContainer>
  );
}

export default LocationMapClient;
