// Test-first (RED): asserts the SPECIFIED behavior of the shared `WeatherContext`
// pinned by design.md D1 and the animated-bg spec's CROSS-SLICE note (the forecast
// PUBLISHES `{ todayCategory, sunrise, sunset, isLoaded }`; decorative consumers
// CONSUME it via `useWeather()`). The implementation
// (`components/providers/WeatherProvider.tsx`) and the additive
// `ForecastSection` publish edit do NOT exist yet — these MUST fail because the
// provider module is MISSING and the publish is unimplemented, not because of weak
// assertions. Never weaken a test to make it pass.
//
// Contract under test (D1):
//   - `WeatherProvider` holds an in-memory `WeatherSnapshot` and exposes
//     `useWeather() → { weather, publish }`.
//   - The NOT-LOADED default is `{ todayCategory: null, sunrise: null, sunset: null,
//     isLoaded: false }` — returned outside a provider (a stray consumer never
//     crashes, mirroring `useLocation`/`useTheme`) and as the initial in-provider
//     value.
//   - `publish(next)` updates every consumer.
//   - CROSS-SLICE: `ForecastSection`, wrapped in a real `WeatherProvider`, PUBLISHES
//     `{ todayCategory: describeWeather(days[0].weatherCode).category, sunrise:
//     days[0].sunrise, sunset: days[0].sunset, isLoaded: true }` after a successful
//     forecast load, and the not-loaded default on no-location / error. This edit is
//     ADDITIVE — the existing ForecastSection.test.tsx suite must stay green.
//
// Stack (ADR-0003/0004): Vitest + jsdom only. `fetch` is MOCKED. `useLocation()` is
// MOCKED so the active location can change. `next/dynamic` + `HourlyChart` are
// MOCKED (the section loads Recharts lazily; this test never touches its internals).
//
// @trace FR-ANIM-01, FR-ANIM-02
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, render, renderHook, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Location } from "@/lib/location/types";

// ── Mock useLocation so this test owns the active location. ─────────────────────
const locationRef: { current: Location | null } = { current: null };
vi.mock("@/components/providers/LocationProvider", () => ({
  useLocation: () => ({ location: locationRef.current, setLocation: vi.fn() }),
  LocationProvider: ({ children }: { children: ReactNode }) => children,
}));

// ── Mock the dynamically-imported Recharts chart (same approach as
// ForecastSection.test.tsx): both the next/dynamic factory and the HourlyChart
// module return a synchronous stand-in, so no Recharts internals are needed. ─────
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDynamicChart(props: { data?: unknown[] }) {
      return (
        <div
          data-testid="hourly-chart"
          data-points={Array.isArray(props?.data) ? props.data.length : 0}
        />
      );
    },
}));
vi.mock("@/components/forecast/HourlyChart", () => ({
  default: (props: { data?: unknown[] }) => (
    <div
      data-testid="hourly-chart"
      data-points={Array.isArray(props?.data) ? props.data.length : 0}
    />
  ),
}));

const KYIV: Location = { lat: 50.45, lon: 30.52, name: "Київ" };

// The not-loaded default the provider must expose outside a provider and initially.
const NOT_LOADED = {
  todayCategory: null,
  sunrise: null,
  sunset: null,
  isLoaded: false,
} as const;

// ── A typed /api/forecast body whose days[0] pins a KNOWN category + sun times. The
// forecast publishes describeWeather(days[0].weatherCode).category — code 61 is
// `rain` per lib/forecast/weather-code.ts, so the published category must be "rain".
const TODAY = "2026-06-26";
const TODAY_SUNRISE = `${TODAY}T05:11`;
const TODAY_SUNSET = `${TODAY}T21:47`;

function isoDay(offset: number): string {
  const d = new Date(Date.UTC(2026, 5, 26) + offset * 86_400_000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function makeForecast() {
  const days = Array.from({ length: 7 }, (_, i) => ({
    time: isoDay(i),
    // days[0] is code 61 (rain); the rest vary but only days[0] is published.
    weatherCode: i === 0 ? 61 : [0, 3, 71, 95, 45, 80][i % 6],
    tempMax: 20 + i,
    tempMin: 10 + i,
    apparentHigh: 18 + i,
    apparentLow: 8 + i,
    precipProbability: 10 * i,
    windMax: 2 + i,
    cloudCover: 5 * i,
    uvIndex: i,
    sunrise: i === 0 ? TODAY_SUNRISE : null,
    sunset: i === 0 ? TODAY_SUNSET : null,
  }));
  const hourly = Array.from({ length: 49 }, (_, i) => ({
    time: `${isoDay(0)}T${String(i % 24).padStart(2, "0")}:00`,
    temperature: 12 + (i % 10),
  }));
  return { forecast: { days, hourly } };
}

function forecastResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errorResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ error: "failed" }),
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  locationRef.current = null;
  fetchMock = vi.fn(async () => forecastResponse(makeForecast()));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

// A consumer that mirrors the live snapshot into a ref so a test can read the
// CURRENT context value after each act() flush (used for the cross-slice publish).
// `useWeather` is injected (already imported by the caller) so the probe is a plain
// synchronous component — no async-component shenanigans.
type UseWeather = typeof import("@/components/providers/WeatherProvider")["useWeather"];
function makeSnapshotProbe(useWeather: UseWeather) {
  const seen: { current: unknown } = { current: undefined };
  function Probe() {
    const { weather } = useWeather();
    seen.current = weather;
    return null;
  }
  return { seen, Probe };
}

describe("useWeather — safe not-loaded default OUTSIDE a provider (D1)", () => {
  it("returns the not-loaded default and a callable publish when used without a provider", async () => {
    const { useWeather } = await import("@/components/providers/WeatherProvider");
    const { result } = renderHook(() => useWeather());
    expect(result.current.weather).toEqual(NOT_LOADED);
    // publish exists and is callable (a no-op outside a provider — never throws).
    expect(typeof result.current.publish).toBe("function");
    expect(() => result.current.publish(NOT_LOADED)).not.toThrow();
  });
});

describe("WeatherProvider — initial value + publish updates consumers (D1)", () => {
  it("exposes the not-loaded default as the INITIAL snapshot inside a fresh provider", async () => {
    const { WeatherProvider, useWeather } = await import(
      "@/components/providers/WeatherProvider"
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WeatherProvider>{children}</WeatherProvider>
    );
    const { result } = renderHook(() => useWeather(), { wrapper });
    expect(result.current.weather).toEqual(NOT_LOADED);
  });

  it("publish(next) updates the snapshot every consumer reads", async () => {
    const { WeatherProvider, useWeather } = await import(
      "@/components/providers/WeatherProvider"
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WeatherProvider>{children}</WeatherProvider>
    );
    const { result } = renderHook(() => useWeather(), { wrapper });

    const published = {
      todayCategory: "snow" as const,
      sunrise: TODAY_SUNRISE,
      sunset: TODAY_SUNSET,
      isLoaded: true,
    };
    act(() => {
      result.current.publish(published);
    });
    expect(result.current.weather).toEqual(published);
    expect(result.current.weather.isLoaded).toBe(true);
    expect(result.current.weather.todayCategory).toBe("snow");
  });

  it("a later publish REPLACES the prior snapshot (latest-wins relay, no merge)", async () => {
    const { WeatherProvider, useWeather } = await import(
      "@/components/providers/WeatherProvider"
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WeatherProvider>{children}</WeatherProvider>
    );
    const { result } = renderHook(() => useWeather(), { wrapper });

    act(() => {
      result.current.publish({
        todayCategory: "rain",
        sunrise: TODAY_SUNRISE,
        sunset: TODAY_SUNSET,
        isLoaded: true,
      });
    });
    act(() => {
      result.current.publish(NOT_LOADED);
    });
    expect(result.current.weather).toEqual(NOT_LOADED);
  });
});

describe("ForecastSection PUBLISHES into WeatherContext (cross-slice, D1)", () => {
  // Render the REAL ForecastSection inside the REAL WeatherProvider, with a probe
  // consumer reading the live snapshot. On a successful load the snapshot must carry
  // today's category + sun times; on no-location / error it stays the not-loaded
  // default. This is the additive cross-slice integration.
  async function renderSectionWithProvider() {
    const { WeatherProvider, useWeather } = await import(
      "@/components/providers/WeatherProvider"
    );
    const { ForecastSection } = await import(
      "@/components/forecast/ForecastSection"
    );
    const { seen, Probe } = makeSnapshotProbe(useWeather);
    let utils!: ReturnType<typeof render>;
    await act(async () => {
      utils = render(
        <WeatherProvider>
          <ForecastSection />
          <Probe />
        </WeatherProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return { seen, utils };
  }

  it("publishes { todayCategory: 'rain', sunrise, sunset, isLoaded: true } after a successful forecast load", async () => {
    locationRef.current = KYIV;
    const { seen } = await renderSectionWithProvider();

    const snapshot = seen.current as {
      todayCategory: unknown;
      sunrise: unknown;
      sunset: unknown;
      isLoaded: unknown;
    };
    // days[0].weatherCode === 61 → describeWeather → category "rain".
    expect(snapshot.todayCategory).toBe("rain");
    expect(snapshot.sunrise).toBe(TODAY_SUNRISE);
    expect(snapshot.sunset).toBe(TODAY_SUNSET);
    expect(snapshot.isLoaded).toBe(true);
  });

  it("publishes the NOT-LOADED default when there is no active location", async () => {
    locationRef.current = null; // no location → no fetch
    const { seen } = await renderSectionWithProvider();
    expect(fetchMock, "no location must mean no fetch").not.toHaveBeenCalled();
    expect(seen.current).toEqual(NOT_LOADED);
  });

  it("publishes the NOT-LOADED default when the forecast fetch fails (typed error)", async () => {
    fetchMock.mockResolvedValue(errorResponse());
    locationRef.current = KYIV;
    const { seen } = await renderSectionWithProvider();
    expect(seen.current).toEqual(NOT_LOADED);
  });

  it("publishes the NOT-LOADED default when the forecast fetch THROWS (network error)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    locationRef.current = KYIV;
    const { seen } = await renderSectionWithProvider();
    expect(seen.current).toEqual(NOT_LOADED);
  });
});
