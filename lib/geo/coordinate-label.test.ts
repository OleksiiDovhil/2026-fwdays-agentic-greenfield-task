// Test-first (RED): asserts the SPECIFIED pure coordinate helpers pinned by
// design.md D2 and the map spec ("Out-of-range or antimeridian click coordinates
// are normalized before the location change", "Marker label falls back when the
// city name is unknown"). The implementation (`lib/geo/coordinate-label.ts`) does
// NOT exist yet — these MUST fail because the module is MISSING, not because of
// weak assertions. Never weaken a test to pass it.
//
// The planned surface (D2, tasks 2.3, 5.2) — two pure, TOTAL helpers (no `next/*`,
// no `react`, no DOM; TC-PURE-01):
//   - `normalizeLatLon(lat, lon): LatLon` — clamps latitude to [-90, 90] and WRAPS
//     longitude into [-180, 180] (e.g. lon 190.5 -> -169.5, lat 95 -> 90). A
//     non-finite input degrades to a safe value (e.g. 0), never NaN.
//   - `coordinateLabel(lat, lon): string` — a stable, rounded "lat, lon" string
//     (fixed small precision, dot-decimal) used as the popup display name when no
//     reverse name resolves. Total over any finite input, never throws.
//
// @trace FR-MAP-03
import { describe, it, expect } from "vitest";
import { normalizeLatLon, coordinateLabel } from "@/lib/geo/coordinate-label";
import type { LatLon } from "@/lib/geo/types";

describe("lib/geo/coordinate-label — normalizeLatLon clamps latitude to [-90, 90] (FR-MAP-03)", () => {
  it("clamps a latitude beyond the north pole to 90", () => {
    const out: LatLon = normalizeLatLon(95, 30);
    expect(out.lat).toBe(90);
  });

  it("clamps a latitude beyond the south pole to -90", () => {
    expect(normalizeLatLon(-95, 30).lat).toBe(-90);
    expect(normalizeLatLon(-90.0001, 0).lat).toBe(-90);
  });

  it("leaves an in-range latitude unchanged", () => {
    expect(normalizeLatLon(50.4501, 0).lat).toBeCloseTo(50.4501, 6);
    expect(normalizeLatLon(0, 0).lat).toBe(0);
    expect(normalizeLatLon(90, 0).lat).toBe(90);
    expect(normalizeLatLon(-90, 0).lat).toBe(-90);
  });
});

describe("lib/geo/coordinate-label — normalizeLatLon WRAPS longitude into [-180, 180] (the antimeridian scenario)", () => {
  it("wraps a longitude past the antimeridian (190.5 -> -169.5)", () => {
    const out = normalizeLatLon(46.4825, 190.5);
    expect(out.lon).toBeCloseTo(-169.5, 6);
  });

  it("wraps a longitude just past -180 (-181 -> 179)", () => {
    expect(normalizeLatLon(0, -181).lon).toBeCloseTo(179, 6);
  });

  it("wraps a far-out longitude back into range", () => {
    // 540 = 360 + 180; a full revolution lands back in [-180, 180].
    const lon = normalizeLatLon(0, 540).lon;
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });

  it("leaves an in-range longitude unchanged", () => {
    expect(normalizeLatLon(0, 30.5234).lon).toBeCloseTo(30.5234, 6);
    expect(normalizeLatLon(0, 0).lon).toBe(0);
    expect(normalizeLatLon(0, -179.9).lon).toBeCloseTo(-179.9, 6);
  });

  it("keeps the normalized longitude in range for every wrapped input", () => {
    for (const raw of [190.5, -181, 360, -360, 540, 1000, -1000, 179.999, -179.999]) {
      const lon = normalizeLatLon(0, raw).lon;
      expect(lon, `normalized lon for ${raw} must be in [-180, 180]`).toBeGreaterThanOrEqual(-180);
      expect(lon, `normalized lon for ${raw} must be in [-180, 180]`).toBeLessThanOrEqual(180);
    }
  });
});

describe("lib/geo/coordinate-label — normalizeLatLon is TOTAL: non-finite input degrades to a safe value, never NaN", () => {
  it("degrades NaN / Infinity inputs to finite, in-range values (never NaN)", () => {
    const hostile: Array<[number, number]> = [
      [NaN, 30],
      [50, NaN],
      [NaN, NaN],
      [Infinity, 30],
      [50, Infinity],
      [-Infinity, -Infinity],
    ];
    for (const [lat, lon] of hostile) {
      const out = normalizeLatLon(lat, lon);
      expect(Number.isFinite(out.lat), `lat for (${lat}, ${lon}) must be finite`).toBe(true);
      expect(Number.isFinite(out.lon), `lon for (${lat}, ${lon}) must be finite`).toBe(true);
      expect(out.lat).toBeGreaterThanOrEqual(-90);
      expect(out.lat).toBeLessThanOrEqual(90);
      expect(out.lon).toBeGreaterThanOrEqual(-180);
      expect(out.lon).toBeLessThanOrEqual(180);
    }
  });

  it("never throws for any numeric input", () => {
    expect(() => normalizeLatLon(NaN, NaN)).not.toThrow();
    expect(() => normalizeLatLon(1e308, -1e308)).not.toThrow();
  });
});

describe("lib/geo/coordinate-label — coordinateLabel returns a stable rounded 'lat, lon' string (FR-MAP-03)", () => {
  it("formats Kyiv coordinates as a rounded, dot-decimal 'lat, lon' label", () => {
    const label = coordinateLabel(50.4501, 30.5234);
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
    // Both rounded coordinate components appear, dot-decimal (never comma-decimal),
    // in lat, lon order.
    expect(label).toMatch(/50\.45/);
    expect(label).toMatch(/30\.52/);
    // The two numbers are separated (a comma/space separator), lat before lon.
    expect(label.indexOf("50")).toBeLessThan(label.indexOf("30"));
    // Dot-decimal: there is at least one "<digits>.<digits>" run.
    expect(label).toMatch(/\d+\.\d+/);
  });

  it("rounds to a fixed small precision (not the full float)", () => {
    const label = coordinateLabel(46.48430234, 30.73228789);
    // The raw 8-decimal tails must not survive — a fixed small precision is used.
    expect(label).not.toContain("46.48430234");
    expect(label).not.toContain("30.73228789");
  });

  it("is deterministic for the same input", () => {
    expect(coordinateLabel(50.4501, 30.5234)).toBe(coordinateLabel(50.4501, 30.5234));
  });

  it("renders a negative coordinate with a minus sign (locale-agnostic)", () => {
    const label = coordinateLabel(-33.8688, 151.2093);
    expect(label).toMatch(/-33\.8/);
  });

  it("is TOTAL over any finite input (zeros, extremes) and never throws", () => {
    const inputs: Array<[number, number]> = [
      [0, 0],
      [90, 180],
      [-90, -180],
      [12.51, -0.0001],
    ];
    for (const [lat, lon] of inputs) {
      expect(() => coordinateLabel(lat, lon)).not.toThrow();
      expect(typeof coordinateLabel(lat, lon)).toBe("string");
      expect(coordinateLabel(lat, lon).length).toBeGreaterThan(0);
    }
  });
});
