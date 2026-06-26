// Test-first (RED): asserts the SPECIFIED behavior of the condition-driven
// `WeatherBackground` layer pinned by design.md D2/D3/D4/D5 and the animated-bg
// spec (FR-ANIM-01 condition-driven layer, FR-ANIM-02 day/night from the location's
// sun times, FR-ANIM-03 prefers-reduced-motion, FR-ANIM-04 never blocks interaction,
// NFR-A11Y-01 decorative, NFR-OBS-01 honest degradation + console silence). The real
// layer does NOT exist yet — `components/shell/WeatherBackground.tsx` is the INERT
// stub (a bare `div`, no snapshot consumption, no particles). These MUST fail
// because the real behavior is unimplemented, not because of weak assertions. Never
// weaken a test to make it pass.
//
// Contract under test:
//   - A single background layer that is `aria-hidden="true"`, carries
//     `pointer-events: none` (class + computed), sits behind content (`-z-10`), and
//     contains NO focusable elements (FR-ANIM-04, NFR-A11Y-01).
//   - It CONSUMES `useWeather()` (mocked here) and renders a base gradient chosen
//     DAY vs NIGHT by `isDaytime` against the snapshot's sun times + the client
//     "now", plus the category's particle layer (rain / snow / clouds) when motion
//     is permitted (FR-ANIM-01/02).
//   - Reduced motion (matchMedia matches:true) → a STATIC gradient ONLY, NO particle
//     nodes; day/night selection still applies (FR-ANIM-03). matches:false → the
//     mapped effect IS rendered.
//   - No weather / not-loaded snapshot → a calm neutral DAY gradient, no effect, no
//     crash, console silent (NFR-OBS-01).
//
// Stable DOM hooks the component is expected to expose (so assertions are objective):
//   - the layer:        [data-slot="weather-background"]
//   - the gradient:     [data-gradient="day"] or [data-gradient="night"]
//   - the particles:    [data-particle="rain"|"snow"|"clouds"]
//
// Stack (ADR-0003/0004): Vitest + jsdom only — NO Playwright. `useWeather()` is
// MOCKED so the snapshot is controllable. `matchMedia` is provided by vitest.setup
// (matches:false); reduced-motion cases OVERRIDE `window.matchMedia` per-test. The
// client "now" is pinned with fake timers so day/night is deterministic.
//
// @trace FR-ANIM-01, FR-ANIM-02, FR-ANIM-03, FR-ANIM-04, NFR-A11Y-01, NFR-OBS-01
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { WeatherCategory } from "@/lib/forecast/weather-code";

type Snapshot = {
  todayCategory: WeatherCategory | null;
  sunrise: string | null;
  sunset: string | null;
  isLoaded: boolean;
};

// ── Mock useWeather so the test owns the snapshot the layer consumes. ────────────
const weatherRef: { current: Snapshot } = {
  current: { todayCategory: null, sunrise: null, sunset: null, isLoaded: false },
};
vi.mock("@/components/providers/WeatherProvider", () => ({
  useWeather: () => ({ weather: weatherRef.current, publish: vi.fn() }),
  WeatherProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// A fixed location-local day with a wide daytime window (05:00 → 21:00 local).
const DAY = "2026-06-26";
const SUNRISE = `${DAY}T05:00`;
const SUNSET = `${DAY}T21:00`;

function snapshot(over: Partial<Snapshot>): Snapshot {
  return {
    todayCategory: null,
    sunrise: SUNRISE,
    sunset: SUNSET,
    isLoaded: true,
    ...over,
  };
}

// Pin the client "now" to a wall-clock hour on `${DAY}` so the day/night decision is
// deterministic. The layer reads the location-local "now"; with sun strings and the
// faked clock both on the same calendar day, a daytime / nighttime hour selects the
// matching gradient regardless of the host timezone (the helper compares wall-clock
// components). month is 0-based (5 = June).
function pinNow(hour: number, minute = 0): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 26, hour, minute, 0, 0));
}

// Override matchMedia so `(prefers-reduced-motion: reduce)` reports `matches`.
function setReducedMotion(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /prefers-reduced-motion/.test(query) ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Render the (planned real) layer. Deferred import so a MISSING/renamed export fails
// the test rather than crashing collection.
async function renderBackground(): Promise<RenderResult> {
  const mod = await import("@/components/shell/WeatherBackground");
  const WeatherBackground = mod.WeatherBackground;
  let result!: RenderResult;
  await act(async () => {
    result = render(<WeatherBackground />);
  });
  // Flush the mount-read of "now" / reduced-motion into state.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function layerOf(r: RenderResult): HTMLElement {
  const el = r.container.querySelector('[data-slot="weather-background"]');
  expect(el, "the weather-background layer must render").not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  weatherRef.current = {
    todayCategory: null,
    sunrise: null,
    sunset: null,
    isLoaded: false,
  };
  setReducedMotion(false); // motion permitted by default
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("WeatherBackground — decorative + never blocks interaction (FR-ANIM-04, NFR-A11Y-01)", () => {
  it("renders a layer that is aria-hidden and carries pointer-events:none (class + the inline contract)", async () => {
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);

    expect(layer.getAttribute("aria-hidden")).toBe("true");
    // The class is the authoritative way the project disables pointer events
    // (Tailwind `pointer-events-none` maps to `pointer-events: none`).
    expect(
      layer.className,
      "the layer must carry the pointer-events-none utility (FR-ANIM-04)",
    ).toContain("pointer-events-none");
  });

  it("the layer never intercepts clicks — a click handler above it still fires", async () => {
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);

    // The layer carries pointer-events-none, so it cannot be the event target of a
    // real pointer interaction — the click reaches whatever sits beneath it. We
    // assert the property contract that guarantees this (jsdom does not do real
    // compositing/hit-testing, so the class/style IS the testable guarantee).
    expect(layer.className).toContain("pointer-events-none");
    // Belt: the layer exposes no onClick handler that would consume the event.
    expect(
      (layer as HTMLElement & { onclick?: unknown }).onclick ?? null,
      "the decorative layer must not bind a click handler",
    ).toBeNull();
  });

  it("sits behind content (-z-10) and contains NO focusable elements", async () => {
    weatherRef.current = snapshot({ todayCategory: "snow" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);

    expect(layer.className, "the layer must be positioned behind content").toContain("-z-10");

    // No tab stops anywhere inside the decorative layer.
    const focusable = layer.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    );
    expect(focusable.length, "a decorative layer must contain no focusable elements").toBe(0);
  });
});

describe("WeatherBackground — day/night base gradient by the location's sun times (FR-ANIM-01/02)", () => {
  it("a DAYTIME snapshot (now within the location's sun window) renders the DAY gradient", async () => {
    weatherRef.current = snapshot({ todayCategory: "clear" });
    pinNow(13, 0); // 13:00 local — inside 05:00→21:00 → day
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="day"]'),
      "a daytime snapshot must render the day gradient",
    ).not.toBeNull();
    expect(layer.querySelector('[data-gradient="night"]')).toBeNull();
  });

  it("a NIGHTTIME snapshot (now outside the location's sun window) renders the NIGHT gradient", async () => {
    weatherRef.current = snapshot({ todayCategory: "clear" });
    pinNow(23, 30); // 23:30 local — after sunset → night
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="night"]'),
      "a nighttime snapshot must render the night gradient",
    ).not.toBeNull();
    expect(layer.querySelector('[data-gradient="day"]')).toBeNull();
  });
});

describe("WeatherBackground — particle layer by category, motion permitted (FR-ANIM-01)", () => {
  it("a RAIN category renders the rain particle layer", async () => {
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(layer.querySelector('[data-particle="rain"]'), "rain → rain particles").not.toBeNull();
    expect(layer.querySelector('[data-particle="snow"]')).toBeNull();
    expect(layer.querySelector('[data-particle="clouds"]')).toBeNull();
  });

  it("a SNOW category renders the snow particle layer", async () => {
    weatherRef.current = snapshot({ todayCategory: "snow" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(layer.querySelector('[data-particle="snow"]'), "snow → snow particles").not.toBeNull();
    expect(layer.querySelector('[data-particle="rain"]')).toBeNull();
    expect(layer.querySelector('[data-particle="clouds"]')).toBeNull();
  });

  it("a CLOUDY category renders the clouds (drift) particle layer", async () => {
    weatherRef.current = snapshot({ todayCategory: "cloudy" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-particle="clouds"]'),
      "cloudy → drifting clouds",
    ).not.toBeNull();
    expect(layer.querySelector('[data-particle="rain"]')).toBeNull();
    expect(layer.querySelector('[data-particle="snow"]')).toBeNull();
  });

  it("a CLEAR category renders the gradient ONLY — no particle layer", async () => {
    weatherRef.current = snapshot({ todayCategory: "clear" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(layer.querySelector("[data-particle]"), "clear → no particles").toBeNull();
    // The gradient still renders.
    expect(layer.querySelector("[data-gradient]")).not.toBeNull();
  });

  it("an unknown/absent category (null) renders the gradient ONLY — no particle layer", async () => {
    weatherRef.current = snapshot({ todayCategory: null });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(layer.querySelector("[data-particle]"), "null category → no particles").toBeNull();
  });
});

describe("WeatherBackground — prefers-reduced-motion (FR-ANIM-03)", () => {
  it("reduced motion → STATIC gradient only, NO particle nodes (even for a rain category)", async () => {
    setReducedMotion(true);
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);

    // The gradient is still present...
    expect(layer.querySelector("[data-gradient]"), "the static gradient must still render").not.toBeNull();
    // ...but NO particle nodes are emitted at all (omitted entirely, not just paused).
    expect(
      layer.querySelector("[data-particle]"),
      "under reduced motion no particle nodes may be rendered",
    ).toBeNull();
  });

  it("reduced motion STILL respects day vs night (a nighttime snapshot → static NIGHT gradient)", async () => {
    setReducedMotion(true);
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(23, 30); // night at the location
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="night"]'),
      "reduced motion suppresses motion, not the day/night choice",
    ).not.toBeNull();
    expect(layer.querySelector("[data-particle]")).toBeNull();
  });

  it("motion permitted (matches:false) → the mapped SNOW effect IS rendered, not suppressed", async () => {
    setReducedMotion(false);
    weatherRef.current = snapshot({ todayCategory: "snow" });
    pinNow(13, 0);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-particle="snow"]'),
      "without reduced motion the mapped effect is required, not optional",
    ).not.toBeNull();
  });
});

describe("WeatherBackground — calm neutral default with no data + console silence (NFR-OBS-01)", () => {
  it("a NOT-LOADED snapshot renders the neutral DAY gradient with NO effect and a clean console", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // The no-location / failed-or-invalid-fetch case: not loaded, null category, null
    // sun times. `conditionToScene(null)` → none; `isDaytime(_, null, null)` → day.
    weatherRef.current = {
      todayCategory: null,
      sunrise: null,
      sunset: null,
      isLoaded: false,
    };
    pinNow(2, 0); // even at a nighttime hour, null sun times fall back to DAY
    const r = await renderBackground();
    const layer = layerOf(r);

    expect(
      layer.querySelector('[data-gradient="day"]'),
      "the not-loaded fallback must be the neutral DAY gradient",
    ).not.toBeNull();
    expect(layer.querySelector("[data-particle]"), "the fallback shows no effect").toBeNull();

    expect(errSpy, "the console must stay clean on the fallback path").not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not throw and stays silent on a healthy loaded render", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    weatherRef.current = snapshot({ todayCategory: "rain" });
    pinNow(13, 0);
    await expect(renderBackground()).resolves.toBeTruthy();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
