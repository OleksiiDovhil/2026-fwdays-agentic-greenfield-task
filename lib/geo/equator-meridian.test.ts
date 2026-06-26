// Regression (review finding 1a): a map click within ~1e-6° of the equator
// (lat 0) or the prime meridian (lon 0) must yield CLEAN, round-trippable
// coordinates so the location always survives the URL round-trip — it must never
// silently reset to empty (the "a click always sets a usable location" invariant,
// FR-MAP-03). `normalizeLatLon` rounds to a fixed precision and snaps a sub-1e-6
// magnitude to exactly 0; this test pins that, and the end-to-end round-trip
// (serialize → parse) is proven in `lib/location/serialize-roundtrip.test.ts`.
//
// @trace FR-MAP-03, NFR-OBS-01
import { describe, it, expect } from "vitest";
import { normalizeLatLon } from "@/lib/geo/coordinate-label";
import { serialize, parse } from "@/lib/location/url";

describe("lib/geo — normalizeLatLon yields clean coords near the equator/meridian (FR-MAP-03)", () => {
  it("snaps a tiny sub-1e-6 magnitude to exactly 0 (no exponent-prone float)", () => {
    expect(normalizeLatLon(1e-7, 1e-7)).toEqual({ lat: 0, lon: 0 });
    expect(normalizeLatLon(-1e-9, 5e-8)).toEqual({ lat: 0, lon: 0 });
    // A click a hair off the equator keeps a clean longitude, snaps lat to 0.
    expect(normalizeLatLon(2e-8, 30.5234)).toEqual({ lat: 0, lon: 30.5234 });
  });

  it("rounds a noisy coordinate to a fixed precision (≤ 6 decimals, no long float tail)", () => {
    const out = normalizeLatLon(46.48250000001, 30.72330000007);
    // The 11-decimal noise must not survive — a clean ≤6-decimal value remains.
    expect(out.lat).toBe(46.4825);
    expect(out.lon).toBe(30.7233);
  });

  it("a click near (0,0) sets a USABLE location that round-trips (not empty)", () => {
    // Simulate the click → normalize → setLocation → URL serialize → URL re-parse
    // chain. Pre-fix, the tiny float serialized to '1e-7' which DOT_DECIMAL rejected
    // → parse returned null → the location (and forecast) reset to empty.
    const { lat, lon } = normalizeLatLon(1e-7, -3e-8);
    const reparsed = parse(serialize({ lat, lon, name: "Обране місце" }));
    expect(reparsed, "a near-(0,0) click must remain a usable location").not.toBeNull();
    expect(reparsed).toEqual({ lat: 0, lon: 0, name: "Обране місце" });
  });

  it("a real city's coordinate is unchanged by normalization", () => {
    expect(normalizeLatLon(50.4501, 30.5234)).toEqual({ lat: 50.4501, lon: 30.5234 });
    expect(normalizeLatLon(-33.8688, 151.2093)).toEqual({ lat: -33.8688, lon: 151.2093 });
  });
});
