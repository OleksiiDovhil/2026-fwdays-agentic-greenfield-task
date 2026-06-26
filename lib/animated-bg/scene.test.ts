// Test-first (RED): asserts the SPECIFIED behavior of the pure, total
// category→scene mapping pinned by design.md D3 and the animated-bg spec
// requirement "Condition-driven background layer" (FR-ANIM-01). The implementation
// (`lib/animated-bg/scene.ts`) does NOT exist yet — these MUST fail because the
// module is MISSING / the behavior is unimplemented, not because of weak
// assertions. Never weaken a test to make it pass.
//
// Contract under test (D3, FR-ANIM-01):
//   - `conditionToScene(category: WeatherCategory | null | undefined): { gradient:
//     GradientKind; particle: ParticleKind }` is pure and TOTAL.
//   - `ParticleKind = "rain" | "snow" | "clouds" | "none"`.
//   - The documented category → particle family table:
//       clear   → none      (gradient only)
//       cloudy  → clouds
//       fog     → clouds     (over a fog gradient)
//       drizzle → rain
//       rain    → rain
//       snow    → snow
//       thunder → rain       (NO lightning effect, per Exclusions)
//   - Every category yields a DEFINED gradient kind (a non-empty string).
//   - TOTAL: an unknown / null / undefined category → the neutral default
//     `{ gradient: "clear", particle: "none" }` (gradient only); no throw, no blank.
//
// Framework-free (TC-PURE-01): imports only the pure helper + the LOCKED
// `WeatherCategory` contract — no React, no DOM, no next/*.
//
// EVAL DECISION (task 5.9, design D7) — SKIPPED, with reason. This slice adds NO
// `evals/cases/*.eval.ts`. The animated background is DECORATIVE and renders no
// graded, user-visible prose: the gradient/particles carry no copy (Exclusions:
// "no readable data in the background"), and the ONLY candidate string is the
// non-announced accessible label `shell.background.label` ("Тло з погодою" / EN
// "Weather backdrop"), which is `aria-hidden` and reused verbatim from the shell.
// That label is already covered — its calm, no-exclamation tone is enforced for
// BOTH locales by the existing `lib/i18n/i18n.test.ts` no-`!` sweep, and the copy
// itself ships with `add-app-shell`. An eval here would grade a sub-rubric line of
// machine-checked, already-shipped copy, so per design D7 ("an EVAL is LOW-VALUE …
// the plan records SKIP-with-note as acceptable") it is SKIPPED. If a distinct
// `animatedBg.label` is later added, the same i18n sweep covers it automatically.
//
// @trace FR-ANIM-01
import { describe, it, expect } from "vitest";
import { conditionToScene } from "@/lib/animated-bg/scene";
import type { WeatherCategory } from "@/lib/forecast/weather-code";

// The documented category → particle family table (design D3). Pinned here so a
// regression that re-maps any category is caught objectively.
const EXPECTED_PARTICLE: Record<WeatherCategory, "rain" | "snow" | "clouds" | "none"> = {
  clear: "none",
  cloudy: "clouds",
  fog: "clouds",
  drizzle: "rain",
  rain: "rain",
  snow: "snow",
  thunder: "rain",
};

// Every WeatherCategory the locked contract defines — exhaustive, so adding a future
// category without updating the map would surface here.
const ALL_CATEGORIES: WeatherCategory[] = [
  "clear",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "thunder",
];

describe("conditionToScene — maps each WeatherCategory to its documented particle family (FR-ANIM-01, D3)", () => {
  for (const category of ALL_CATEGORIES) {
    it(`${category} → particle "${EXPECTED_PARTICLE[category]}"`, () => {
      const scene = conditionToScene(category);
      expect(scene.particle).toBe(EXPECTED_PARTICLE[category]);
    });
  }

  it("only ever emits one of the four documented particle kinds", () => {
    const valid = new Set(["rain", "snow", "clouds", "none"]);
    for (const category of ALL_CATEGORIES) {
      expect(valid.has(conditionToScene(category).particle)).toBe(true);
    }
  });

  it("collapses the precipitation categories (drizzle / rain / thunder) onto the rain family", () => {
    expect(conditionToScene("drizzle").particle).toBe("rain");
    expect(conditionToScene("rain").particle).toBe("rain");
    // thunder maps to RAIN particles — no separate lightning effect (Exclusions).
    expect(conditionToScene("thunder").particle).toBe("rain");
  });

  it("maps cloudy AND fog onto the clouds family (a calm drift, no fog-density effect)", () => {
    expect(conditionToScene("cloudy").particle).toBe("clouds");
    expect(conditionToScene("fog").particle).toBe("clouds");
  });

  it("maps clear to NO particle (gradient only — the spec's clear scenario)", () => {
    expect(conditionToScene("clear").particle).toBe("none");
  });
});

describe("conditionToScene — every category yields a defined gradient kind (D3)", () => {
  for (const category of ALL_CATEGORIES) {
    it(`${category} → a non-empty gradient kind`, () => {
      const scene = conditionToScene(category);
      expect(typeof scene.gradient).toBe("string");
      expect((scene.gradient as string).length).toBeGreaterThan(0);
    });
  }
});

describe("conditionToScene — TOTAL: unknown / null / undefined → neutral default (FR-ANIM-01, D3)", () => {
  it("null → { gradient: 'clear', particle: 'none' } (gradient only)", () => {
    expect(conditionToScene(null)).toEqual({ gradient: "clear", particle: "none" });
  });

  it("undefined → { gradient: 'clear', particle: 'none' } (gradient only)", () => {
    expect(conditionToScene(undefined)).toEqual({ gradient: "clear", particle: "none" });
  });

  it("an unrecognised / future category string → the neutral default, no throw", () => {
    // The spec's "unknown or missing weather code degrades to gradient" scenario —
    // an unexpected category must never blank or break the render.
    const scene = conditionToScene("hurricane" as unknown as WeatherCategory);
    expect(scene).toEqual({ gradient: "clear", particle: "none" });
  });

  it("never throws on any input (null / undefined / unknown)", () => {
    expect(() => conditionToScene(null)).not.toThrow();
    expect(() => conditionToScene(undefined)).not.toThrow();
    expect(() => conditionToScene("???" as unknown as WeatherCategory)).not.toThrow();
  });

  it("returns a fresh object with both fields on every call (always a complete scene)", () => {
    for (const category of [...ALL_CATEGORIES, null, undefined]) {
      const scene = conditionToScene(category as WeatherCategory | null | undefined);
      expect(scene).toHaveProperty("gradient");
      expect(scene).toHaveProperty("particle");
    }
  });
});
