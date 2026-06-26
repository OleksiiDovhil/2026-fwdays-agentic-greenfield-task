// Regression (FR-ANIM-01): the background is a pure function of the snapshot, so
// when the active location changes and the published weather category changes, the
// rendered effect must switch and NO effect from the previous location remains
// (the spec's "Condition updates when active location changes" scenario).
//
// Stack (ADR-0003/0004): Vitest + jsdom only. `useWeather()` is MOCKED so the test
// drives the snapshot; re-rendering after mutating the category models a location
// change (ForecastSection would publish the new snapshot). Motion permitted
// (matchMedia default matches:false). A separate spec file so the pre-written
// `WeatherBackground.test.tsx` is never edited.
//
// @trace FR-ANIM-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { WeatherCategory } from "@/lib/forecast/weather-code";

type Snapshot = {
  todayCategory: WeatherCategory | null;
  sunrise: string | null;
  sunset: string | null;
  utcOffsetSeconds?: number | null;
  isLoaded: boolean;
};

const weatherRef: { current: Snapshot } = {
  current: { todayCategory: null, sunrise: null, sunset: null, isLoaded: false },
};
vi.mock("@/components/providers/WeatherProvider", () => ({
  useWeather: () => ({ weather: weatherRef.current, publish: vi.fn() }),
  WeatherProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const SUNRISE = "2026-06-26T05:00";
const SUNSET = "2026-06-26T21:00";

function loaded(category: WeatherCategory): Snapshot {
  return {
    todayCategory: category,
    sunrise: SUNRISE,
    sunset: SUNSET,
    utcOffsetSeconds: 0,
    isLoaded: true,
  };
}

function pinDay(): void {
  vi.useFakeTimers();
  // Noon UTC + offset 0 → location midday → day, motion permitted.
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 26, 12, 0, 0)));
}

async function renderBackground(): Promise<RenderResult> {
  const mod = await import("@/components/shell/WeatherBackground");
  const WeatherBackground = mod.WeatherBackground;
  let result!: RenderResult;
  await act(async () => {
    result = render(<WeatherBackground />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

async function rerender(r: RenderResult): Promise<void> {
  const mod = await import("@/components/shell/WeatherBackground");
  const WeatherBackground = mod.WeatherBackground;
  await act(async () => {
    r.rerender(<WeatherBackground />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function layerOf(r: RenderResult): HTMLElement {
  const el = r.container.querySelector('[data-slot="weather-background"]');
  expect(el, "the weather-background layer must render").not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  weatherRef.current = { todayCategory: null, sunrise: null, sunset: null, isLoaded: false };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("WeatherBackground — the effect switches when the location's category changes (FR-ANIM-01)", () => {
  it("rain → snow: the rain layer is replaced by the snow layer (no leftover rain)", async () => {
    weatherRef.current = loaded("rain");
    pinDay();
    const r = await renderBackground();
    let layer = layerOf(r);
    expect(layer.querySelector('[data-particle="rain"]'), "starts on rain").not.toBeNull();
    expect(layer.querySelector('[data-particle="snow"]')).toBeNull();

    // A new active location publishes a snow category.
    weatherRef.current = loaded("snow");
    await rerender(r);
    layer = layerOf(r);
    expect(layer.querySelector('[data-particle="snow"]'), "switches to snow").not.toBeNull();
    expect(
      layer.querySelector('[data-particle="rain"]'),
      "no effect from the previous location remains",
    ).toBeNull();
  });

  it("cloudy → clear: the clouds layer is removed and only the gradient remains", async () => {
    weatherRef.current = loaded("cloudy");
    pinDay();
    const r = await renderBackground();
    let layer = layerOf(r);
    expect(layer.querySelector('[data-particle="clouds"]'), "starts on clouds").not.toBeNull();

    weatherRef.current = loaded("clear");
    await rerender(r);
    layer = layerOf(r);
    expect(
      layer.querySelector("[data-particle]"),
      "a clear category leaves the gradient only — no particle node",
    ).toBeNull();
    expect(layer.querySelector("[data-gradient]"), "the gradient still renders").not.toBeNull();
  });
});
