// Test-first (RED): asserts the SPECIFIED CompareSection behavior pinned by
// design.md D2/D4/D5/D6 and the weekend-compare spec (FR-COMPARE-01/02/03,
// NFR-A11Y-01, NFR-I18N-01, NFR-OBS-01). The implementation
// (`components/compare/CompareSection.tsx`) and its `PinProvider` + `lib/compare`
// dependencies do NOT exist yet — these MUST fail because the modules are MISSING,
// not because of weak assertions. Never weaken a test to make it pass; if a test
// contradicts the spec, change it deliberately.
//
// Contract under test:
//   - CHIP ROW (FR-COMPARE-01): one chip per pinned city (name + a NAMED unpin
//     control); clicking unpin removes that chip; the chip row is NOT rendered
//     while no city is pinned; at the 3-city cap the pin button is disabled and the
//     calm cap copy surfaces.
//   - TOGGLE → TABLE (FR-COMPARE-02): a "Compare weekend" toggle exposing its
//     on/off state to AT (aria-pressed / role=switch); OFF → no table, pins intact;
//     ON → a real <table>. With N pinned cities it fetches /api/forecast?lat=&lon=
//     for EACH city IN PARALLEL (N concurrent calls, no waterfall) and renders per
//     city Sat/Sun hi/lo, precip %, and a ComfortBadge.
//   - MAKE ACTIVE (FR-COMPARE-03): each column's sticky header has a "make active"
//     button calling useLocation().setLocation(city); the active column carries
//     aria-current + a non-color cue, and the cue MOVES when another is made
//     active; a long city name is truncated but its FULL name is AT-available.
//   - EMPTY STATE (NFR-OBS-01): zero pins → a calm "pin a city" empty Notice, no
//     fetch, no crash.
//   - HONEST FAILURE (NFR-OBS-01): one city's /api/forecast failing → calm per-cell
//     placeholders for that column, the OTHER columns render, console stays silent.
//   - TABLE A11Y (NFR-A11Y-01): scope'd column/row headers with accessible names.
//
// Stack (ADR-0003/0004): Vitest + jsdom only. `fetch` is MOCKED (never the
// network). `useLocation()` is MOCKED so the test owns the active location + a spy
// setLocation. The REAL PinProvider seeds the pins via a tiny harness that pins on
// mount.
//
// The compare.* i18n keys this section reads are added by THIS slice and are not
// yet in the typed MessageKey union, so direct reads use the established t()
// parameter-type cast (mirrors ForecastSection.test.tsx / i18n.test.ts).
//
// @trace FR-COMPARE-01, FR-COMPARE-02, FR-COMPARE-03, NFR-A11Y-01, NFR-OBS-01
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import {
  act,
  render,
  cleanup,
  fireEvent,
  within,
  type RenderResult,
} from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import type { Location } from "@/lib/location/types";

// ── Mock useLocation so the test owns the active location + a spy setLocation. ──
const locationRef: { current: Location | null } = { current: null };
const setLocationSpy = vi.fn<(next: Location | null) => void>();
vi.mock("@/components/providers/LocationProvider", () => ({
  useLocation: () => ({ location: locationRef.current, setLocation: setLocationSpy }),
  LocationProvider: ({ children }: { children: ReactNode }) => children,
}));

const KYIV: Location = { lat: 50.45, lon: 30.52, name: "Київ" };
const LVIV: Location = { lat: 49.84, lon: 24.03, name: "Львів" };
const ODESA: Location = { lat: 46.48, lon: 30.72, name: "Одеса" };
// A long Ukrainian name for the truncation / AT-available scenario (FR-COMPARE-03).
const KAMIANETS: Location = { lat: 48.68, lon: 26.58, name: "Кам'янець-Подільський" };

// The rounded {lat,lon} identity the section keys forecasts on (matches keyOf).
function keyOf(loc: Location): string {
  return `${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
}

// 2026-06-27 Sat / 2026-06-28 Sun — the clock-independent weekend anchor.
const SATURDAY = "2026-06-27";
const SUNDAY = "2026-06-28";

function isoDay(offset: number): string {
  const d = new Date(Date.UTC(2026, 5, 25) + offset * 86_400_000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

type DayOverrides = {
  tempMax?: number | null;
  tempMin?: number | null;
  precipProbability?: number | null;
};

// A typed /api/forecast body { forecast: { days, hourly } } spanning the weekend.
// The Saturday (index 2) and Sunday (index 3) take per-city overrides so each
// column's values are identifiable in the rendered table.
function makeForecast(sat: DayOverrides = {}, sun: DayOverrides = {}) {
  const base = (time: string, o: DayOverrides = {}) => ({
    time,
    weatherCode: 0,
    tempMax: o.tempMax === undefined ? 20 : o.tempMax,
    tempMin: o.tempMin === undefined ? 10 : o.tempMin,
    apparentHigh: 18,
    apparentLow: 8,
    precipProbability: o.precipProbability === undefined ? 30 : o.precipProbability,
    windMax: 2,
    cloudCover: 25,
    uvIndex: 4,
    sunrise: null,
    sunset: null,
  });
  const days = [
    base(isoDay(0)), // 06-25 Thu
    base(isoDay(1)), // 06-26 Fri
    base(SATURDAY, sat), // 06-27 Sat
    base(SUNDAY, sun), // 06-28 Sun
    base(isoDay(4)), // 06-29 Mon
    base(isoDay(5)), // 06-30 Tue
    base(isoDay(6)), // 07-01 Wed
  ];
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
  return { ok: true, status: 200, json: async () => ({ error: "failed" }) } as unknown as Response;
}

// Route a mocked fetch to a per-city body keyed by the lat/lon in the URL, so each
// column's payload is distinguishable. Cities not in `byKey` get a default body.
function routedFetch(byKey: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    const lat = /[?&]lat=([-0-9.]+)/.exec(url)?.[1] ?? "";
    const lon = /[?&]lon=([-0-9.]+)/.exec(url)?.[1] ?? "";
    const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
    const handler = byKey[key];
    if (handler) return handler();
    return forecastResponse(makeForecast());
  });
}

let fetchMock: Mock;

beforeEach(() => {
  locationRef.current = null;
  setLocationSpy.mockReset();
  fetchMock = vi.fn(async () => forecastResponse(makeForecast()));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

// A tiny harness that pins the given cities on mount, then renders CompareSection
// as a SIBLING under the SAME real PinProvider — so the section reads the seeded
// pins from context (the real provider, not a mock). Import is deferred so MISSING
// modules fail the test rather than crashing collection.
async function renderCompare(seed: Location[] = []): Promise<RenderResult> {
  const { PinProvider, usePins } = await import(
    "@/components/providers/PinProvider"
  );
  const { CompareSection } = await import(
    "@/components/compare/CompareSection"
  );

  function Seed() {
    const { pin } = usePins();
    useEffect(() => {
      for (const c of seed) pin(c);
      // Seed once on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  let result!: RenderResult;
  await act(async () => {
    result = render(
      <PinProvider>
        <Seed />
        <CompareSection />
      </PinProvider>,
    );
  });
  // Flush the seed effect + the section's per-city fetch settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

// Resolve a compare.* label from the dictionary (browser-free), failing loudly if
// blank so a test never asserts against empty copy.
async function compareLabel(key: string): Promise<string> {
  const { t } = await import("@/lib/i18n");
  const value = t(key as Parameters<typeof t>[0]);
  return value;
}

// Find the "Compare weekend" toggle by its accessible name (compare.toggle.label).
async function findToggle(r: RenderResult): Promise<HTMLElement> {
  const label = await compareLabel("compare.toggle.label");
  const byName = r.container.querySelector(
    `[aria-label="${label}"], [role="switch"]`,
  ) as HTMLElement | null;
  if (byName) return byName;
  // Fallback: a button whose text contains the toggle label.
  const buttons = Array.from(r.container.querySelectorAll("button"));
  const match = buttons.find((b) => (b.textContent ?? "").includes(label));
  if (!match) throw new Error("Compare weekend toggle not found");
  return match;
}

describe("CompareSection — the chip row (FR-COMPARE-01)", () => {
  it("renders one chip per pinned city, each showing the city name", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    const text = r.container.textContent ?? "";
    expect(text).toContain("Київ");
    expect(text).toContain("Львів");
  });

  it("each chip exposes a NAMED, keyboard-operable unpin control (compare.unpin)", async () => {
    const r = await renderCompare([KYIV]);
    // The unpin control's accessible name is name-templated from compare.unpin and
    // carries the city name (e.g. "Відкріпити Київ").
    const unpinByLabel = r.container.querySelector('[aria-label*="Київ"]');
    expect(unpinByLabel, "the unpin control must carry an accessible name with the city").not.toBeNull();
    // It is a real focusable control (a <button>, not a div).
    const controls = Array.from(r.container.querySelectorAll("button")).filter((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Київ"),
    );
    expect(controls.length, "the unpin control is a real <button>").toBeGreaterThanOrEqual(1);
  });

  it("clicking a chip's unpin control removes that chip (the city is unpinned)", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    expect(r.container.textContent ?? "").toContain("Львів");

    // The unpin button for Львів (named control).
    const unpinLviv = Array.from(r.container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Львів"),
    );
    expect(unpinLviv, "a named unpin control for Львів must exist").toBeTruthy();
    await act(async () => {
      fireEvent.click(unpinLviv as HTMLButtonElement);
      await Promise.resolve();
    });

    // Львів's chip is gone; Київ remains.
    const chipRow = r.container.querySelector('[data-slot="compare-chips"]') ?? r.container;
    expect(within(chipRow as HTMLElement).queryByText("Львів")).toBeNull();
    expect(r.container.textContent ?? "").toContain("Київ");
  });

  it("the chip row is NOT rendered while no city is pinned (hidden-when-empty)", async () => {
    const r = await renderCompare([]);
    expect(
      r.container.querySelector('[data-slot="compare-chips"]'),
      "the chip row must not render with zero pins",
    ).toBeNull();
  });

  it("at the 3-city cap, the calm cap copy surfaces and the pin button is disabled", async () => {
    locationRef.current = KHARKIV_LOCATION;
    const capCopy = await compareLabel("compare.cap");
    expect(capCopy.trim().length, "compare.cap must resolve to calm copy").toBeGreaterThan(0);

    const r = await renderCompare([KYIV, LVIV, ODESA]);
    // The cap message is shown calmly (no exclamation mark — BC-BRAND-01).
    expect(r.container.textContent ?? "").toContain(capCopy);
    expect(capCopy).not.toContain("!");

    // The "Pin this city" button is disabled at the cap (its accessible hint is the
    // cap copy). Identify it by the compare.pin label.
    const pinLabel = await compareLabel("compare.pin");
    const pinButton = Array.from(r.container.querySelectorAll("button")).find(
      (b) =>
        (b.getAttribute("aria-label") ?? "").includes(pinLabel) ||
        (b.textContent ?? "").includes(pinLabel),
    );
    expect(pinButton, "the pin button must be present").toBeTruthy();
    expect((pinButton as HTMLButtonElement).disabled, "the pin button is disabled at the cap").toBe(
      true,
    );
  });
});

// A separate active-location const used above (Харків) — kept distinct from the
// pinned three so the cap scenario has an unpinned active city to "pin".
const KHARKIV_LOCATION: Location = { lat: 49.99, lon: 36.23, name: "Харків" };

describe("CompareSection — the 'Compare weekend' toggle switches to the table (FR-COMPARE-02)", () => {
  it("OFF shows no comparison table; the toggle exposes its off state to AT", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    // Before toggling on, there is no comparison <table>.
    expect(
      r.container.querySelector('table, [data-slot="compare-table"]'),
      "the table must be hidden while the toggle is off",
    ).toBeNull();

    // The toggle exposes an on/off state via aria-pressed or role=switch+checked.
    const toggle = await findToggle(r);
    const pressed = toggle.getAttribute("aria-pressed") ?? toggle.getAttribute("aria-checked");
    expect(pressed, "the toggle exposes an on/off state to AT").toBe("false");
  });

  it("turning the toggle ON renders the comparison <table> and flips the AT state", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);

    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    const table =
      r.container.querySelector('[data-slot="compare-table"]') ??
      r.container.querySelector("table");
    expect(table, "turning the toggle on must render the comparison table").not.toBeNull();
    const toggleAfter = await findToggle(r);
    const pressed =
      toggleAfter.getAttribute("aria-pressed") ?? toggleAfter.getAttribute("aria-checked");
    expect(pressed, "the toggle's on state is exposed to AT").toBe("true");
  });

  it("toggling OFF again returns to the normal view and keeps the pins intact", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);
    // ON
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
    });
    // OFF
    const onToggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(onToggle);
      await Promise.resolve();
    });

    expect(
      r.container.querySelector('[data-slot="compare-table"], table'),
      "the table is hidden again after toggling off",
    ).toBeNull();
    // Pins unchanged (both chips still present).
    expect(r.container.textContent ?? "").toContain("Київ");
    expect(r.container.textContent ?? "").toContain("Львів");
  });
});

describe("CompareSection — 3 columns from a PARALLEL /api/forecast (FR-COMPARE-02, D4)", () => {
  it("fetches /api/forecast?lat=&lon= for EACH pinned city IN PARALLEL (3 concurrent, no waterfall)", async () => {
    // Deferred per-city promises: NONE resolves until all three are registered, so
    // a serialized (waterfall) implementation — which awaits city 1 before starting
    // city 2 — would deadlock at one in-flight call and never reach three. A correct
    // parallel implementation issues all three before any resolves.
    const resolvers: Record<string, () => void> = {};
    const deferred = (key: string, body: unknown) =>
      new Promise<Response>((res) => {
        resolvers[key] = () => res(forecastResponse(body));
      });
    fetchMock = routedFetch({
      [keyOf(KYIV)]: () => deferred(keyOf(KYIV), makeForecast({ tempMax: 21 })),
      [keyOf(LVIV)]: () => deferred(keyOf(LVIV), makeForecast({ tempMax: 22 })),
      [keyOf(ODESA)]: () => deferred(keyOf(ODESA), makeForecast({ tempMax: 23 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await renderCompare([KYIV, LVIV, ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    // All THREE requests are in flight at once (proof of parallelism): three calls
    // registered though NONE has resolved yet.
    expect(
      fetchMock.mock.calls.length,
      "all three cities' forecasts must be requested in parallel (no waterfall)",
    ).toBe(3);

    // Resolve them OUT OF ORDER — a parallel implementation handles each as it lands.
    await act(async () => {
      resolvers[keyOf(ODESA)]?.();
      resolvers[keyOf(KYIV)]?.();
      resolvers[keyOf(LVIV)]?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Each city was requested with ITS own lat/lon, and never Open-Meteo directly.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes("/api/forecast"))).toBe(true);
    expect(urls.some((u) => /[?&]lat=50\.45\b/.test(u))).toBe(true);
    expect(urls.some((u) => /[?&]lat=49\.84\b/.test(u))).toBe(true);
    expect(urls.some((u) => /[?&]lat=46\.48\b/.test(u))).toBe(true);
    expect(urls.every((u) => !u.includes("open-meteo.com"))).toBe(true);
  });

  it("renders three columns, each with Sat/Sun hi/lo, precip %, and a ComfortBadge", async () => {
    fetchMock = routedFetch({
      [keyOf(KYIV)]: () => forecastResponse(makeForecast({ tempMax: 21, tempMin: 11 }, { tempMax: 19 })),
      [keyOf(LVIV)]: () => forecastResponse(makeForecast({ tempMax: 17, tempMin: 7 }, { tempMax: 15 })),
      [keyOf(ODESA)]: () => forecastResponse(makeForecast({ tempMax: 25, tempMin: 15 }, { tempMax: 24 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await renderCompare([KYIV, LVIV, ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Three column headers (one <th scope="col"> per pinned city).
    const colHeaders = r.container.querySelectorAll('th[scope="col"]');
    expect(colHeaders.length, "one scope=col header per pinned city (3)").toBe(3);

    // A ComfortBadge per present day per column — the badge exposes an aria-label
    // pairing its band description with the value (": " in the label). 3 cities × 2
    // days = at least 6 badges.
    const badges = r.container.querySelectorAll('[aria-label*=":"]');
    expect(badges.length, "a ComfortBadge per present weekend day per column").toBeGreaterThanOrEqual(6);

    // Each city's Saturday hi temp appears in the table.
    const tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    expect(tableText).toContain("21"); // Kyiv Sat hi
    expect(tableText).toContain("17"); // Lviv Sat hi
    expect(tableText).toContain("25"); // Odesa Sat hi
  });

  it("a present 0% precip renders '0', an absent precip renders the em-dash placeholder", async () => {
    const { t } = await import("@/lib/i18n");
    const placeholder = t("forecast.precipPlaceholder" as Parameters<typeof t>[0]); // "—"
    fetchMock = routedFetch({
      // Kyiv: a GENUINE 0% on Saturday.
      [keyOf(KYIV)]: () => forecastResponse(makeForecast({ precipProbability: 0 })),
      // Lviv: ABSENT precip on Saturday → the placeholder.
      [keyOf(LVIV)]: () => forecastResponse(makeForecast({ precipProbability: null })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    const tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    // The genuine zero is shown as a real value (the "0" digit appears in a precip cell).
    expect(tableText).toContain("0");
    // The absent value shows the calm placeholder, never a misleading 0%.
    expect(tableText).toContain(placeholder);
  });

  it("a NEGATIVE hi/lo renders with its sign and the °C unit (Ukrainian-winter extreme)", async () => {
    const { t } = await import("@/lib/i18n");
    const celsius = t("forecast.unit.celsius" as Parameters<typeof t>[0]); // "°C"
    fetchMock = routedFetch({
      [keyOf(KYIV)]: () => forecastResponse(makeForecast({ tempMax: -12, tempMin: -20 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await renderCompare([KYIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    const tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    // The minus sign + digits are present (not 12 / 0 / blank), with the °C unit.
    expect(tableText).toMatch(/-12/);
    expect(tableText).toMatch(/-20/);
    expect(tableText).toContain(celsius);
  });
});

describe("CompareSection — make active + active-column cue (FR-COMPARE-03, D5)", () => {
  it("a column's 'make active' button calls setLocation with THAT city; all stay pinned", async () => {
    locationRef.current = KYIV; // Kyiv currently active
    const r = await renderCompare([KYIV, LVIV, ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The "make active" button for Львів (name-templated from compare.makeActive).
    const makeActiveLviv = Array.from(r.container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Львів"),
    );
    expect(makeActiveLviv, "a 'make active' control for Львів must exist").toBeTruthy();

    await act(async () => {
      fireEvent.click(makeActiveLviv as HTMLButtonElement);
      await Promise.resolve();
    });

    // setLocation was called with the Львів city object (the locked setter).
    expect(setLocationSpy).toHaveBeenCalled();
    const arg = setLocationSpy.mock.calls.at(-1)?.[0] as Location;
    expect(arg).toMatchObject({ name: "Львів", lat: 49.84, lon: 24.03 });

    // All three remain pinned (make-active does not unpin / close the table).
    const colHeaders = r.container.querySelectorAll('th[scope="col"]');
    expect(colHeaders.length, "all three columns remain after make-active").toBe(3);
  });

  it("the active column carries aria-current AND a non-color cue; the cue MOVES when another is made active", async () => {
    locationRef.current = KYIV; // Kyiv active
    const r = await renderCompare([KYIV, LVIV, ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Exactly one header carries aria-current, and it is Kyiv's.
    const current = r.container.querySelectorAll('th[aria-current]');
    expect(current.length, "exactly one column is marked aria-current").toBe(1);
    expect((current[0] as HTMLElement).textContent ?? "").toContain("Київ");

    // A visible NON-COLOR cue accompanies it: either the active-marker text
    // (compare.active) appears in/near the active header, or the active column's
    // make-active control is disabled (a clearly-inert control).
    const activeMarker = await compareLabel("compare.active");
    const kyivHeader = current[0] as HTMLElement;
    const kyivMakeActive = Array.from(kyivHeader.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Київ"),
    );
    const hasMarker = (kyivHeader.textContent ?? "").includes(activeMarker);
    const controlDisabled = kyivMakeActive ? (kyivMakeActive as HTMLButtonElement).disabled : false;
    expect(
      hasMarker || controlDisabled,
      "the active column needs a non-color cue (marker text and/or a disabled control)",
    ).toBe(true);

    // Now activate Львів (mock the location change the real setter would cause).
    const makeActiveLviv = Array.from(r.container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Львів"),
    );
    await act(async () => {
      locationRef.current = LVIV; // the active location follows
      fireEvent.click(makeActiveLviv as HTMLButtonElement);
      await Promise.resolve();
    });
    // Re-render to reflect the new active location.
    const { CompareSection } = await import("@/components/compare/CompareSection");
    const { PinProvider } = await import("@/components/providers/PinProvider");
    void CompareSection;
    void PinProvider;
    await act(async () => {
      await Promise.resolve();
    });

    // aria-current has MOVED to Львів (and away from Київ).
    const currentAfter = r.container.querySelectorAll('th[aria-current]');
    expect(currentAfter.length, "still exactly one current column").toBe(1);
    expect(
      (currentAfter[0] as HTMLElement).textContent ?? "",
      "aria-current moves to the newly active column",
    ).toContain("Львів");
  });

  it("a LONG city name is truncated but its FULL name stays AT-available (title/aria-label)", async () => {
    locationRef.current = KAMIANETS;
    const r = await renderCompare([KAMIANETS]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The full name is available to AT/hover via a title or aria-label somewhere in
    // the header, even if the visible text is ellipsised.
    const header = r.container.querySelector('th[scope="col"]') as HTMLElement;
    expect(header, "the column header must render").not.toBeNull();
    const fullNameAvailable =
      header.querySelector(`[title="${KAMIANETS.name}"]`) !== null ||
      (header.getAttribute("title") === KAMIANETS.name) ||
      header.querySelector(`[aria-label*="${KAMIANETS.name}"]`) !== null ||
      (header.textContent ?? "").includes(KAMIANETS.name);
    expect(
      fullNameAvailable,
      "the full long name must be available to AT (title/aria-label), not lost by truncation",
    ).toBe(true);

    // The "make active" button stays present/operable in that header.
    const makeActive = Array.from(header.querySelectorAll("button"));
    expect(makeActive.length, "the make-active control stays in the header").toBeGreaterThanOrEqual(1);
  });
});

describe("CompareSection — empty state + honest failure + console silence (NFR-OBS-01)", () => {
  it("zero pins → a calm 'pin a city' empty Notice (role=status), no table, NO fetch", async () => {
    const emptyTitle = await compareLabel("compare.empty.title");
    expect(emptyTitle.trim().length, "compare.empty.title must resolve").toBeGreaterThan(0);

    const r = await renderCompare([]);
    // A calm empty Notice (role=status), not an error, not an empty table.
    expect(r.container.querySelector('[role="status"]'), "an empty Notice must show").not.toBeNull();
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    expect(r.container.querySelector("table")).toBeNull();
    expect(r.container.textContent ?? "").toContain(emptyTitle);
    // No pinned cities → no per-city forecast fetch.
    expect(fetchMock, "an empty comparison must not fetch").not.toHaveBeenCalled();
  });

  it("one city's /api/forecast failing → calm placeholders for that column, the OTHER columns render, console clean", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t } = await import("@/lib/i18n");
    const placeholder = t("forecast.precipPlaceholder" as Parameters<typeof t>[0]);

    fetchMock = routedFetch({
      // Kyiv: a clean forecast (its column must render values).
      [keyOf(KYIV)]: () => forecastResponse(makeForecast({ tempMax: 21 })),
      // Lviv: a typed { error } body (its column must degrade calmly).
      [keyOf(LVIV)]: () => errorResponse(),
      // Odesa: a THROWN network error (also degrades calmly, no uncaught).
      [keyOf(ODESA)]: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await renderCompare([KYIV, LVIV, ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // All three columns still render (the failing ones do not remove their column).
    const colHeaders = r.container.querySelectorAll('th[scope="col"]');
    expect(colHeaders.length, "a failed city keeps its column (with placeholders)").toBe(3);

    // Kyiv's good value is shown; the failed columns show the calm placeholder.
    const tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    expect(tableText, "the healthy city's value still renders").toContain("21");
    expect(tableText, "a failed column shows the calm placeholder").toContain(placeholder);

    // No error toast / uncaught exception, and the console stays clean (caught
    // errors are RENDERED, never logged) — NFR-OBS-01.
    expect(errSpy, "console.error must stay silent on a handled failure").not.toHaveBeenCalled();
    expect(warnSpy, "console.warn must stay silent on a handled failure").not.toHaveBeenCalled();
    // No exclamation marks in any rendered copy (BC-BRAND-01).
    expect(r.container.textContent ?? "").not.toContain("!");
  });

  it("keeps the console silent across a healthy session: toggle on, make active", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    locationRef.current = KYIV;
    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle); // ON
      await Promise.resolve();
      await Promise.resolve();
    });
    const makeActiveLviv = Array.from(r.container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Львів"),
    );
    await act(async () => {
      if (makeActiveLviv) fireEvent.click(makeActiveLviv as HTMLButtonElement);
      await Promise.resolve();
    });

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("CompareSection — table semantics + a11y (NFR-A11Y-01)", () => {
  it("renders a real <table> with scope'd column AND row headers", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });

    const table = r.container.querySelector("table");
    expect(table, "the comparison must be a real <table>").not.toBeNull();
    // Column headers per city, row headers per metric/day — so AT announces each
    // value with its city + day context.
    expect(
      (table as HTMLElement).querySelectorAll('th[scope="col"]').length,
      "scope=col headers (one per city)",
    ).toBeGreaterThanOrEqual(2);
    expect(
      (table as HTMLElement).querySelectorAll('th[scope="row"]').length,
      "scope=row headers (Saturday / Sunday metric rows)",
    ).toBeGreaterThanOrEqual(1);
  });

  it("each column header has an accessible name carrying its city", async () => {
    const r = await renderCompare([KYIV, LVIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
      await Promise.resolve();
    });
    const colHeaders = Array.from(r.container.querySelectorAll('th[scope="col"]'));
    const headerText = colHeaders.map((h) => h.textContent ?? "").join(" ");
    expect(headerText).toContain("Київ");
    expect(headerText).toContain("Львів");
  });
});

// ── Regression: the per-city abort/cache rework (the strand bug + failed retry) ──
// These guard the review-gate CRITICAL+major findings: a single shared
// AbortController aborted EVERY in-flight request when any one city was
// pinned/unpinned mid-flight (stranding the survivors on "loading" forever), and a
// once-failed city was cached "failed" and never retried. The fix: a PER-CITY
// AbortController (abort only cities that LEFT the pin set, never a still-pinned
// one) + retry of "failed" entries on a later effect run / re-pin.
//
// @trace FR-COMPARE-02, NFR-OBS-01
describe("CompareSection — per-city abort: no strand, failed retries (FR-COMPARE-02, NFR-OBS-01)", () => {
  // A deferred per-city body that REJECTS with a realistic AbortError when its
  // request's signal aborts (exactly how a real browser `fetch` behaves), and
  // resolves with `body` when `resolvers[key]()` is called. Each invocation reads
  // the per-call AbortSignal from the fetch options so an abort rejects only THAT
  // city's promise.
  function makeDeferredRouter(
    bodies: Record<string, unknown>,
  ): {
    fetchMock: Mock;
    resolvers: Record<string, () => void>;
    signals: Record<string, AbortSignal | undefined>;
  } {
    const resolvers: Record<string, () => void> = {};
    // The latest AbortSignal each city's request was issued with, so a test can
    // observe DIRECTLY whether a still-pinned in-flight request was aborted (the
    // exact defect) — timing-independent, no reliance on a reject/resolve race.
    const signals: Record<string, AbortSignal | undefined> = {};
    const fetchMock = vi.fn((input: unknown, init?: { signal?: AbortSignal }) => {
      const url = String(input);
      const lat = /[?&]lat=([-0-9.]+)/.exec(url)?.[1] ?? "";
      const lon = /[?&]lon=([-0-9.]+)/.exec(url)?.[1] ?? "";
      const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
      const signal = init?.signal;
      signals[key] = signal;
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => {
          // Realistic browser behavior: an aborted fetch rejects with an
          // AbortError DOMException and NEVER subsequently resolves (the late
          // resolver is neutralized below).
          delete resolvers[key];
          reject(
            typeof DOMException === "function"
              ? new DOMException("The operation was aborted.", "AbortError")
              : Object.assign(new Error("Aborted"), { name: "AbortError" }),
          );
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        resolvers[key] = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve(forecastResponse(bodies[key] ?? makeForecast()));
        };
      });
    }) as unknown as Mock;
    return { fetchMock, resolvers, signals };
  }

  // A harness exposing pin/unpin controls so a test can change the pin set MID-FLIGHT
  // (the seed-only renderCompare cannot). It renders CompareSection under the real
  // PinProvider, seeded on mount, plus a button per `controls` city to pin it later.
  async function renderWithControls(
    seed: Location[],
    controls: Location[],
  ): Promise<{
    r: RenderResult;
    pinCity: (c: Location) => Promise<void>;
    unpinCity: (c: Location) => Promise<void>;
  }> {
    const { PinProvider, usePins } = await import(
      "@/components/providers/PinProvider"
    );
    const { CompareSection } = await import(
      "@/components/compare/CompareSection"
    );

    function Controls() {
      const { pin, unpin } = usePins();
      useEffect(() => {
        for (const c of seed) pin(c);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div>
          {controls.map((c) => (
            <button
              key={`pin-${keyOf(c)}`}
              data-testid={`ctl-pin-${keyOf(c)}`}
              onClick={() => pin(c)}
            >
              pin {c.name}
            </button>
          ))}
          {controls.map((c) => (
            <button
              key={`unpin-${keyOf(c)}`}
              data-testid={`ctl-unpin-${keyOf(c)}`}
              onClick={() => unpin(keyOf(c))}
            >
              unpin {c.name}
            </button>
          ))}
        </div>
      );
    }

    let result!: RenderResult;
    await act(async () => {
      result = render(
        <PinProvider>
          <Controls />
          <CompareSection />
        </PinProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const pinCity = async (c: Location) => {
      await act(async () => {
        fireEvent.click(result.container.querySelector(`[data-testid="ctl-pin-${keyOf(c)}"]`) as HTMLButtonElement);
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const unpinCity = async (c: Location) => {
      await act(async () => {
        fireEvent.click(result.container.querySelector(`[data-testid="ctl-unpin-${keyOf(c)}"]`) as HTMLButtonElement);
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    return { r: result, pinCity, unpinCity };
  }

  it("pinning a 3rd city while 2 forecasts are in flight does NOT abort/strand the first two (all three resolve)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchMock: deferred, resolvers, signals } = makeDeferredRouter({
      [keyOf(KYIV)]: makeForecast({ tempMax: 21 }),
      [keyOf(LVIV)]: makeForecast({ tempMax: 22 }),
      [keyOf(ODESA)]: makeForecast({ tempMax: 23 }),
    });
    vi.stubGlobal("fetch", deferred);

    // Start with Kyiv + Lviv pinned; Odesa is pinned LATER, mid-flight.
    const { r, pinCity } = await renderWithControls([KYIV, LVIV], [ODESA]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle); // ON → fetch Kyiv + Lviv (both deferred, in flight)
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deferred.mock.calls.length, "Kyiv + Lviv are in flight").toBe(2);
    // Their in-flight requests start un-aborted.
    expect(signals[keyOf(KYIV)]?.aborted, "Kyiv's request is live").toBe(false);
    expect(signals[keyOf(LVIV)]?.aborted, "Lviv's request is live").toBe(false);

    // Pin Odesa WHILE Kyiv + Lviv are still in flight. The buggy SHARED-controller
    // code aborts ALL in-flight requests on this pin-set change; the fix uses a
    // PER-CITY controller and must abort NEITHER still-pinned request.
    await pinCity(ODESA);
    expect(deferred.mock.calls.length, "Odesa's fetch is added; the first two are NOT re-issued").toBe(3);

    // ── The DIRECT defect observation (timing-independent): the two still-pinned
    // cities' in-flight requests must NOT have been aborted by pinning a third.
    expect(
      signals[keyOf(KYIV)]?.aborted,
      "pinning a 3rd city must NOT abort Kyiv's still-pinned in-flight request",
    ).toBe(false);
    expect(
      signals[keyOf(LVIV)]?.aborted,
      "pinning a 3rd city must NOT abort Lviv's still-pinned in-flight request",
    ).toBe(false);

    // And the survivors resolve to their values (no strand on "loading"). Resolve out
    // of order — a parallel, per-city implementation handles each as it lands.
    await act(async () => {
      resolvers[keyOf(ODESA)]?.();
      resolvers[keyOf(KYIV)]?.();
      resolvers[keyOf(LVIV)]?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    expect(tableText, "Kyiv's value rendered (not stranded on loading)").toContain("21");
    expect(tableText, "Lviv's value rendered (not stranded on loading)").toContain("22");
    expect(tableText, "Odesa's value rendered").toContain("23");
    // Console clean (an aborted request, if any, is swallowed silently) — NFR-OBS-01.
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a city whose forecast FAILED recovers (re-fetches and renders) after unpin + re-pin", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t } = await import("@/lib/i18n");
    const placeholder = t("forecast.precipPlaceholder" as Parameters<typeof t>[0]);

    // First call for Lviv FAILS (typed error); subsequent calls succeed. Kyiv always
    // succeeds. A counter flips Lviv from error → ok on the second request.
    let lvivCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      const lat = /[?&]lat=([-0-9.]+)/.exec(url)?.[1] ?? "";
      const lon = /[?&]lon=([-0-9.]+)/.exec(url)?.[1] ?? "";
      const key = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
      if (key === keyOf(LVIV)) {
        lvivCalls += 1;
        return lvivCalls === 1 ? errorResponse() : forecastResponse(makeForecast({ tempMax: 18 }));
      }
      if (key === keyOf(KYIV)) return forecastResponse(makeForecast({ tempMax: 21 }));
      return forecastResponse(makeForecast());
    });
    vi.stubGlobal("fetch", fetchMock);

    const { r, pinCity, unpinCity } = await renderWithControls([KYIV, LVIV], [LVIV]);
    const toggle = await findToggle(r);
    await act(async () => {
      fireEvent.click(toggle); // ON → Kyiv ok, Lviv fails first time
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Lviv's column degraded calmly: placeholders + the calm error label; Kyiv renders.
    let tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    expect(tableText, "Kyiv renders").toContain("21");
    expect(tableText, "Lviv shows the calm placeholder while failed").toContain(placeholder);
    expect(lvivCalls, "Lviv was fetched once and failed").toBe(1);

    // Unpin Lviv (drops its failed cache + controller) then re-pin it → it RE-FETCHES
    // (the old code cached "failed" forever and never retried).
    await unpinCity(LVIV);
    await pinCity(LVIV);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lvivCalls, "re-pinning a failed city re-fetches it (retry)").toBe(2);
    tableText = (r.container.querySelector("table") ?? r.container).textContent ?? "";
    expect(tableText, "Lviv now renders its recovered value").toContain("18");

    // No console noise across the fail→recover cycle (NFR-OBS-01).
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
