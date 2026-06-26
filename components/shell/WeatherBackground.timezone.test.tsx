// Regression (FR-ANIM-02): the animated background's day/night must follow the
// ACTIVE LOCATION's own sun times — derived from the location's UTC offset
// (Open-Meteo `utc_offset_seconds`) — and NEVER the viewer's device clock or
// timezone. This is the "explore another city" case: a viewer in one timezone
// looking at a city in a different timezone must see THAT city's sky.
//
// The review gate found the prior `isDaytime` reduced the absolute "now" with the
// VIEWER's `getHours()/getDate()`, so a cross-timezone viewer got day/night by
// THEIR clock. The fix threads the location's `utcOffsetSeconds` into the snapshot
// and `isDaytime` shifts the absolute instant into the location's frame.
//
// PROOF DESIGN (host-timezone-independent): the system clock is pinned to a FIXED
// ABSOLUTE INSTANT (a `Date.UTC(...)` epoch, identical on every host) and the sun
// strings are held constant; ONLY the location's `utcOffsetSeconds` changes
// between cases. Because the absolute instant + the viewer's clock are byte-for-
// byte identical across the cases, a day↔night flip can ONLY come from the
// LOCATION's offset — which is exactly the property under test. A regression to
// "use the viewer's clock" would yield the SAME band for both offsets and fail.
//
// Stack (ADR-0003/0004): Vitest + jsdom only — NO Playwright. `useWeather()` is
// MOCKED so the snapshot (incl. `utcOffsetSeconds`) is controllable; `matchMedia`
// is the vitest.setup default (motion permitted). A separate spec file so the
// pre-written `WeatherBackground.test.tsx` is never edited.
//
// @trace FR-ANIM-02
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

// A wide daytime window, location-local (05:00 → 21:00). The calendar date is
// intentionally a DIFFERENT day from some shifted instants below, proving the
// decision compares TIME-OF-DAY (a calendar-date mismatch must not flip it).
const SUNRISE = "2026-06-26T05:00";
const SUNSET = "2026-06-26T21:00";

// The FIXED absolute instant the viewer's machine reports — noon UTC. Identical on
// every host (it is an absolute epoch), so the proof does not depend on where the
// test runs.
const ABSOLUTE_NOON_UTC = Date.UTC(2026, 5, 26, 12, 0, 0);

function pinAbsolute(epochMs: number): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(epochMs));
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

function layerOf(r: RenderResult): HTMLElement {
  const el = r.container.querySelector('[data-slot="weather-background"]');
  expect(el, "the weather-background layer must render").not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  weatherRef.current = { todayCategory: null, sunrise: null, sunset: null, isLoaded: false };
  // Ensure motion is permitted (vitest.setup default returns matches:false).
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

describe("WeatherBackground — day/night follows the LOCATION's offset, not the viewer's clock (FR-ANIM-02)", () => {
  it("VIEWER's instant fixed at noon-UTC: a location at offset 0 (its local midday) → DAY gradient", async () => {
    // Location offset 0 → location-local time == 12:00 → inside 05:00→21:00 → day.
    weatherRef.current = {
      todayCategory: "clear",
      sunrise: SUNRISE,
      sunset: SUNSET,
      utcOffsetSeconds: 0,
      isLoaded: true,
    };
    pinAbsolute(ABSOLUTE_NOON_UTC);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="day"]'),
      "location-local midday must render the DAY gradient",
    ).not.toBeNull();
    expect(layer.querySelector('[data-gradient="night"]')).toBeNull();
  });

  it("SAME viewer instant (noon-UTC): a location at offset -13h (its local 23:00) → NIGHT gradient", async () => {
    // The mirror: at the IDENTICAL absolute instant + identical viewer clock, only
    // the LOCATION offset changes (-13h → location-local 23:00, past sunset). If
    // day/night were read from the viewer's clock it would be unchanged from the
    // case above (day); it MUST flip to night because the location did.
    weatherRef.current = {
      todayCategory: "clear",
      sunrise: SUNRISE,
      sunset: SUNSET,
      utcOffsetSeconds: -13 * 3600,
      isLoaded: true,
    };
    pinAbsolute(ABSOLUTE_NOON_UTC);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="night"]'),
      "location-local night must render the NIGHT gradient (the location, not the viewer, decides)",
    ).not.toBeNull();
    expect(layer.querySelector('[data-gradient="day"]')).toBeNull();
  });

  it("cross-timezone + calendar-date mismatch: viewer instant 03:00-UTC, location offset -10h → location-local 17:00 (prior day) → DAY", async () => {
    // A concrete cross-timezone pairing: pin the viewer to 03:00 UTC. A location at
    // a far-WEST offset (-10h) is at 17:00 the PREVIOUS calendar day — still inside
    // its 05:00→21:00 window → DAY. This also exercises the calendar-date mismatch
    // (the shifted instant is the prior day) without flipping the time-of-day
    // decision.
    weatherRef.current = {
      todayCategory: "clear",
      sunrise: SUNRISE,
      sunset: SUNSET,
      utcOffsetSeconds: -10 * 3600,
      isLoaded: true,
    };
    pinAbsolute(Date.UTC(2026, 5, 27, 3, 0, 0)); // 03:00 UTC on the 27th
    // location-local = 03:00 - 10h = 17:00 on the 26th → day.
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(
      layer.querySelector('[data-gradient="day"]'),
      "location-local 17:00 (prior calendar day) is inside the sun window → DAY",
    ).not.toBeNull();
    expect(layer.querySelector('[data-gradient="night"]')).toBeNull();
  });

  it("no offset on the snapshot → still renders a gradient (degrades to the day default, never throws)", async () => {
    // A loaded snapshot that lacks the offset (older payload / omitted field): the
    // helper cannot reach the location frame, so it falls back to the DAY default —
    // a gradient still renders, the console stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    weatherRef.current = {
      todayCategory: "clear",
      sunrise: SUNRISE,
      sunset: SUNSET,
      // utcOffsetSeconds omitted
      isLoaded: true,
    };
    pinAbsolute(ABSOLUTE_NOON_UTC);
    const r = await renderBackground();
    const layer = layerOf(r);
    expect(layer.querySelector("[data-gradient]"), "a gradient must always render").not.toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
