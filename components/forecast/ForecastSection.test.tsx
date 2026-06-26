// Test-first (RED): asserts the SPECIFIED ForecastSection behavior pinned by
// design.md D3/D4 and the forecast spec ("Render daily forecast cards",
// "Render a 48-hour hourly temperature line chart", "Show today's sunrise and
// sunset…", "Re-fetch on location change and cache last successful response in
// memory", "Degrade honestly when the forecast cannot load"). The implementation
// (`components/forecast/ForecastSection.tsx`) does NOT exist yet — these MUST fail
// because the component is MISSING, not because of weak assertions. Never weaken a
// test to make it pass; if it contradicts the spec, change it deliberately.
//
// Stack (ADR-0003/0004): Vitest + jsdom only. `fetch` is MOCKED (never the
// network). `useLocation()` is MOCKED so the active location can CHANGE between
// renders (driving the cache / latest-wins / no-location scenarios). The
// dynamically-imported Recharts chart is MOCKED via both `next/dynamic` and the
// `HourlyChart` module, so the section test never touches Recharts internals.
//
// The forecast.* i18n keys this section reads are added by THIS slice and are not
// yet in the typed MessageKey union, so any direct reads use the established t()
// parameter-type cast (mirrors i18n.test.ts / SearchBox.test.tsx).
//
// @trace FR-FORECAST-01, FR-FORECAST-02, FR-FORECAST-03, FR-FORECAST-04, FR-FORECAST-05, FR-COMFORT-04, FR-COMFORT-05, NFR-OBS-01
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, render, cleanup, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { Location } from "@/lib/location/types";

// ── Mock useLocation so the test owns the active location (and can change it). ──
const locationRef: { current: Location | null } = { current: null };
vi.mock("@/components/providers/LocationProvider", () => ({
  useLocation: () => ({ location: locationRef.current, setLocation: vi.fn() }),
  LocationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock the dynamically-imported Recharts chart. The section loads it via
// next/dynamic(() => import("./HourlyChart"), { ssr:false }); we replace BOTH the
// dynamic() factory (return the component synchronously) and the HourlyChart
// module, so no Recharts internals are needed and the chart's presence is a simple
// data-testid probe. ───────────────────────────────────────────────────────────
vi.mock("next/dynamic", () => ({
  // The real `dynamic(loader, opts)` is called with a loader + options; the mock
  // ignores both (extra args are harmless) and returns a synchronous stand-in.
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
const LVIV: Location = { lat: 49.84, lon: 24.03, name: "Львів" };

// ── A real-ish typed /api/forecast body: { forecast: { days, hourly } } — the
// INTERNAL contract the client consumes (never the raw Open-Meteo column shape).
function isoDay(offset: number): string {
  const d = new Date(Date.UTC(2026, 5, 27) + offset * 86_400_000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

function makeForecast(opts?: { days?: number; namePrefix?: string }) {
  const n = opts?.days ?? 7;
  const days = Array.from({ length: n }, (_, i) => ({
    time: isoDay(i),
    weatherCode: [0, 3, 61, 71, 95, 45, 80][i % 7],
    tempMax: 20 + i,
    tempMin: 10 + i,
    apparentHigh: 18 + i,
    apparentLow: 8 + i,
    precipProbability: 10 * i,
    windMax: 2 + i,
    cloudCover: 5 * i,
    uvIndex: i,
    sunrise: i === 0 ? `${isoDay(0)}T05:11` : null,
    sunset: i === 0 ? `${isoDay(0)}T21:47` : null,
  }));
  const hourly = Array.from({ length: 49 }, (_, i) => ({
    time: `${isoDay(0)}T${String(i % 24).padStart(2, "0")}:00`,
    temperature: 12 + (i % 10),
  }));
  return { forecast: { days, hourly } };
}

// A resolved /api/forecast Response stub.
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

// Render the section. Import is deferred so a MISSING module fails the test rather
// than crashing collection. The mocked LocationProvider is a pass-through.
async function renderSection(): Promise<RenderResult> {
  const { ForecastSection } = await import(
    "@/components/forecast/ForecastSection"
  );
  let result!: RenderResult;
  await act(async () => {
    result = render(<ForecastSection />);
  });
  // Flush the location-change effect's fetch + state settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

// Re-render the same tree to model a re-render WITHOUT a location change (cache
// hit) or AFTER mutating locationRef (a location change).
async function rerender(r: RenderResult): Promise<void> {
  const { ForecastSection } = await import(
    "@/components/forecast/ForecastSection"
  );
  await act(async () => {
    r.rerender(<ForecastSection />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

describe("ForecastSection — renders the full view for an active location (FR-FORECAST-02/03/04)", () => {
  it("fetches the INTERNAL /api/forecast?lat=&lon= route (never Open-Meteo directly)", async () => {
    locationRef.current = KYIV;
    await renderSection();
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/forecast");
    expect(calledUrl).toMatch(/[?&]lat=50\.45\b/);
    expect(calledUrl).toMatch(/[?&]lon=30\.52\b/);
    // The client must NOT know the upstream URL.
    expect(calledUrl).not.toContain("open-meteo.com");
  });

  it("renders exactly 7 DayCards, each with weekday, hi/lo, precip%, wind, and a ComfortBadge", async () => {
    locationRef.current = KYIV;
    const r = await renderSection();

    // Seven day cards. The card is identified by a stable data-slot (the section
    // owns the markup; the test pins the count, not the exact class names).
    const cards = r.container.querySelectorAll('[data-slot="day-card"]');
    expect(cards.length, "exactly 7 day cards must render for a 7-day forecast").toBe(7);

    // A comfort badge per card — the ComfortBadge exposes an aria-label naming the
    // band + value (NFR-A11Y-01); there is one per day card.
    const badges = r.container.querySelectorAll('[aria-label*=":"]');
    expect(badges.length, "each card must carry a ComfortBadge").toBeGreaterThanOrEqual(7);

    // The first card shows its rounded hi/lo and a wind value (display fields).
    const first = cards[0] as HTMLElement;
    const firstText = first.textContent ?? "";
    expect(firstText).toContain("20"); // tempMax index 0
    expect(firstText).toContain("10"); // tempMin index 0
    expect(/[Ѐ-ӿ]/.test(firstText), "weekday label must read as Ukrainian").toBe(true);
  });

  it("renders the WeekendHighlight at the TOP of the section, before the day grid (FR-COMFORT-05)", async () => {
    locationRef.current = KYIV;
    const r = await renderSection();

    const highlight = r.container.querySelector('[data-slot="weekend-highlight"]');
    const grid = r.container.querySelector('[data-slot="day-grid"]');
    expect(highlight, "the WeekendHighlight must render").not.toBeNull();
    expect(grid, "the day grid must render").not.toBeNull();
    // DOM order: the weekend highlight precedes the day grid (it is at the TOP).
    expect(
      (highlight as HTMLElement).compareDocumentPosition(grid as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      "the WeekendHighlight must come before the day grid",
    ).toBeTruthy();
  });

  it("renders the hourly chart region fed the hourly slice", async () => {
    locationRef.current = KYIV;
    const r = await renderSection();
    const chart = r.container.querySelector('[data-testid="hourly-chart"]');
    expect(chart, "the hourly chart region must render").not.toBeNull();
    // The chart is fed a non-empty hourly series (the next-48 h slice).
    expect(Number(chart?.getAttribute("data-points") ?? "0")).toBeGreaterThan(0);
  });

  it("renders today's sunrise AND sunset under the chart (FR-FORECAST-04)", async () => {
    const { t } = await import("@/lib/i18n");
    const sunriseLabel = t("forecast.sunrise" as Parameters<typeof t>[0]);
    const sunsetLabel = t("forecast.sunset" as Parameters<typeof t>[0]);
    expect(sunriseLabel.trim().length, "forecast.sunrise label must resolve").toBeGreaterThan(0);
    expect(sunsetLabel.trim().length, "forecast.sunset label must resolve").toBeGreaterThan(0);

    locationRef.current = KYIV;
    const r = await renderSection();
    const text = r.container.textContent ?? "";
    expect(text).toContain(sunriseLabel);
    expect(text).toContain(sunsetLabel);
  });

  it("carries an accessible region name (forecast.sectionLabel)", async () => {
    const { t } = await import("@/lib/i18n");
    const sectionLabel = t("forecast.sectionLabel" as Parameters<typeof t>[0]);
    expect(sectionLabel.trim().length, "forecast.sectionLabel must resolve").toBeGreaterThan(0);

    locationRef.current = KYIV;
    const r = await renderSection();
    const region = r.container.querySelector(`[aria-label="${sectionLabel}"]`);
    expect(region, "the section must expose forecast.sectionLabel as its accessible name").not.toBeNull();
  });
});

describe("ForecastSection — re-fetch on location change + in-memory location-tagged cache (FR-FORECAST-05)", () => {
  it("a NEW location triggers a re-fetch and the view shows the new location's forecast", async () => {
    // Distinct payloads so we can tell A's data from B's by content.
    fetchMock
      .mockResolvedValueOnce(forecastResponse(makeForecast())) // A (Kyiv): tempMax index0 = 20
      .mockResolvedValueOnce(
        forecastResponse({
          forecast: {
            ...makeForecast().forecast,
            days: makeForecast().forecast.days.map((d, i) => ({
              ...d,
              tempMax: 30 + i, // B (Lviv): tempMax index0 = 30
            })),
          },
        }),
      );

    locationRef.current = KYIV;
    const r = await renderSection();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCardA = r.container.querySelector('[data-slot="day-card"]') as HTMLElement;
    expect(firstCardA.textContent).toContain("20");

    // Change the active location → a second fetch fires and B's data renders.
    locationRef.current = LVIV;
    await rerender(r);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lastUrl = String(fetchMock.mock.calls[1][0]);
    expect(lastUrl).toMatch(/[?&]lat=49\.84\b/);
    const firstCardB = r.container.querySelector('[data-slot="day-card"]') as HTMLElement;
    expect(firstCardB.textContent).toContain("30"); // B stands
  });

  it("re-rendering WITHOUT a location change serves the cache (no second request)", async () => {
    locationRef.current = KYIV;
    const r = await renderSection();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same location → cache hit, NO new fetch.
    await rerender(r);
    await rerender(r);
    expect(fetchMock, "re-render without a location change must not refetch").toHaveBeenCalledTimes(1);
    // The forecast is still shown from the in-memory cache.
    expect(r.container.querySelectorAll('[data-slot="day-card"]').length).toBe(7);
  });

  it("a quick A→B→A switch where B resolves AFTER A is active again DISCARDS B (A stands)", async () => {
    // A resolves immediately; B is held pending; the second A resolves immediately.
    let resolveB!: (res: Response) => void;
    const pendingB = new Promise<Response>((res) => (resolveB = res));
    const aBody = forecastResponse(makeForecast()); // A: index0 tempMax 20
    const bBody = forecastResponse({
      forecast: {
        ...makeForecast().forecast,
        days: makeForecast().forecast.days.map((d, i) => ({ ...d, tempMax: 88 + i })),
      },
    });
    fetchMock
      .mockResolvedValueOnce(aBody) // A (first activation)
      .mockReturnValueOnce(pendingB) // B (slow, pending)
      .mockResolvedValueOnce(aBody); // A again (resolves before B)

    // Activate A.
    locationRef.current = KYIV;
    const r = await renderSection();
    // Switch to B (its request is in flight, unresolved).
    locationRef.current = LVIV;
    await rerender(r);
    // Switch back to A before B resolves.
    locationRef.current = KYIV;
    await rerender(r);

    // NOW B's slow response finally resolves — it must be DISCARDED (A is active).
    await act(async () => {
      resolveB(bBody);
      await Promise.resolve();
      await Promise.resolve();
    });

    // A's forecast stands; B's data is never shown under A. Use tempMax 88 as B's
    // sentinel — a value A never renders — so this can't false-positive on A's own
    // legitimate "30%" precip (the prior "30" sentinel collided with it).
    const firstCard = r.container.querySelector('[data-slot="day-card"]') as HTMLElement;
    expect(firstCard.textContent).toContain("20");
    expect(r.container.textContent ?? "").not.toContain("88");
  });

  it("switching to B whose fetch FAILS while A was cached shows B's error, NOT A's cache (no cross-location stale data)", async () => {
    fetchMock
      .mockResolvedValueOnce(forecastResponse(makeForecast())) // A succeeds + caches
      .mockResolvedValueOnce(errorResponse()); // B fails (typed error)

    locationRef.current = KYIV;
    const r = await renderSection();
    expect(r.container.querySelectorAll('[data-slot="day-card"]').length).toBe(7);

    // Switch to B; B's fetch resolves to the typed error.
    locationRef.current = LVIV;
    await rerender(r);

    // B shows the calm error Notice; A's cached cards are NOT shown under B.
    expect(r.container.querySelector('[role="alert"]'), "B's error Notice must show").not.toBeNull();
    expect(
      r.container.querySelectorAll('[data-slot="day-card"]').length,
      "A's cached cards must NOT be shown under B",
    ).toBe(0);
  });
});

describe("ForecastSection — no active location: a calm placeholder, no fetch (FR-FORECAST-05)", () => {
  it("renders the calm no-location Notice and makes NO request", async () => {
    const { t } = await import("@/lib/i18n");
    const noLocation = t("forecast.noLocation" as Parameters<typeof t>[0]);
    expect(noLocation.trim().length, "forecast.noLocation must resolve").toBeGreaterThan(0);

    locationRef.current = null;
    const r = await renderSection();

    expect(fetchMock, "no location must mean no fetch").not.toHaveBeenCalled();
    // A calm status placeholder (not the assertive error Notice), no day grid.
    expect(r.container.querySelector('[role="status"]')).not.toBeNull();
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    expect(r.container.querySelector('[data-slot="day-grid"]')).toBeNull();
    expect(r.container.textContent ?? "").toContain(noLocation);
  });

  it("does not crash and renders no day cards when there is no location", async () => {
    locationRef.current = null;
    const r = await renderSection();
    expect(r.container.querySelectorAll('[data-slot="day-card"]').length).toBe(0);
  });
});

describe("ForecastSection — honest degradation + console silence (NFR-OBS-01)", () => {
  it("a THROWN fetch (network error) shows the calm error Notice, no toast, console clean", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    locationRef.current = KYIV;
    const r = await renderSection();

    const alert = r.container.querySelector('[role="alert"]');
    expect(alert, "a network error must show the inline error Notice").not.toBeNull();
    expect(alert?.textContent ?? "").not.toContain("!"); // BC-BRAND-01
    // No day grid is rendered from a failed fetch (no partial data).
    expect(r.container.querySelector('[data-slot="day-grid"]')).toBeNull();
    // The component RENDERS the Notice instead of logging the caught error.
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a resolved { error: 'failed' } body shows the calm error Notice (not partial data)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(errorResponse());

    locationRef.current = KYIV;
    const r = await renderSection();

    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(r.container.querySelector('[data-slot="day-card"]')).toBeNull();
    // The body's `error` field is never rendered as content.
    expect(r.container.textContent ?? "").not.toContain("failed");
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a malformed-or-ZERO-day forecast ({ forecast: { days: [] } }) degrades to the error Notice", async () => {
    // The handler normally collapses zero-day to { error }, but the section must
    // ALSO not render an empty grid if a zero-day forecast ever reaches it.
    fetchMock.mockResolvedValue(
      forecastResponse({ forecast: { days: [], hourly: [] } }),
    );
    locationRef.current = KYIV;
    const r = await renderSection();
    // No empty grid is shown; a calm degraded state is shown instead.
    expect(r.container.querySelector('[data-slot="day-card"]')).toBeNull();
    const degraded =
      r.container.querySelector('[role="alert"]') ??
      r.container.querySelector('[role="status"]');
    expect(degraded, "a zero-day forecast must show a calm degraded state").not.toBeNull();
  });

  it("keeps the console silent on a HEALTHY render (successful fetch + cards + chart)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    locationRef.current = KYIV;
    const r = await renderSection();
    expect(within(r.container).queryAllByText(/[Ѐ-ӿ]/).length).toBeGreaterThan(0);
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
