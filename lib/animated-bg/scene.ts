// Pure, framework-free, TOTAL category → scene mapping for the animated
// background — design.md D3, FR-ANIM-01, TC-PURE-01.
//
// `conditionToScene(category)` collapses the seven day/night-agnostic
// `WeatherCategory` values (from the LOCKED `lib/forecast/weather-code.ts`
// contract) onto a base-gradient FAMILY plus exactly ONE of three calm effect
// families (rain / snow / clouds) or no effect. The gradient kind carries the
// finer distinction (clear vs cloudy vs fog vs storm) the three effect families
// do not, so the layer stays calm and light (no per-code effect zoo, no
// lightning for thunder — per the spec Exclusions).
//
// Framework-free (TC-PURE-01): imports only the cross-capability
// `WeatherCategory` TYPE — no `next/*`, no `react`, no DOM.
import type { WeatherCategory } from "@/lib/forecast/weather-code";

/** The base-gradient family a category tints the day/night base with. */
export type GradientKind = "clear" | "cloudy" | "fog" | "storm";

/** The single animated effect family (or none) over the gradient. */
export type ParticleKind = "rain" | "snow" | "clouds" | "none";

/** A complete scene: always both fields defined (the layer never blanks). */
export type Scene = {
  gradient: GradientKind;
  particle: ParticleKind;
};

// The neutral default for an unknown / null / undefined / future category — a
// plain clear gradient with no effect (FR-ANIM-01 "unknown or missing weather
// code degrades to gradient").
const NEUTRAL: Scene = { gradient: "clear", particle: "none" };

// The documented category → scene table (design.md D3). Pinned so a regression
// that re-maps any category is caught by the unit test.
//   clear   → clear  gradient, NO effect (the spec's clear scenario)
//   cloudy  → cloudy gradient, drifting clouds
//   fog     → fog    gradient, a soft cloud drift (no fog-density effect)
//   drizzle → cloudy gradient, rain particles (a light rain)
//   rain    → cloudy gradient, rain particles
//   snow    → cloudy gradient, snow particles
//   thunder → storm  gradient, rain particles (NO lightning effect, Exclusions)
const SCENES: Record<WeatherCategory, Scene> = {
  clear: { gradient: "clear", particle: "none" },
  cloudy: { gradient: "cloudy", particle: "clouds" },
  fog: { gradient: "fog", particle: "clouds" },
  drizzle: { gradient: "cloudy", particle: "rain" },
  rain: { gradient: "cloudy", particle: "rain" },
  snow: { gradient: "cloudy", particle: "snow" },
  thunder: { gradient: "storm", particle: "rain" },
};

/**
 * Total category → scene. A defined `WeatherCategory` maps per the table; an
 * unknown / `null` / `undefined` category returns the neutral `{ gradient:
 * 'clear', particle: 'none' }` default. Returns a fresh complete scene on every
 * call; never throws, never blanks.
 */
export function conditionToScene(
  category: WeatherCategory | null | undefined,
): Scene {
  if (category == null) return { ...NEUTRAL };
  const scene = SCENES[category];
  if (scene === undefined) return { ...NEUTRAL };
  return { ...scene };
}
