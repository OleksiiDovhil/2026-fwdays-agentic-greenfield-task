// Test-first (RED): asserts the SPECIFIED behavior of the city-search box pinned
// by design.md D3-D6 and the city-search spec (Debounced search, Latest-wins,
// Bounded input, Suggestion content, Selection -> active location/URL, Enter
// auto-select, Zero-results inline message, Opt-in geolocation, Accessible
// combobox, Honest degradation). The implementation
// (`components/search/SearchBox.tsx`) does NOT exist yet — these MUST fail
// because the module is missing, not because of weak assertions. Never weaken a
// test to pass it; if it contradicts the spec, change it deliberately.
//
// Stack (ADR-0003/0004): Vitest + jsdom only. `fetch` and `navigator.geolocation`
// are MOCKED (never the network). Fake timers drive the 300 ms debounce. The box
// renders inside the LOCKED LocationProvider; `next/navigation` is mocked so the
// provider's setLocation -> router.replace URL sync is observable.
//
// The `search.*` i18n keys this widget reads are added by THIS slice and are not
// yet in the typed `MessageKey` union, so they are referenced via the established
// `as never` cast (mirroring lib/i18n/i18n.test.ts, TopClock.test.tsx). Until
// uk.ts gains the namespace they degrade to "" — the empty-results test also
// asserts the literal "Нічого не знайдено" so the shipped Ukrainian copy is pinned.
//
// @trace FR-SEARCH-01, FR-SEARCH-02, FR-SEARCH-03, FR-SEARCH-04, FR-SEARCH-05, FR-SEARCH-06, BC-PRIVACY-02, NFR-A11Y-01, NFR-OBS-01
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, render, cleanup, fireEvent, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";

// --- Mock next/navigation so the LocationProvider has a router whose `replace`
// we can observe (the URL-sync proof for FR-SEARCH-03). ------------------------
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
}));

// --- A sample geocoding result list (the /api/geocode contract: GeoSuggestion[]).
const KYIV = {
  id: "703448",
  name: "Київ",
  admin1: "Київ",
  country: "Україна",
  countryCode: "UA",
  lat: 50.45466,
  lon: 30.5238,
};
const LVIV = {
  id: "698740",
  name: "Львів",
  admin1: "Львівська область",
  country: "Україна",
  countryCode: "UA",
  lat: 49.83826,
  lon: 24.02324,
};

// A resolved /api/geocode Response stub.
function geoResponse(suggestions: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ suggestions }),
  } as unknown as Response;
}

let fetchMock: Mock;

// Render the SearchBox inside the LOCKED LocationProvider (the real provider, so
// selection flows through the genuine setLocation -> router.replace path). Import
// is deferred so a MISSING module fails the test rather than crashing collection.
async function renderBox(): Promise<RenderResult> {
  const { SearchBox } = await import("@/components/search/SearchBox");
  const { LocationProvider } = await import(
    "@/components/providers/LocationProvider"
  );
  let result!: RenderResult;
  await act(async () => {
    result = render(
      <LocationProvider>
        <SearchBox />
      </LocationProvider>,
    );
  });
  return result;
}

// The single search combobox input.
const comboboxOf = (r: RenderResult): HTMLElement => {
  const el =
    (r.container.querySelector('[role="combobox"]') as HTMLElement | null) ??
    (r.container.querySelector("input") as HTMLElement | null);
  if (!el) throw new Error("SearchBox: no combobox/input rendered");
  return el;
};

// Type a value into the input (sets value + fires input/change), then let the
// 300 ms debounce elapse and flush microtasks so the fetch + state settle.
async function typeAndDebounce(
  r: RenderResult,
  value: string,
  ms = 300,
): Promise<void> {
  const input = comboboxOf(r) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  replaceMock.mockClear();
  fetchMock = vi.fn(async () => geoResponse([KYIV, LVIV]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SearchBox — debounced search fetches /api/geocode and renders suggestions (FR-SEARCH-01/02)", () => {
  it("fires exactly ONE request after 300 ms idle, not one per keystroke", async () => {
    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;

    // Five quick keystrokes within the debounce window.
    for (const v of ["K", "Ky", "Kyi", "Kyiv", "Kyiv "]) {
      await act(async () => {
        fireEvent.change(input, { target: { value: v } });
        vi.advanceTimersByTime(100); // < 300 ms between keystrokes
      });
    }
    // No request yet — still within the debounce window since the last keystroke.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a quiet busy state while loading (aria-busy + a polite status region), cleared on result", async () => {
    const { t } = await import("@/lib/i18n");
    // Hold the request pending so the loading window is observable.
    let resolveReq!: (res: Response) => void;
    const pending = new Promise<Response>((res) => (resolveReq = res));
    fetchMock.mockReturnValueOnce(pending);

    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Київ" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    // During loading: the combobox announces busy and a single calm polite status
    // region shows the loading copy (no error, no listbox yet).
    expect(comboboxOf(r).getAttribute("aria-busy")).toBe("true");
    const status = r.container.querySelector('[role="status"]') as HTMLElement | null;
    expect(status, "a polite loading status region must be present").not.toBeNull();
    expect((status?.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(status?.textContent).toContain(t("search.loading" as never));
    expect(r.container.querySelector('[role="alert"]')).toBeNull();

    // On resolution the busy state clears and the suggestions render.
    await act(async () => {
      resolveReq(geoResponse([KYIV, LVIV]));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(comboboxOf(r).getAttribute("aria-busy")).toBe("false");
    expect(r.container.querySelectorAll('[role="option"]').length).toBe(2);
  });

  it("requests the INTERNAL /api/geocode route (never Open-Meteo directly)", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/geocode");
    expect(calledUrl).toMatch(/[?&]q=/);
    // The client must NOT know the upstream URL.
    expect(calledUrl).not.toContain("open-meteo.com");
  });

  it("fires NO request for an empty / whitespace-only value and dismisses the list", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    expect(r.container.querySelector('[role="listbox"]')).not.toBeNull();

    // Clear to whitespace: no new request, and the list is dismissed.
    fetchMock.mockClear();
    await typeAndDebounce(r, "   ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("renders each suggestion as a role=option row with name, region, and country", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");

    const options = r.container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);

    const first = options[0] as HTMLElement;
    expect(first.textContent).toContain("Київ"); // name
    expect(first.textContent).toContain("Київ"); // admin1 region
    expect(first.textContent).toContain("Україна"); // country
    // The optional flag is present for a resolvable code (no broken glyph).
    expect(first.textContent).toContain("\u{1F1FA}\u{1F1E6}"); // 🇺🇦
  });
});

describe("SearchBox — selecting a suggestion sets the active location & URL (FR-SEARCH-03)", () => {
  it("clicking a suggestion syncs ?lat=&lon=&name= via the provider and dismisses the list", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");

    const option = within(r.container).getAllByRole("option")[0];
    await act(async () => {
      fireEvent.click(option);
      await Promise.resolve();
    });

    // The LOCKED provider's router.replace carries the selected lat/lon/name.
    expect(replaceMock).toHaveBeenCalled();
    const target = String(
      replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
    );
    expect(target).toContain("lat=50.45466");
    expect(target).toContain("lon=30.5238");
    expect(target).toMatch(/name=(?:%D0%9A%D0%B8%D1%97%D0%B2|Київ)/); // "Київ" encoded or raw

    // The list is dismissed on selection.
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("SearchBox — Enter auto-selects the lone suggestion only (FR-SEARCH-04)", () => {
  it("Enter with exactly ONE suggestion selects it (URL synced like a click)", async () => {
    fetchMock.mockResolvedValue(geoResponse([KYIV])); // exactly one
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    expect(r.container.querySelectorAll('[role="option"]')).toHaveLength(1);

    replaceMock.mockClear();
    const input = comboboxOf(r);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });
    expect(replaceMock).toHaveBeenCalled();
    const target = String(
      replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
    );
    expect(target).toContain("lat=50.45466");
    expect(target).toContain("lon=30.5238");
  });

  it("Enter with TWO+ suggestions and no active descendant does NOT guess", async () => {
    fetchMock.mockResolvedValue(geoResponse([KYIV, LVIV])); // two
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    expect(r.container.querySelectorAll('[role="option"]').length).toBe(2);
    // No Arrow used -> no active descendant.
    expect(comboboxOf(r).getAttribute("aria-activedescendant") ?? "").toBe("");

    replaceMock.mockClear();
    const input = comboboxOf(r);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });
    // The active location is unchanged — no selection was guessed.
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("SearchBox — zero results show the inline Ukrainian message, never a toast (FR-SEARCH-05)", () => {
  it('renders <Notice variant="empty"> with the literal "Нічого не знайдено" in place of the list', async () => {
    fetchMock.mockResolvedValue(geoResponse([])); // zero results for a non-empty query
    const r = await renderBox();
    await typeAndDebounce(r, "zzzzzzzz");

    // The shipped Ukrainian literal is shown (FR-SEARCH-05 reconciliation, D8).
    expect(r.container.textContent).toContain("Нічого не знайдено");
    // It is the calm empty/status Notice, NOT the assertive error Notice and NOT a list.
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    expect(r.container.querySelector('[role="status"]')).not.toBeNull();
    expect(r.container.querySelector('[role="alert"]')).toBeNull();

    // The input stays focused and editable (zero results is not a failure).
    const input = comboboxOf(r) as HTMLInputElement;
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(input.hasAttribute("readonly")).toBe(false);
  });
});

describe("SearchBox — latest-wins: a stale response never overwrites the current state (D3)", () => {
  it("a slow earlier response does not overwrite the newer query's suggestions", async () => {
    // R1 (for "Ki") resolves AFTER R2 (for "Kyiv"). The list must reflect R2.
    let resolveR1!: (r: Response) => void;
    const r1 = new Promise<Response>((res) => (resolveR1 = res));
    fetchMock
      .mockReturnValueOnce(r1) // first debounced request (R1, "Ki") — pending
      .mockResolvedValueOnce(geoResponse([KYIV])); // second (R2, "Kyiv") — resolves now

    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;

    // R1 fires for "Ki".
    await act(async () => {
      fireEvent.change(input, { target: { value: "Ki" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    // R2 fires for "Kyiv" and resolves.
    await act(async () => {
      fireEvent.change(input, { target: { value: "Kyiv" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Now R1 finally resolves with stale (different) data.
    await act(async () => {
      resolveR1(geoResponse([LVIV]));
      await Promise.resolve();
      await Promise.resolve();
    });

    const options = r.container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect((options[0] as HTMLElement).textContent).toContain("Київ"); // R2 stands
    expect(r.container.textContent).not.toContain("Львів"); // R1 discarded
  });

  it("a request that resolves AFTER the input was cleared does not resurrect the list", async () => {
    let resolveR1!: (r: Response) => void;
    const r1 = new Promise<Response>((res) => (resolveR1 = res));
    fetchMock.mockReturnValueOnce(r1);

    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "Lvi" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    // Clear the input before R1 resolves.
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    // R1 resolves late — must be discarded (list stays dismissed).
    await act(async () => {
      resolveR1(geoResponse([LVIV]));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    expect(r.container.textContent).not.toContain("Львів");
  });
});

describe("SearchBox — failures degrade to a calm inline error, console stays clean (NFR-OBS-01)", () => {
  it("a network error renders the error Notice (not a toast / uncaught throw) and keeps the input editable", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const r = await renderBox();
    await typeAndDebounce(r, "Київ");

    // An assertive inline error Notice is shown; no suggestion list.
    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    // The input is still editable so the visitor can retry.
    const input = comboboxOf(r) as HTMLInputElement;
    expect(input.hasAttribute("disabled")).toBe(false);
    // The component renders the Notice instead of logging the caught error.
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps the console silent on a HEALTHY search + selection session", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    const option = within(r.container).getAllByRole("option")[0];
    await act(async () => {
      fireEvent.click(option);
      await Promise.resolve();
    });
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // A RESOLVED route response carrying the typed { error: "failed" } body (a
  // non-OK / malformed upstream the handler already collapsed) — distinct from a
  // THROWN client fetch — must also surface the calm error Notice, never the
  // listbox and never partial data.
  it("a resolved { error: \"failed\" } route body surfaces the calm error Notice (not just a thrown fetch)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: "failed" }),
    } as unknown as Response);

    const r = await renderBox();
    await typeAndDebounce(r, "Київ");

    // The assertive inline error Notice is shown; no list, no empty status.
    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    // The body's `error` field is never rendered as a suggestion (no partial data).
    expect(r.container.textContent).not.toContain("failed");
    // Still rendered calmly (no console noise), input editable to retry.
    const input = comboboxOf(r) as HTMLInputElement;
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("SearchBox — accessible combobox/listbox semantics (NFR-A11Y-01)", () => {
  it("the input is a role=combobox with an accessible name, aria-expanded and aria-controls", async () => {
    const r = await renderBox();
    const input = comboboxOf(r);
    expect(input.getAttribute("role")).toBe("combobox");

    // Accessible name via aria-label or an associated <label>.
    const labelledById = input.getAttribute("aria-labelledby");
    const name =
      input.getAttribute("aria-label") ??
      (labelledById
        ? r.container.querySelector(`#${CSS.escape(labelledById)}`)?.textContent ?? ""
        : "");
    expect((name ?? "").trim().length).toBeGreaterThan(0);

    // Collapsed before any query.
    expect(input.getAttribute("aria-expanded")).toBe("false");

    // After suggestions arrive: expanded + aria-controls points at the listbox.
    await typeAndDebounce(r, "Київ");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const controls = input.getAttribute("aria-controls");
    expect(controls, "combobox must reference its listbox via aria-controls").toBeTruthy();
    const listbox = r.container.querySelector('[role="listbox"]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    expect(listbox?.id).toBe(controls);
    // The listbox itself carries an accessible name.
    const listName =
      listbox?.getAttribute("aria-label") ?? listbox?.getAttribute("aria-labelledby") ?? "";
    expect(listName.trim().length).toBeGreaterThan(0);
  });

  it("Arrow Down sets exactly one aria-activedescendant / aria-selected and focus stays in the input", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    const input = comboboxOf(r) as HTMLInputElement;
    input.focus();

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    });

    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId, "Arrow Down must set aria-activedescendant on the input").toBeTruthy();
    const active = r.container.querySelector(`#${CSS.escape(activeId as string)}`);
    expect(active?.getAttribute("role")).toBe("option");

    // Exactly ONE option is aria-selected="true".
    const selected = r.container.querySelectorAll('[role="option"][aria-selected="true"]');
    expect(selected).toHaveLength(1);
    expect((selected[0] as HTMLElement).id).toBe(activeId);

    // Focus did NOT move to an option — it stays in the input (activedescendant pattern).
    expect(document.activeElement).toBe(input);
  });

  it("Enter on the active descendant selects THAT option and clears it; Escape closes the list", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ"); // [Київ, Львів]
    const input = comboboxOf(r) as HTMLInputElement;
    input.focus();

    // Arrow to the SECOND option (Львів), then Enter selects it.
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    });
    replaceMock.mockClear();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });
    expect(replaceMock).toHaveBeenCalled();
    const target = String(
      replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
    );
    expect(target).toContain("lat=49.83826"); // Львів's coordinates
    // The list is dismissed and the active descendant cleared.
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    expect(input.getAttribute("aria-activedescendant") ?? "").toBe("");
  });

  it("Escape closes the list and clears the active descendant", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    const input = comboboxOf(r) as HTMLInputElement;
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    });
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
    expect(input.getAttribute("aria-activedescendant") ?? "").toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  // Tab moves PAST the combobox to the next control (the activedescendant
  // pattern), NOT through the options. Proven structurally: no option is tabbable,
  // and the next tabbable control after the combobox is the "Use my location"
  // button (no focusable option sits between the input and the button).
  it("options are NOT tabbable and the next tab stop after the combobox is the geolocate button", async () => {
    const r = await renderBox();
    await typeAndDebounce(r, "Київ");
    const input = comboboxOf(r) as HTMLInputElement;

    const options = Array.from(
      r.container.querySelectorAll('[role="option"]'),
    ) as HTMLElement[];
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      // No option opts INTO the tab order: no tabindex attribute (or an explicit
      // -1), and a non-tabbable resolved tabIndex (<li> is not natively focusable).
      const attr = opt.getAttribute("tabindex");
      expect(attr === null || attr === "-1", "an option must not be tabbable").toBe(true);
      expect(opt.tabIndex).toBeLessThan(0);
    }

    // The "Use my location" button is a real, natively-tabbable control that
    // follows the input in DOM order — so the next Tab from the combobox lands on
    // it, never on an option.
    const button = within(r.container).getAllByRole("button")[0];
    expect(button.tagName).toBe("BUTTON");
    expect(button.hasAttribute("disabled")).toBe(false);
    // DOM order: input precedes the button (forward Tab reaches it next).
    expect(
      input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // And no tabbable option sits between them (all options are tabIndex < 0).
    const tabbableOptions = options.filter((o) => o.tabIndex >= 0);
    expect(tabbableOptions).toHaveLength(0);
  });
});

describe('SearchBox — opt-in "Use my location": geolocation only on explicit click (FR-SEARCH-06, BC-PRIVACY-02)', () => {
  // Install a mock geolocation; track every getCurrentPosition call.
  function installGeolocation(behavior: "grant" | "deny"): Mock {
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => {
        if (behavior === "grant") {
          success({
            coords: {
              latitude: 50.45,
              longitude: 30.52,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        } else {
          error?.({
            code: 1, // PERMISSION_DENIED
            message: "User denied Geolocation",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
    });
    return getCurrentPosition;
  }

  afterEach(() => {
    // Remove the stub so it does not leak between tests.
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
  });

  it("does NOT call navigator.geolocation on render / mount / idle (BC-PRIVACY-02)", async () => {
    const getCurrentPosition = installGeolocation("grant");
    const r = await renderBox();
    // Let any (forbidden) effects run.
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    // And rendering produced a usable "Use my location" control.
    const buttons = within(r.container).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls getCurrentPosition ONLY after the explicit button click, then sets the location", async () => {
    const getCurrentPosition = installGeolocation("grant");
    const r = await renderBox();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    const geoButton = within(r.container).getAllByRole("button")[0];
    replaceMock.mockClear();
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    // On a granted position the active location is set from the coordinates.
    expect(replaceMock).toHaveBeenCalled();
    const target = String(
      replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
    );
    expect(target).toContain("lat=50.45");
    expect(target).toContain("lon=30.52");
  });

  it("on a DENIED permission shows a calm inline Notice (Ukrainian, no !) and does not crash", async () => {
    installGeolocation("deny");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await renderBox();
    const geoButton = within(r.container).getAllByRole("button")[0];
    replaceMock.mockClear();
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    // A calm inline error Notice is shown; the active location is unchanged.
    const alert = r.container.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert, "a denied permission must show an inline error Notice").not.toBeNull();
    expect(alert?.textContent ?? "").not.toContain("!");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("when the geolocation API is ABSENT, a click shows the calm Notice (no crash)", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    const r = await renderBox();
    const geoButton = within(r.container).getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();
  });

  // Console-silence extends to the GEOLOCATION leg (NFR-OBS-01): a granted
  // position is a healthy outcome and must emit no console error/warning.
  it("keeps the console silent on a granted geolocation click (healthy leg)", async () => {
    installGeolocation("grant");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await renderBox();
    const geoButton = within(r.container).getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // The denial Notice is transient, not pinned: once the visitor resumes typing a
  // search, the stale geolocation Notice clears (so it cannot linger over the
  // suggestion list / a later search).
  it("clears the geo-denial Notice once the visitor resumes typing", async () => {
    installGeolocation("deny");
    const r = await renderBox();
    const geoButton = within(r.container).getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    // The denial Notice is shown.
    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();

    // Resume typing (the default mock returns a suggestion list). The stale
    // geolocation Notice must be gone — replaced in place by the search results.
    await typeAndDebounce(r, "Київ");
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    expect(r.container.querySelector('[role="listbox"]')).not.toBeNull();
  });

  // Selecting a suggestion also clears any lingering geolocation Notice (the other
  // half of the #1 fix), so a chosen place never sits under a stale denial Notice.
  it("clears the geo-denial Notice when a suggestion is selected", async () => {
    const r = await renderBox();
    // First, surface a suggestion list.
    await typeAndDebounce(r, "Київ");
    expect(r.container.querySelector('[role="listbox"]')).not.toBeNull();

    // Now deny geolocation while the list is open → the denial Notice appears
    // alongside the list.
    installGeolocation("deny");
    const geoButton = within(r.container).getAllByRole("button")[0];
    await act(async () => {
      fireEvent.click(geoButton);
      await Promise.resolve();
    });
    expect(r.container.querySelector('[role="alert"]')).not.toBeNull();

    // Selecting a suggestion dismisses the list AND clears the geolocation Notice.
    const option = within(r.container).getAllByRole("option")[0];
    await act(async () => {
      fireEvent.click(option);
      await Promise.resolve();
    });
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    expect(r.container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("SearchBox — oversized / odd input is bounded, sent as encoded text (FR-SEARCH-01)", () => {
  it("pastes a 5,000-char value: at most ONE request, q truncated to 120 chars, input editable", async () => {
    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;
    const huge = "к".repeat(5000);
    await act(async () => {
      fireEvent.change(input, { target: { value: huge } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
    if (fetchMock.mock.calls.length === 1) {
      const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
      const sentQ = url.searchParams.get("q") ?? "";
      expect(sentQ.length).toBeLessThanOrEqual(120);
      expect(sentQ.length).toBeLessThan(5000);
    }
    // The input stays editable (no crash, no disable).
    expect(input.hasAttribute("disabled")).toBe(false);
  });

  it('sends "50,45" + emoji as URL-encoded search text, not coordinates/markup', async () => {
    const r = await renderBox();
    const input = comboboxOf(r) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "50,45 🌦" } });
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // The raw comma/emoji are percent-encoded into q, never split into lat/lon.
    expect(calledUrl).toContain("/api/geocode");
    expect(calledUrl).not.toMatch(/[?&]lat=/);
    expect(calledUrl).not.toMatch(/[?&]lon=/);
    // The encoded comma is present as search text.
    expect(calledUrl).toContain("50%2C45");
  });
});
