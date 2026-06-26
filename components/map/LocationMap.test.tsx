// Test-first (RED): asserts the SPECIFIED map behavior pinned by design.md
// D3/D4/D5/D6 and the map spec (all six requirements). The implementation
// (`components/map/{LocationMap,LocationMapClient,MapSkeleton}.tsx`) does NOT
// exist yet — these MUST fail because the components are MISSING, not because of
// weak assertions. Never weaken a test to make it pass; if it contradicts the
// spec, change it deliberately.
//
// Stack (ADR-0003/0004, TC-STACK-05): Vitest + jsdom only — NO Playwright, NO DB.
// jsdom CANNOT run a real Leaflet DOM (no canvas/measurement/tiles), so
// `react-leaflet` is MOCKED with light stand-ins that RECORD their props and
// EXPOSE the captured `useMapEvents({ click })` handler, so the click ->
// normalize -> setLocation -> reverse-name logic is testable WITHOUT a browser.
// `useLocation()` is MOCKED (READ the active location + SPY `setLocation`).
// `fetch` is MOCKED for `/api/reverse-geocode` (never the network). A real-browser
// render (tiles, panning) is env-gated per ADR-0004 (chrome-devtools MCP).
//
// The map.* i18n keys this slice adds are not yet in the typed MessageKey union;
// they are read via the established t() parameter-type cast (mirrors
// i18n.test.ts / ForecastSection.test.tsx).
//
// @trace FR-MAP-01, FR-MAP-02, FR-MAP-03, FR-MAP-04, FR-MAP-05, NFR-OBS-01
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

// ── Mock useLocation so the test owns the active location AND can spy the
// setter (the map is the only slice that READS centre/marker AND WRITES on click). ─
const locationRef: { current: Location | null } = { current: null };
const setLocationSpy: Mock = vi.fn();
vi.mock("@/components/providers/LocationProvider", () => ({
  useLocation: () => ({ location: locationRef.current, setLocation: setLocationSpy }),
  LocationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Mock react-leaflet with light stand-ins. jsdom has no real Leaflet, so each
// stand-in records props onto a probe registry and renders plain DOM. The
// useMapEvents({ click }) handler is CAPTURED so the test can invoke a click with
// an arbitrary latlng (the only way to drive the click logic without a real map). ─
type LatLng = { lat: number; lng: number };
type ClickHandler = (e: { latlng: LatLng }) => void;

const leafletProbe: {
  mapContainerProps: Record<string, unknown> | null;
  tileLayerProps: Record<string, unknown> | null;
  markerProps: Array<Record<string, unknown>>;
  attributionProps: Record<string, unknown> | null;
  clickHandler: ClickHandler | null;
  setViewCalls: Array<{ center: unknown; zoom: unknown }>;
} = {
  mapContainerProps: null,
  tileLayerProps: null,
  markerProps: [],
  attributionProps: null,
  clickHandler: null,
  setViewCalls: [],
};

vi.mock("react-leaflet", () => {
  const React = require("react");
  return {
    MapContainer: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      leafletProbe.mapContainerProps = props;
      return React.createElement("div", { "data-testid": "map-container" }, props.children);
    },
    TileLayer: (props: Record<string, unknown>) => {
      leafletProbe.tileLayerProps = props;
      // The attribution is commonly carried on the TileLayer prop; surface its text
      // so the attribution assertion can find it whichever single source is used.
      return React.createElement("div", {
        "data-testid": "tile-layer",
        "data-url": typeof props.url === "string" ? props.url : "",
        "data-attribution": typeof props.attribution === "string" ? props.attribution : "",
      });
    },
    Marker: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      leafletProbe.markerProps.push(props);
      return React.createElement("div", { "data-testid": "marker" }, props.children);
    },
    Popup: (props: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "popup" }, props.children),
    AttributionControl: (props: Record<string, unknown>) => {
      leafletProbe.attributionProps = props;
      // Leaflet's AttributionControl injects "© OpenStreetMap contributors" from the
      // TileLayer; a faithful stand-in renders that prefix so the string is present.
      return React.createElement(
        "div",
        { "data-testid": "attribution", "data-position": String(props.position ?? "") },
        "© OpenStreetMap contributors",
      );
    },
    useMap: () => ({
      setView: (center: unknown, zoom: unknown) => {
        leafletProbe.setViewCalls.push({ center, zoom });
      },
    }),
    useMapEvents: (handlers: { click?: ClickHandler }) => {
      // Capture the click handler so the test can invoke it with any latlng.
      if (handlers?.click) leafletProbe.clickHandler = handlers.click;
      return {};
    },
  };
});

// The Leaflet CSS (`leaflet/dist/leaflet.css`, imported by the real client map)
// resolves on disk and is inert under Vitest (CSS is not processed), so it needs
// no mock. The L.Icon default-marker fix touches Leaflet internals jsdom lacks, so
// `leaflet` is mocked with a light stand-in below.
vi.mock("leaflet", () => {
  const Icon = function () {};
  (Icon as unknown as { Default: { prototype: Record<string, unknown>; mergeOptions: () => void } }).Default = {
    prototype: {},
    mergeOptions: () => {},
  };
  return {
    default: { Icon, icon: () => ({}), Marker: { prototype: {} } },
    Icon,
    icon: () => ({}),
  };
});

const KYIV: Location = { lat: 50.4501, lon: 30.5234, name: "Київ" };
const LVIV: Location = { lat: 49.8397, lon: 24.0297, name: "Львів" };

function resetProbe() {
  leafletProbe.mapContainerProps = null;
  leafletProbe.tileLayerProps = null;
  leafletProbe.markerProps = [];
  leafletProbe.attributionProps = null;
  leafletProbe.clickHandler = null;
  leafletProbe.setViewCalls = [];
}

// A resolved /api/reverse-geocode Response stub.
function reverseResponse(name: string | null): Response {
  return { ok: true, status: 200, json: async () => ({ name }) } as unknown as Response;
}

let fetchMock: Mock;

// Render the CLIENT map directly (the react-leaflet tree). Importing the planned
// module is deferred so a MISSING module fails the test rather than crashing
// collection. The dynamic(ssr:false) wrapper is exercised separately below.
async function renderClient(): Promise<RenderResult> {
  const mod = await import("@/components/map/LocationMapClient");
  const LocationMapClient = (mod.default ??
    (mod as Record<string, unknown>).LocationMapClient) as React.ComponentType;
  let result!: RenderResult;
  await act(async () => {
    result = render(<LocationMapClient />);
  });
  // Flush the click -> reverse-fetch -> name-upgrade effect chain.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

async function rerenderClient(r: RenderResult): Promise<void> {
  const mod = await import("@/components/map/LocationMapClient");
  const LocationMapClient = (mod.default ??
    (mod as Record<string, unknown>).LocationMapClient) as React.ComponentType;
  await act(async () => {
    r.rerender(<LocationMapClient />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Invoke the captured click handler (the only way to drive the click logic without
// a real Leaflet map) and flush the resulting async name-upgrade.
async function clickAt(lat: number, lng: number): Promise<void> {
  const handler = leafletProbe.clickHandler;
  if (!handler) throw new Error("no click handler was registered via useMapEvents");
  await act(async () => {
    handler({ latlng: { lat, lng } });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  locationRef.current = null;
  setLocationSpy.mockReset();
  resetProbe();
  fetchMock = vi.fn(async () => reverseResponse("Одеса"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ───────────────────────────── FR-MAP-05: client-only ─────────────────────────
describe("LocationMap wrapper — client-only dynamic(ssr:false) renders the MapSkeleton first (FR-MAP-05)", () => {
  it("renders the MapSkeleton (map.loading label) and NOT a synchronous Leaflet map", async () => {
    const { t } = await import("@/lib/i18n");
    const loadingLabel = t("map.loading" as Parameters<typeof t>[0]);
    expect(loadingLabel.trim().length, "map.loading must resolve to a non-empty i18n string").toBeGreaterThan(0);

    locationRef.current = KYIV;
    const { LocationMap } = await import("@/components/map/LocationMap");
    let result!: RenderResult;
    await act(async () => {
      result = render(<LocationMap />);
    });

    // Before the lazy client chunk resolves, the wrapper shows the skeleton holding
    // the layout — never a synchronously-rendered MapContainer.
    const skeleton = result.container.querySelector(`[aria-label="${loadingLabel}"]`);
    expect(
      skeleton,
      "the dynamic(ssr:false) wrapper must render the MapSkeleton (map.loading label) before the client map loads",
    ).not.toBeNull();
    expect(
      result.container.querySelector('[data-testid="map-container"]'),
      "Leaflet must NOT be rendered synchronously by the wrapper (it loads client-only)",
    ).toBeNull();
  });

  it("the MapSkeleton occupies a sized footprint (a box that holds the layout, no CLS)", async () => {
    const { MapSkeleton } = await import("@/components/map/MapSkeleton");
    let result!: RenderResult;
    await act(async () => {
      result = render(<MapSkeleton />);
    });
    const { t } = await import("@/lib/i18n");
    const loadingLabel = t("map.loading" as Parameters<typeof t>[0]);
    const box = result.container.querySelector(`[aria-label="${loadingLabel}"]`) as HTMLElement | null;
    expect(box, "the skeleton must carry the map.loading accessible label").not.toBeNull();
    // The same-footprint box must declare sizing (height/aspect) via class so it
    // cannot collapse to zero and shift the layout when the map swaps in.
    expect(
      (box?.className ?? "").length,
      "the skeleton box must declare sizing classes (a fixed footprint)",
    ).toBeGreaterThan(0);
  });
});

// ───────────────────── FR-MAP-01/02: bounded + marker + popup ──────────────────
describe("LocationMapClient — bounded to the active location with one marker + city popup (FR-MAP-01/02)", () => {
  it("centres the MapContainer on the active location at a city-level zoom", async () => {
    locationRef.current = KYIV;
    await renderClient();
    const center = leafletProbe.mapContainerProps?.center as [number, number] | undefined;
    expect(center, "MapContainer must receive a center").toBeDefined();
    expect(center?.[0]).toBeCloseTo(KYIV.lat, 4);
    expect(center?.[1]).toBeCloseTo(KYIV.lon, 4);
    // A city-level zoom (roughly 9–14) — not the whole-world zoom 0–2.
    const zoom = Number(leafletProbe.mapContainerProps?.zoom);
    expect(zoom).toBeGreaterThanOrEqual(8);
    expect(zoom).toBeLessThanOrEqual(16);
  });

  it("requests OSM raster tiles over HTTPS (TC-STACK-04, TC-MAP-01)", async () => {
    locationRef.current = KYIV;
    const r = await renderClient();
    const tile = r.container.querySelector('[data-testid="tile-layer"]') as HTMLElement | null;
    const url = (tile?.getAttribute("data-url") ?? "") || String(leafletProbe.tileLayerProps?.url ?? "");
    expect(url.startsWith("https://"), "tiles must load over HTTPS").toBe(true);
    expect(url, "the OSM tile template must be used").toContain("tile.openstreetmap.org");
    expect(url).toContain("{z}");
    expect(url).toContain("{x}");
    expect(url).toContain("{y}");
  });

  it("renders EXACTLY one Marker at the active location with a Popup naming the city", async () => {
    locationRef.current = KYIV;
    const r = await renderClient();
    const markers = r.container.querySelectorAll('[data-testid="marker"]');
    expect(markers.length, "exactly one marker for the single active location").toBe(1);

    // The marker is positioned at the active location's coordinates.
    const pos = leafletProbe.markerProps[0]?.position as [number, number] | undefined;
    expect(pos?.[0]).toBeCloseTo(KYIV.lat, 4);
    expect(pos?.[1]).toBeCloseTo(KYIV.lon, 4);

    // Its popup names the city.
    const popup = r.container.querySelector('[data-testid="popup"]');
    expect(popup, "the marker must carry a popup").not.toBeNull();
    expect(popup?.textContent ?? "").toContain("Київ");
  });

  it("re-centres on a location change WITHOUT remounting the MapContainer (FR-MAP-01)", async () => {
    locationRef.current = KYIV;
    const r = await renderClient();
    const keyBefore = leafletProbe.mapContainerProps?.key;

    // Change the active location -> the recenter child calls map.setView, the marker
    // follows, but the MapContainer is NOT re-keyed (no remount / tile flash).
    locationRef.current = LVIV;
    await rerenderClient(r);

    const moved = leafletProbe.setViewCalls.at(-1);
    expect(moved, "a location change must call map.setView (recenter, not remount)").toBeDefined();
    const movedCenter = moved?.center as [number, number] | undefined;
    expect(movedCenter?.[0]).toBeCloseTo(LVIV.lat, 4);
    expect(movedCenter?.[1]).toBeCloseTo(LVIV.lon, 4);

    // The marker moved to Lviv (single marker, repositioned).
    const lastMarker = leafletProbe.markerProps.at(-1)?.position as [number, number] | undefined;
    expect(lastMarker?.[0]).toBeCloseTo(LVIV.lat, 4);
    // The MapContainer key did not change (stable key => no remount).
    expect(leafletProbe.mapContainerProps?.key ?? null).toEqual(keyBefore ?? null);
  });

  it("falls back to a calm coordinate label in the popup when the name is empty (no blank popup)", async () => {
    locationRef.current = { lat: 46.4825, lon: 30.7233, name: "" };
    const r = await renderClient();
    const popup = r.container.querySelector('[data-testid="popup"]');
    const text = popup?.textContent ?? "";
    expect(text.trim().length, "an empty name must not yield a blank popup").toBeGreaterThan(0);
    // No exclamation marks in the fallback (BC-BRAND-01).
    expect(text).not.toContain("!");
  });

  it("contains an unusually long (120-char) name within the popup without breaking", async () => {
    const longName = "Н".repeat(120);
    locationRef.current = { lat: 50.4501, lon: 30.5234, name: longName };
    const r = await renderClient();
    const popup = r.container.querySelector('[data-testid="popup"]');
    expect(popup, "the popup must render for a long name").not.toBeNull();
    // The long name is rendered inside the popup (the component bounds it via CSS).
    expect(popup?.textContent ?? "").toContain(longName);
  });
});

// ───────────────────────── FR-MAP-04: attribution ─────────────────────────────
describe("LocationMapClient — '© OpenStreetMap contributors' attribution is present (FR-MAP-04, TC-MAP-01)", () => {
  it("renders the required attribution string", async () => {
    locationRef.current = KYIV;
    const r = await renderClient();
    expect(
      (r.container.textContent ?? "").includes("© OpenStreetMap contributors"),
      "the OSM attribution string must be present whenever tiles are shown",
    ).toBe(true);
  });
});

// ──────────────────── FR-MAP-03: click-to-set + reverse-name ───────────────────
describe("LocationMapClient — click sets the location immediately then upgrades the name (FR-MAP-03)", () => {
  it("sets the clicked coordinates IMMEDIATELY (coordinate-label name), then UPGRADES to the resolved name", async () => {
    locationRef.current = KYIV;
    fetchMock.mockResolvedValueOnce(reverseResponse("Одеса"));
    await renderClient();

    await clickAt(46.4825, 30.7233);

    // setLocation is called at least twice: first immediately by coordinates, then
    // upgraded with the resolved name (coordinate-first, D5).
    expect(setLocationSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The FIRST setLocation uses the clicked coordinates with a non-empty (fallback)
    // name — never blank, never the old "Київ".
    const first = setLocationSpy.mock.calls[0][0] as Location;
    expect(first.lat).toBeCloseTo(46.4825, 4);
    expect(first.lon).toBeCloseTo(30.7233, 4);
    expect(typeof first.name).toBe("string");
    expect(first.name.length).toBeGreaterThan(0);

    // The reverse route is the INTERNAL handler, never Nominatim directly.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/reverse-geocode");
    expect(calledUrl).not.toContain("nominatim");
    expect(calledUrl).toMatch(/[?&]lat=46\.4825\b/);
    expect(calledUrl).toMatch(/[?&]lon=30\.7233\b/);

    // The LAST setLocation upgrades the name to the resolved place, same coords.
    const last = setLocationSpy.mock.calls.at(-1)?.[0] as Location;
    expect(last.name).toBe("Одеса");
    expect(last.lat).toBeCloseTo(46.4825, 4);
    expect(last.lon).toBeCloseTo(30.7233, 4);
  });

  it("on { name: null } it keeps the coordinate-label fallback and does NOT upgrade", async () => {
    locationRef.current = KYIV;
    fetchMock.mockResolvedValueOnce(reverseResponse(null));
    const { coordinateLabel } = await import("@/lib/geo/coordinate-label");
    await renderClient();

    await clickAt(46.4825, 30.7233);

    // Every emitted location is at the clicked coords with the coordinate-label name
    // (never null, never blank) — no upgrade to a resolved place.
    for (const call of setLocationSpy.mock.calls) {
      const loc = call[0] as Location;
      expect(loc.lat).toBeCloseTo(46.4825, 4);
      expect(loc.name.length).toBeGreaterThan(0);
    }
    const last = setLocationSpy.mock.calls.at(-1)?.[0] as Location;
    expect(last.name).toBe(coordinateLabel(46.4825, 30.7233));
  });

  it("on a REJECTED reverse fetch (network) it falls back calmly, never throws, console clean", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    locationRef.current = KYIV;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { coordinateLabel } = await import("@/lib/geo/coordinate-label");
    await renderClient();

    await expect(clickAt(46.4825, 30.7233)).resolves.not.toThrow();

    const last = setLocationSpy.mock.calls.at(-1)?.[0] as Location;
    expect(last.lat).toBeCloseTo(46.4825, 4);
    expect(last.name).toBe(coordinateLabel(46.4825, 30.7233));
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("NORMALIZES an out-of-range click (lon 190.5 -> -169.5) for setLocation AND the reverse request, silently", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    locationRef.current = KYIV;
    fetchMock.mockResolvedValueOnce(reverseResponse(null));
    await renderClient();

    await clickAt(46.4825, 190.5);

    // setLocation receives the WRAPPED longitude, never the raw 190.5.
    const first = setLocationSpy.mock.calls[0][0] as Location;
    expect(first.lon).toBeCloseTo(-169.5, 4);
    expect(first.lat).toBeCloseTo(46.4825, 4);

    // The reverse request is issued with the normalized lon too.
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(Number(calledUrl.searchParams.get("lon"))).toBeCloseTo(-169.5, 4);

    // The normalize is silent — no console.warn (NFR-OBS-01).
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a quick second click does NOT let the first click's late name overwrite the second location (guarded latest-wins)", async () => {
    locationRef.current = KYIV;

    // First click's reverse is held pending; the second click's reverse resolves fast.
    let resolveFirst!: (res: Response) => void;
    const pendingFirst = new Promise<Response>((res) => (resolveFirst = res));
    fetchMock
      .mockReturnValueOnce(pendingFirst) // click #1 (near Odesa) — slow
      .mockResolvedValueOnce(reverseResponse("Львів")); // click #2 (near Lviv) — fast

    await renderClient();

    // Click #1 (near Odesa), then quickly click #2 (near Lviv) before #1 resolves.
    await clickAt(46.4825, 30.7233);
    await clickAt(49.8397, 24.0297);

    // NOW click #1's slow reverse finally resolves with a STALE name ("Одеса").
    await act(async () => {
      resolveFirst(reverseResponse("Одеса"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The final active location must be the SECOND click's point — the first click's
    // late "Одеса" must never be applied at Lviv's coordinates.
    const last = setLocationSpy.mock.calls.at(-1)?.[0] as Location;
    expect(last.lat).toBeCloseTo(49.8397, 3);
    expect(last.lon).toBeCloseTo(24.0297, 3);
    // No emitted location ever pairs Lviv's latitude with the stale "Одеса" name.
    const corrupted = setLocationSpy.mock.calls.some((c) => {
      const loc = c[0] as Location;
      return Math.abs(loc.lat - 49.8397) < 0.01 && loc.name === "Одеса";
    });
    expect(corrupted, "the first click's late name must not land on the second location").toBe(false);
  });
});

// ───────────────── FR-MAP-02 / NFR-OBS-01: no-location + console silence ───────
describe("LocationMapClient — no active location is calm; healthy session keeps the console silent (NFR-OBS-01)", () => {
  it("renders a calm placeholder (no crash, no MapContainer) when there is no location", async () => {
    locationRef.current = null;
    let r!: RenderResult;
    await expect(
      (async () => {
        r = await renderClient();
      })(),
    ).resolves.not.toThrow();
    expect(
      r.container.querySelector('[data-testid="map-container"]'),
      "no location must not mount a MapContainer",
    ).toBeNull();
    // The region is not silently blank.
    expect((r.container.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("keeps the console silent on a healthy render + a click that resolves to a name", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    locationRef.current = KYIV;
    fetchMock.mockResolvedValueOnce(reverseResponse("Одеса"));
    const r = await renderClient();
    expect(within(r.container).queryAllByText(/[Ѐ-ӿ]/).length).toBeGreaterThan(0);

    await clickAt(46.4825, 30.7233);

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
