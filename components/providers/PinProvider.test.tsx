// Test-first (RED): asserts the SPECIFIED in-memory pin state pinned by design.md
// D1 and the weekend-compare spec ("Pin up to 3 cities…", FR-COMPARE-01). The
// implementation (`components/providers/PinProvider.tsx`) does NOT exist yet —
// these MUST fail because the provider module is MISSING, not because of weak
// assertions. Never weaken a test to make it pass.
//
// Contract under test (design.md D1, §1.2):
//   - `PinProvider` holds an in-memory `pins: PinnedCity[]` (the LOCKED `Location`
//     shape) and exposes `usePins() → { pins, pin, unpin, isPinned, atCap }`.
//   - `pin(city)` adds a chip; DEDUPE is by the rounded `keyOf(loc) =
//     "${lat.toFixed(4)},${lon.toFixed(4)}"` identity — pinning the same lat/lon
//     twice does NOT create a duplicate.
//   - MAX 3 is enforced: a 4th `pin` is a NO-OP that leaves `pins.length === 3`,
//     surfaces `atCap === true`, and NEVER throws / silently drops without the cap
//     state.
//   - `unpin(key)` removes by the rounded key; `isPinned(key)` reflects membership.
//   - `usePins()` returns a SAFE empty-list default outside a provider (a stray
//     consumer never crashes, mirroring `useLocation`/`useWeather`).
//   - In-memory ONLY (ADR-0003): no cookies / localStorage / server store writes.
//
// Stack (ADR-0003/0004): Vitest + jsdom only; no network, no persistence.
//
// @trace FR-COMPARE-01
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Location } from "@/lib/location/types";

const KYIV: Location = { lat: 50.45, lon: 30.52, name: "Київ" };
const LVIV: Location = { lat: 49.84, lon: 24.03, name: "Львів" };
const ODESA: Location = { lat: 46.48, lon: 30.72, name: "Одеса" };
const KHARKIV: Location = { lat: 49.99, lon: 36.23, name: "Харків" };

// The rounded {lat,lon} identity the provider dedupes / unpins on (the SAME keyOf
// ForecastSection uses). Kept here so the test asserts the contract, not the impl.
function keyOf(loc: Location): string {
  return `${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
}

// The safe empty-list default usePins() must return OUTSIDE a provider (D1).
const EMPTY_DEFAULT_PINS: readonly Location[] = [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

// Render usePins() inside a real <PinProvider>. Import is deferred so a MISSING
// module fails the test rather than crashing collection.
async function renderPins() {
  const { PinProvider, usePins } = await import(
    "@/components/providers/PinProvider"
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PinProvider>{children}</PinProvider>
  );
  return renderHook(() => usePins(), { wrapper });
}

describe("usePins — safe empty-list default OUTSIDE a provider (D1)", () => {
  it("returns an empty pin list and callable no-op helpers when used without a provider", async () => {
    const { usePins } = await import("@/components/providers/PinProvider");
    const { result } = renderHook(() => usePins());
    expect(result.current.pins).toEqual(EMPTY_DEFAULT_PINS);
    expect(result.current.atCap).toBe(false);
    expect(typeof result.current.pin).toBe("function");
    expect(typeof result.current.unpin).toBe("function");
    expect(typeof result.current.isPinned).toBe("function");
    // The no-op helpers never throw outside a provider (a stray consumer is safe).
    expect(() => result.current.pin(KYIV)).not.toThrow();
    expect(() => result.current.unpin(keyOf(KYIV))).not.toThrow();
    expect(result.current.isPinned(keyOf(KYIV))).toBe(false);
  });
});

describe("usePins — add a pin (FR-COMPARE-01)", () => {
  it("starts empty and pin(city) adds that city to pins", async () => {
    const { result } = await renderPins();
    expect(result.current.pins).toEqual([]);

    act(() => result.current.pin(KYIV));

    expect(result.current.pins).toHaveLength(1);
    expect(result.current.pins[0]).toMatchObject({ name: "Київ", lat: 50.45, lon: 30.52 });
    expect(result.current.isPinned(keyOf(KYIV))).toBe(true);
    expect(result.current.atCap).toBe(false);
  });
});

describe("usePins — dedupe by the rounded lat/lon key (FR-COMPARE-01)", () => {
  it("pinning the SAME city twice keeps a single entry (no duplicate)", async () => {
    const { result } = await renderPins();
    act(() => result.current.pin(LVIV));
    act(() => result.current.pin(LVIV)); // same lat/lon again

    expect(result.current.pins, "the same city must not be pinned twice").toHaveLength(1);
    expect(result.current.pins[0].name).toBe("Львів");
  });

  it("two cities that round to the SAME key are treated as the same pin (dedupe is by keyOf)", async () => {
    const { result } = await renderPins();
    // keyOf rounds to 4 dp: 50.45000 and 50.45004 both → "50.4500"; same lon.
    const kyivA: Location = { lat: 50.45, lon: 30.52, name: "Київ" };
    const kyivB: Location = { lat: 50.45004, lon: 30.52004, name: "Київ (поряд)" };
    expect(keyOf(kyivA)).toBe(keyOf(kyivB)); // sanity: identical rounded key

    act(() => result.current.pin(kyivA));
    act(() => result.current.pin(kyivB));

    expect(
      result.current.pins,
      "two coordinates sharing a rounded key are the same pin",
    ).toHaveLength(1);
  });
});

describe("usePins — max 3 enforced, the cap is surfaced (FR-COMPARE-01)", () => {
  it("a fourth pin is a NO-OP: pins stays length 3 and atCap is true (never throws / silently drops)", async () => {
    const { result } = await renderPins();
    act(() => result.current.pin(KYIV));
    act(() => result.current.pin(LVIV));
    act(() => result.current.pin(ODESA));

    expect(result.current.pins).toHaveLength(3);
    expect(result.current.atCap, "atCap must be true at exactly 3 pins").toBe(true);

    // The 4th pin must not throw and must not add a fourth city.
    expect(() => act(() => result.current.pin(KHARKIV))).not.toThrow();
    expect(result.current.pins, "the 4th pin must be a no-op").toHaveLength(3);
    expect(
      result.current.isPinned(keyOf(KHARKIV)),
      "the refused 4th city must NOT be pinned",
    ).toBe(false);
    // The three originals are intact (no silent drop of an existing pin).
    expect(result.current.isPinned(keyOf(KYIV))).toBe(true);
    expect(result.current.isPinned(keyOf(LVIV))).toBe(true);
    expect(result.current.isPinned(keyOf(ODESA))).toBe(true);
  });

  it("atCap is false below the cap and becomes true exactly at the third pin", async () => {
    const { result } = await renderPins();
    expect(result.current.atCap).toBe(false);
    act(() => result.current.pin(KYIV));
    expect(result.current.atCap).toBe(false);
    act(() => result.current.pin(LVIV));
    expect(result.current.atCap).toBe(false);
    act(() => result.current.pin(ODESA));
    expect(result.current.atCap).toBe(true);
  });

  it("unpinning below the cap makes room again (atCap returns to false, a new pin is accepted)", async () => {
    const { result } = await renderPins();
    act(() => result.current.pin(KYIV));
    act(() => result.current.pin(LVIV));
    act(() => result.current.pin(ODESA));
    expect(result.current.atCap).toBe(true);

    act(() => result.current.unpin(keyOf(LVIV)));
    expect(result.current.atCap).toBe(false);

    act(() => result.current.pin(KHARKIV));
    expect(result.current.pins).toHaveLength(3);
    expect(result.current.isPinned(keyOf(KHARKIV))).toBe(true);
  });
});

describe("usePins — remove a pin (FR-COMPARE-01)", () => {
  it("unpin(key) removes that city, leaving the others", async () => {
    const { result } = await renderPins();
    act(() => result.current.pin(KYIV));
    act(() => result.current.pin(LVIV));
    expect(result.current.pins).toHaveLength(2);

    act(() => result.current.unpin(keyOf(LVIV)));

    expect(result.current.pins).toHaveLength(1);
    expect(result.current.pins[0].name).toBe("Київ");
    expect(result.current.isPinned(keyOf(LVIV))).toBe(false);
    expect(result.current.isPinned(keyOf(KYIV))).toBe(true);
  });

  it("unpinning a key that is not pinned is a calm no-op (no throw, list unchanged)", async () => {
    const { result } = await renderPins();
    act(() => result.current.pin(KYIV));
    expect(() => act(() => result.current.unpin(keyOf(KHARKIV)))).not.toThrow();
    expect(result.current.pins).toHaveLength(1);
  });
});

describe("usePins — in-memory ONLY, no persistence (ADR-0003, FR-COMPARE-01)", () => {
  it("does not write a cookie or a localStorage entry when pinning", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookieSetter = vi.fn();
    // Intercept any document.cookie write attempt.
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: cookieSetter,
    });

    try {
      const { result } = await renderPins();
      act(() => result.current.pin(KYIV));
      act(() => result.current.pin(LVIV));

      expect(setItem, "pins must not be written to localStorage").not.toHaveBeenCalled();
      expect(cookieSetter, "pins must not be written to a cookie").not.toHaveBeenCalled();
    } finally {
      // Restore the original cookie descriptor.
      if (cookieDescriptor) {
        Object.defineProperty(document, "cookie", cookieDescriptor);
      }
    }
  });
});
