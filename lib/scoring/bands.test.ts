// Test-first (RED): asserts the SPECIFIED comfort-band thresholds pinned by
// design.md D6 and spec "Comfort badge color thresholds". The implementation
// (`bandOf` in `lib/scoring/comfort.ts`) does NOT exist yet — these MUST fail
// because the export is missing / the mapping is unimplemented.
//
// Contract under test (D6, FR-COMFORT-04): `bandOf(value)` applies thresholds at
// the EXACT boundaries — value >= 70 -> "green"; 40 <= value <= 69 -> "yellow";
// value < 40 -> "red" (so 70 green, 69 yellow, 40 yellow, 39 red). Pure.
//
// @trace FR-COMFORT-04
import { describe, it, expect } from "vitest";
import { bandOf } from "@/lib/scoring/comfort";

describe("bandOf — band thresholds at the EXACT boundaries (FR-COMFORT-04)", () => {
  // The spec's three boundary scenarios, asserted at and around every edge so a
  // ">" vs ">=" / "<" vs "<=" slip is caught.
  const cases: Array<[number, "green" | "yellow" | "red"]> = [
    [70, "green"], // boundary: 70 is green (>= 70)
    [85, "green"], // interior green
    [69, "yellow"], // boundary: 69 is yellow (just below green)
    [55, "yellow"], // interior yellow
    [40, "yellow"], // boundary: 40 is yellow (>= 40)
    [39, "red"], // boundary: 39 is red (just below yellow)
    [0, "red"], // interior red
  ];

  for (const [value, expected] of cases) {
    it(`bandOf(${value}) === "${expected}"`, () => {
      expect(bandOf(value)).toBe(expected);
    });
  }

  it("the green/yellow boundary is at exactly 70 (70 green, 69 yellow)", () => {
    expect(bandOf(70)).toBe("green");
    expect(bandOf(69)).toBe("yellow");
  });

  it("the yellow/red boundary is at exactly 40 (40 yellow, 39 red)", () => {
    expect(bandOf(40)).toBe("yellow");
    expect(bandOf(39)).toBe("red");
  });

  it("the extremes of the clamp range map to the outer bands", () => {
    expect(bandOf(100)).toBe("green");
    expect(bandOf(0)).toBe("red");
  });
});
