// Regression (review finding 1b): the SHARED location URL serializer must format
// lat/lon as PLAIN-DECIMAL strings with NO exponent notation, so EVERY coordinate
// source (city-search, geolocation, a map click) round-trips through the
// `DOT_DECIMAL` validator (`/^-?\d+(?:\.\d+)?$/`). Before the fix, `String(1e-7)`
// === "1e-7" — which `validation.ts` REJECTS — so a coordinate very near the
// equator/meridian serialized to a string that `parse` then rejected → the active
// location silently reset to empty. This hardens the app-shell location layer (a
// real bug it had); all its existing `url.test.ts` cases stay green.
//
// @trace FR-SHELL-01, NFR-OBS-01
import { describe, it, expect } from "vitest";
import { serialize, parse } from "@/lib/location/url";
import type { Location } from "@/lib/location/types";

describe("lib/location/url — serialize emits plain decimals (no exponent) that round-trip (FR-SHELL-01)", () => {
  it("serializes a tiny coordinate WITHOUT exponent notation", () => {
    const params = serialize({ lat: 1e-7, lon: -1e-7, name: "Near null island" });
    // The classic bug: String(1e-7) === "1e-7". The serializer must not produce that.
    expect(params.lat).not.toMatch(/e/i);
    expect(params.lon).not.toMatch(/e/i);
    // Plain dot-decimal form, accepted by DOT_DECIMAL.
    expect(params.lat).toMatch(/^-?\d+(?:\.\d+)?$/);
    expect(params.lon).toMatch(/^-?\d+(?:\.\d+)?$/);
  });

  it("serialize → parse is identity for a tiny coordinate (lat 1e-7), not null", () => {
    const tiny: Location = { lat: 1e-7, lon: 1e-7, name: "Tiny" };
    const reparsed = parse(serialize(tiny));
    expect(reparsed, "a tiny coordinate must survive the serialize→parse round trip").not.toBeNull();
    expect(reparsed).toEqual(tiny);
  });

  it("serialize → parse is identity across a range of magnitudes (no exponent drift)", () => {
    const samples: Location[] = [
      { lat: 1e-7, lon: -1e-7, name: "tiny" },
      { lat: 0.0000005, lon: -0.0000009, name: "sub-micro" },
      { lat: 50.4501, lon: 30.5234, name: "Київ" },
      { lat: -33.8688, lon: 151.2093, name: "Sydney" },
      { lat: 90, lon: 180, name: "edge" },
      { lat: -90, lon: -180, name: "edge" },
      { lat: 0, lon: 0, name: "null island" },
      { lat: 46.4825, lon: -169.5, name: "wrapped" },
    ];
    for (const loc of samples) {
      const reparsed = parse(serialize(loc));
      expect(reparsed, `round trip for ${JSON.stringify(loc)}`).toEqual(loc);
    }
  });

  it("keeps a normal coordinate's compact form (no trailing-zero bloat)", () => {
    // The existing url.test.ts pins serialize(KYIV).lat === "50.45"; confirm the
    // plain-decimal formatter trims trailing zeros rather than padding to 12 dp.
    const params = serialize({ lat: 50.45, lon: 30.52, name: "Kyiv" });
    expect(params.lat).toBe("50.45");
    expect(params.lon).toBe("30.52");
    expect(serialize({ lat: 49, lon: 32, name: "x" }).lat).toBe("49");
  });
});
