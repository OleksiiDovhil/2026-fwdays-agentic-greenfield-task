// The map's same-footprint placeholder — design.md D3, FR-MAP-05, NFR-PERF-02. A
// calm box occupying EXACTLY the same footprint as the mounted map so swapping the
// real map in causes NO layout shift (CLS). It carries the i18n `map.loading`
// accessible label and is the `dynamic(ssr:false)` loading fallback (and the
// no-location placeholder) so the map region is never silently blank.
//
// The single sizing source of truth (`MAP_FOOTPRINT`) is SHARED with
// `LocationMapClient` — both the skeleton and the live map box use it, so the two
// footprints cannot drift. Uses the locked `surface`/`border` tokens only — no new
// color (nothing new for NFR-A11Y-02).
import { t } from "@/lib/i18n";

/**
 * The shared map box sizing (one source of truth for the footprint). A fixed
 * height + full width so the skeleton cannot collapse to zero and shift the layout
 * when the real map swaps in. Imported by `LocationMapClient` so the live map fills
 * the identical box.
 */
export const MAP_FOOTPRINT = "h-[320px] w-full";

export function MapSkeleton() {
  return (
    <div
      // The loading copy labels the box for assistive tech (NFR-A11Y-01) without a
      // live-region role (it is a momentary, expected busy state, not a status).
      aria-label={t("map.loading")}
      className={`${MAP_FOOTPRINT} animate-pulse rounded-lg border border-border bg-surface`}
    />
  );
}

export default MapSkeleton;
