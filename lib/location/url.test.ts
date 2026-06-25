// Test-first (red): asserts the SPECIFIED behavior of the pure URL
// parse/serialize for the active-location query string `?lat=&lon=&name=`.
// Implementation (`lib/location/url.ts`) does not exist yet — these MUST fail
// because the module is missing / behavior unimplemented, not because of the
// assertions. Pinned by design.md D2 + spec "Single-page shell layout" and
// "Malformed ... degrades to the empty state".
//
// @trace FR-SHELL-01
import { describe, it, expect } from "vitest";
import { parse, serialize } from "@/lib/location/url";
import type { Location } from "@/lib/location/types";

const KYIV: Location = { lat: 50.45, lon: 30.52, name: "Kyiv" };

describe("lib/location/url — parse", () => {
  it("round-trips a well-formed dot-decimal location from a param map", () => {
    const loc = parse({ lat: "50.45", lon: "30.52", name: "Kyiv" });
    expect(loc).toEqual(KYIV);
  });

  it("restores a Ukrainian name and integer-valued coordinates", () => {
    const loc = parse({ lat: "49", lon: "32", name: "Київ" });
    expect(loc).toEqual({ lat: 49, lon: 32, name: "Київ" });
  });

  it("accepts the negative/zero coordinate boundaries", () => {
    expect(parse({ lat: "-90", lon: "-180", name: "South" })).toEqual({
      lat: -90,
      lon: -180,
      name: "South",
    });
    expect(parse({ lat: "0", lon: "0", name: "Null Island" })).toEqual({
      lat: 0,
      lon: 0,
      name: "Null Island",
    });
    expect(parse({ lat: "90", lon: "180", name: "Edge" })).toEqual({
      lat: 90,
      lon: 180,
      name: "Edge",
    });
  });

  it("returns null for a non-numeric lat (e.g. ?lat=abc&lon=10)", () => {
    expect(parse({ lat: "abc", lon: "10", name: "Kyiv" })).toBeNull();
  });

  it("returns null for out-of-range coordinates (lat 200, lon 999)", () => {
    expect(parse({ lat: "200", lon: "999", name: "Nowhere" })).toBeNull();
    expect(parse({ lat: "90.0001", lon: "30", name: "OverLat" })).toBeNull();
    expect(parse({ lat: "10", lon: "-180.5", name: "OverLon" })).toBeNull();
  });

  it("returns null for partial params (missing lon, missing name)", () => {
    expect(parse({ lat: "50.45", name: "Kyiv" })).toBeNull();
    expect(parse({ lat: "50.45", lon: "30.52" })).toBeNull();
    expect(parse({ lat: "50" })).toBeNull();
    expect(parse({})).toBeNull();
  });

  it("returns null for a blank name", () => {
    expect(parse({ lat: "50.45", lon: "30.52", name: "" })).toBeNull();
    expect(parse({ lat: "50.45", lon: "30.52", name: "   " })).toBeNull();
  });

  it("returns null for a name longer than 120 characters", () => {
    const tooLong = "a".repeat(121);
    expect(parse({ lat: "50.45", lon: "30.52", name: tooLong })).toBeNull();
  });

  it("accepts a name at exactly the 120-character boundary", () => {
    const exactly = "k".repeat(120);
    expect(parse({ lat: "50.45", lon: "30.52", name: exactly })).toEqual({
      lat: 50.45,
      lon: 30.52,
      name: exactly,
    });
  });

  it("returns null for comma-decimal coordinates (50,45 / 30,52) — never coerced", () => {
    expect(parse({ lat: "50,45", lon: "30,52", name: "Kyiv" })).toBeNull();
    expect(parse({ lat: "50,45", lon: "30.52", name: "Kyiv" })).toBeNull();
    expect(parse({ lat: "50.45", lon: "30,52", name: "Kyiv" })).toBeNull();
  });

  it("returns null (never NaN, never a throw) for non-finite tokens", () => {
    for (const bad of ["NaN", "Infinity", "-Infinity", "1e999"]) {
      expect(() => parse({ lat: bad, lon: "30", name: "Kyiv" })).not.toThrow();
      expect(parse({ lat: bad, lon: "30", name: "Kyiv" })).toBeNull();
    }
  });

  it("never throws regardless of how malformed the input is", () => {
    expect(() => parse({ lat: "", lon: "", name: "" })).not.toThrow();
    expect(() =>
      parse({ lat: "50.45", lon: "30.52", name: "x".repeat(5000) }),
    ).not.toThrow();
  });
});

describe("lib/location/url — serialize", () => {
  it("serializes a location into lat/lon/name params", () => {
    const params = serialize(KYIV);
    expect(String(params.lat)).toBe("50.45");
    expect(String(params.lon)).toBe("30.52");
    expect(params.name).toBe("Kyiv");
  });

  it("serialize -> parse is an identity round trip", () => {
    const params = serialize(KYIV);
    const map: Record<string, string> = {
      lat: String(params.lat),
      lon: String(params.lon),
      name: String(params.name),
    };
    expect(parse(map)).toEqual(KYIV);
  });
});
