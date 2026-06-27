// The shared rounded-coordinate identity for a Location — its natural home (a
// Location identity belongs with the Location type). Framework-free: no `next/*`,
// no `react`, no DOM.
//
// This is the ONE identity the whole app keys a place on:
//   - `ForecastSection`'s in-memory forecast cache,
//   - `PinProvider`'s dedupe + unpin (the pinned-city list),
//   - `CompareSection`'s per-city forecast cache + table columns,
//   - `buildCompareRow`'s row key.
// Two coordinates that round to the same key are the SAME place (so a pin, its
// forecast, and its column all match). Rounded to 4 decimal places (~11 m), which
// is finer than any city the geocoder resolves yet coarse enough to collapse the
// float noise a round-trip through the URL introduces.
import type { Location } from "@/lib/location/types";

/** A stable identity for a location ({lat,lon} rounded to 4 decimal places). */
export function keyOf(location: Location): string {
  return `${location.lat.toFixed(4)},${location.lon.toFixed(4)}`;
}
