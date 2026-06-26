// Regression (review finding 4): `map.reverseFailed` is an EVAL-GRADED string that
// was defined but never rendered. The component must SURFACE it — quietly — when a
// map click's reverse lookup yields no usable place name (the coordinate-label
// fallback is in use), and must NOT show it on the success path. It is a calm,
// non-intrusive hint (a small muted line in the popup), never a loud/live error
// (FR-MAP-03 "request fails → a calm inline message", NFR-OBS-01, BC-BRAND-01).
//
// Stack (ADR-0003/0004, TC-STACK-05): Vitest + jsdom, react-leaflet MOCKED with
// light stand-ins (no real Leaflet DOM). The `useMapEvents({ click })` handler is
// captured so the test drives a click with a mocked `/api/reverse-geocode` body.
//
// @trace FR-MAP-03, NFR-OBS-01, BC-BRAND-01
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { Location } from "@/lib/location/types";

const locationRef: { current: Location | null } = { current: null };
const setLocationSpy: Mock = vi.fn();
vi.mock("@/components/providers/LocationProvider", () => ({
  useLocation: () => ({ location: locationRef.current, setLocation: setLocationSpy }),
  LocationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

type LatLng = { lat: number; lng: number };
type ClickHandler = (e: { latlng: LatLng }) => void;
const probe: { clickHandler: ClickHandler | null } = { clickHandler: null };

vi.mock("react-leaflet", () => {
  const React = require("react");
  return {
    MapContainer: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "map-container" }, props.children),
    TileLayer: () => React.createElement("div", { "data-testid": "tile-layer" }),
    Marker: (props: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "marker" }, props.children),
    Popup: (props: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "popup" }, props.children),
    AttributionControl: () =>
      React.createElement("div", { "data-testid": "attribution" }, "© OpenStreetMap contributors"),
    useMap: () => ({ setView: () => {} }),
    useMapEvents: (handlers: { click?: ClickHandler }) => {
      if (handlers?.click) probe.clickHandler = handlers.click;
      return {};
    },
  };
});

vi.mock("leaflet", () => {
  const Icon = function () {};
  (Icon as unknown as { Default: { prototype: Record<string, unknown>; mergeOptions: () => void } }).Default = {
    prototype: {},
    mergeOptions: () => {},
  };
  return { default: { Icon, icon: () => ({}), Marker: { prototype: {} } }, Icon, icon: () => ({}) };
});

const KYIV: Location = { lat: 50.4501, lon: 30.5234, name: "Київ" };

function reverseResponse(name: string | null): Response {
  return { ok: true, status: 200, json: async () => ({ name }) } as unknown as Response;
}

let fetchMock: Mock;

async function renderClient(): Promise<RenderResult> {
  const mod = await import("@/components/map/LocationMapClient");
  const LocationMapClient = (mod.default ??
    (mod as Record<string, unknown>).LocationMapClient) as React.ComponentType;
  let result!: RenderResult;
  await act(async () => {
    result = render(<LocationMapClient />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

async function clickAt(lat: number, lng: number): Promise<void> {
  const handler = probe.clickHandler;
  if (!handler) throw new Error("no click handler registered");
  await act(async () => {
    handler({ latlng: { lat, lng } });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  locationRef.current = KYIV;
  setLocationSpy.mockReset();
  probe.clickHandler = null;
  fetchMock = vi.fn(async () => reverseResponse("Одеса"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("LocationMapClient — map.reverseFailed hint surfaces ONLY on the reverse-fail path (FR-MAP-03)", () => {
  it("does NOT show the reverse-failed hint on a fresh render (no click yet)", async () => {
    const { t } = await import("@/lib/i18n");
    const r = await renderClient();
    expect(r.container.querySelector('[data-slot="reverse-failed"]')).toBeNull();
    expect((r.container.textContent ?? "")).not.toContain(
      t("map.reverseFailed" as Parameters<typeof t>[0]),
    );
  });

  it("does NOT show the hint when the click resolves to a usable name (success path)", async () => {
    fetchMock.mockResolvedValueOnce(reverseResponse("Одеса"));
    const r = await renderClient();
    await clickAt(46.4825, 30.7233);
    expect(
      r.container.querySelector('[data-slot="reverse-failed"]'),
      "no reverse-failed hint when a name resolves",
    ).toBeNull();
  });

  it("SHOWS the calm hint when the reverse returns { name: null } (no usable place)", async () => {
    const { t } = await import("@/lib/i18n");
    const hint = t("map.reverseFailed" as Parameters<typeof t>[0]);
    expect(hint.trim().length, "map.reverseFailed must be a non-empty i18n string").toBeGreaterThan(0);

    fetchMock.mockResolvedValueOnce(reverseResponse(null));
    const r = await renderClient();
    await clickAt(46.4825, 30.7233);

    const node = r.container.querySelector('[data-slot="reverse-failed"]');
    expect(node, "the reverse-failed hint must appear when no name resolves").not.toBeNull();
    expect(node?.textContent ?? "").toBe(hint);
    // Calm, not a live-region error, and no exclamation marks (BC-BRAND-01).
    expect(node?.getAttribute("role")).toBeNull();
    expect(node?.textContent ?? "").not.toContain("!");
  });

  it("SHOWS the hint when the reverse fetch rejects (network), still calmly", async () => {
    const { t } = await import("@/lib/i18n");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await renderClient();
    await clickAt(46.4825, 30.7233);
    const node = r.container.querySelector('[data-slot="reverse-failed"]');
    expect(node, "a network failure must surface the calm hint").not.toBeNull();
    expect(node?.textContent ?? "").toBe(t("map.reverseFailed" as Parameters<typeof t>[0]));
  });

  it("clears a prior hint when a subsequent click resolves to a name", async () => {
    // First click fails → hint shows; second click succeeds → hint clears.
    fetchMock
      .mockResolvedValueOnce(reverseResponse(null))
      .mockResolvedValueOnce(reverseResponse("Львів"));
    const r = await renderClient();
    await clickAt(46.4825, 30.7233);
    expect(r.container.querySelector('[data-slot="reverse-failed"]')).not.toBeNull();
    await clickAt(49.8397, 24.0297);
    expect(
      r.container.querySelector('[data-slot="reverse-failed"]'),
      "a later successful click clears the hint",
    ).toBeNull();
  });
});
