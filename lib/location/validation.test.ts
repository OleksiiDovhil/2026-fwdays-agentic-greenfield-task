// Test-first (red): asserts the SPECIFIED validation contract for the active
// location. design.md D2 pins this as a zod schema in `lib/location/validation.ts`
// that is TOTAL (never throws to the UI) and rejects malformed/out-of-range/
// partial/comma-decimal input. Implementation does not exist yet — these MUST
// fail because the module is missing, not because of weak assertions.
//
// The planned surface (D2): a zod schema `locationSchema` whose `.safeParse`
// validates a raw string-keyed candidate, plus a total `validateLocation` helper
// returning a discriminated success/failure. Both must reject everything the
// spec marks invalid and must never throw.
//
// @trace FR-SHELL-01
import { describe, it, expect } from "vitest";
import { locationSchema, validateLocation } from "@/lib/location/validation";

const raw = (lat: string, lon: string, name: string) => ({ lat, lon, name });

describe("lib/location/validation — locationSchema (zod, total via safeParse)", () => {
  it("succeeds for well-formed dot-decimal coordinates and a bounded name", () => {
    const result = locationSchema.safeParse(raw("50.45", "30.52", "Kyiv"));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lat).toBe(50.45);
      expect(result.data.lon).toBe(30.52);
      expect(result.data.name).toBe("Kyiv");
    }
  });

  it("accepts the coordinate boundaries (-90/-180, 0/0, 90/180)", () => {
    expect(locationSchema.safeParse(raw("-90", "-180", "S")).success).toBe(true);
    expect(locationSchema.safeParse(raw("0", "0", "Null Island")).success).toBe(
      true,
    );
    expect(locationSchema.safeParse(raw("90", "180", "Edge")).success).toBe(true);
  });

  it("rejects out-of-range lat (∉ [-90, 90])", () => {
    expect(locationSchema.safeParse(raw("200", "30", "x")).success).toBe(false);
    expect(locationSchema.safeParse(raw("90.0001", "30", "x")).success).toBe(
      false,
    );
    expect(locationSchema.safeParse(raw("-90.5", "30", "x")).success).toBe(false);
  });

  it("rejects out-of-range lon (∉ [-180, 180])", () => {
    expect(locationSchema.safeParse(raw("10", "999", "x")).success).toBe(false);
    expect(locationSchema.safeParse(raw("10", "180.5", "x")).success).toBe(false);
    expect(locationSchema.safeParse(raw("10", "-181", "x")).success).toBe(false);
  });

  it("rejects non-numeric coordinates", () => {
    expect(locationSchema.safeParse(raw("abc", "10", "x")).success).toBe(false);
    expect(locationSchema.safeParse(raw("10", "xyz", "x")).success).toBe(false);
  });

  it("rejects comma-decimal coordinates (dot decimal ONLY)", () => {
    expect(locationSchema.safeParse(raw("50,45", "30,52", "Kyiv")).success).toBe(
      false,
    );
    expect(locationSchema.safeParse(raw("50,45", "30.52", "Kyiv")).success).toBe(
      false,
    );
  });

  it("rejects non-finite coordinate tokens (NaN / Infinity)", () => {
    expect(locationSchema.safeParse(raw("NaN", "30", "x")).success).toBe(false);
    expect(locationSchema.safeParse(raw("Infinity", "30", "x")).success).toBe(
      false,
    );
  });

  it("rejects a blank name and a name longer than 120 characters", () => {
    expect(locationSchema.safeParse(raw("50.45", "30.52", "")).success).toBe(
      false,
    );
    expect(
      locationSchema.safeParse(raw("50.45", "30.52", "a".repeat(121))).success,
    ).toBe(false);
  });

  it("accepts a name at exactly 120 characters", () => {
    expect(
      locationSchema.safeParse(raw("50.45", "30.52", "k".repeat(120))).success,
    ).toBe(true);
  });

  it("never throws on any candidate, however hostile", () => {
    expect(() => locationSchema.safeParse(undefined)).not.toThrow();
    expect(() => locationSchema.safeParse(null)).not.toThrow();
    expect(() => locationSchema.safeParse({})).not.toThrow();
    expect(() =>
      locationSchema.safeParse(raw("50,45", "30,52", "x".repeat(9999))),
    ).not.toThrow();
  });
});

describe("lib/location/validation — validateLocation (total helper)", () => {
  it("reports success with the typed Location for valid input", () => {
    const result = validateLocation(raw("50.45", "30.52", "Kyiv"));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ lat: 50.45, lon: 30.52, name: "Kyiv" });
    }
  });

  it("reports failure (not a throw) for every invalid class", () => {
    const invalids = [
      raw("abc", "10", "Kyiv"), // non-numeric
      raw("200", "999", "Kyiv"), // out of range
      raw("50,45", "30,52", "Kyiv"), // comma-decimal
      raw("50.45", "30.52", ""), // blank name
      raw("50.45", "30.52", "a".repeat(121)), // over-length name
    ];
    for (const candidate of invalids) {
      expect(() => validateLocation(candidate)).not.toThrow();
      expect(validateLocation(candidate).success).toBe(false);
    }
  });
});
