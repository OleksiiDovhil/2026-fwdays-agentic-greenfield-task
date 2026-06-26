"use client";

// The map wrapper the ShellContent slot mounts — design.md D3, FR-MAP-05,
// NFR-PERF-03, the ARCHITECTURE LESSON (the map is CLIENT-only; it reads + writes
// `useLocation()`).
//
// It loads the real react-leaflet map via `dynamic(() => import("./LocationMapClient"),
// { ssr: false, loading: () => <MapSkeleton/> })` so Leaflet/react-leaflet NEVER
// execute on the server (they touch `window`/`document`) and are NOT in the initial
// bundle — they ship in a LAZY client chunk that loads only when this wrapper mounts.
//
// WHY `ssr: false` (not `React.lazy`/Suspense): per the Next 16 lazy-loading doc, a
// `React.lazy` Client Component is still SSR-PRERENDERED by default — Leaflet would
// then run on the server and throw on `window`. `ssr: false` is the mechanism that
// disables that prerender (FR-MAP-05's "no Leaflet markup/runtime in SSR output").
// `dynamic(ssr:false)` must be called in a Client Component (the doc is explicit),
// hence `"use client"` here.
//
// The wrapper renders the lazy map (or the same-footprint `MapSkeleton` while the
// chunk loads) inside a region labelled for assistive tech (NFR-A11Y-01).
import dynamic from "next/dynamic";
import { MapSkeleton } from "@/components/map/MapSkeleton";
import { t } from "@/lib/i18n";

// Leaflet ships ONLY in this lazy chunk (FR-MAP-05, NFR-PERF-03): the skeleton holds
// the layout until it resolves, so there is no layout shift (CLS).
const LocationMapClient = dynamic(() => import("@/components/map/LocationMapClient"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export function LocationMap() {
  return (
    <section
      data-slot="map"
      aria-label={t("map.regionLabel")}
      className="md:col-span-2 xl:col-span-3"
    >
      <LocationMapClient />
    </section>
  );
}

export default LocationMap;
