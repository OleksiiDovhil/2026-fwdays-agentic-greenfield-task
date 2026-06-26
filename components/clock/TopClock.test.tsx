// Test-first (RED): asserts the SPECIFIED behavior of the live header clock pinned
// by design.md D1-D5 and the `top-clock` spec (Live local-time display, Accessible
// name and screen-reader behavior, No layout shift while ticking, Client-only
// resilient rendering). The implementation (`components/clock/TopClock.tsx`) and the
// pure `lib/clock/format.ts` it depends on do NOT exist yet — these MUST fail
// because the module is missing / the behavior is unimplemented, NOT because the
// assertions are weak. Never weaken a test to make it pass.
//
// The `clock.*` i18n keys this widget reads (clock.label) are added by THIS slice
// and are not yet in the typed `MessageKey` union, so they are referenced through
// the established `as never` cast (mirroring lib/i18n/i18n.test.ts). Until uk.ts
// gains the namespace they degrade to "" — so the accessible-name test also asserts
// the i18n key itself resolves to a non-empty Cyrillic string (it must, once added).
//
// Contracts under test:
//   - Mount-gate / no hydration flash (D2, NFR-OBS-01): first render shows the
//     reserved fixed-width placeholder (NO live time); after effects flush, the
//     canonical HH:MM:SS device time fills the SAME slot.
//   - Live tick (D1, FR-CLOCK-01): advancing fake timers by ~1s advances the digits;
//     re-setting the system clock and ticking RESYNCS (re-reads new Date(), not a
//     counter).
//   - Accessible name, quiet status (D4, NFR-A11Y-01): a Ukrainian aria-label is
//     present; the ticking node carries NO aria-live region.
//   - No-CLS footprint (D3, NFR-PERF-02): tabular-nums + a fixed min-width on the
//     time slot, and the pre-hydration placeholder reserves the SAME footprint.
//   - Timer cleanup (D1, NFR-OBS-01): unmount clears the interval; no further tick,
//     no "update on unmounted component" warning.
//   - Console silence (NFR-OBS-01): no console.error / console.warn during
//     mount / tick / unmount (no hydration warning).
//
// @trace FR-CLOCK-01, NFR-A11Y-01, NFR-PERF-02, NFR-OBS-01, BC-BRAND-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { t } from "@/lib/i18n";

// `clock.*` is introduced by this slice and not yet in the typed key union — use
// the established `as never` cast (lib/i18n/i18n.test.ts, ComfortBadge.test.tsx).
const clockLabel = () => t("clock.label" as never);

const CYRILLIC = /[Ѐ-ӿ]/;
// Canonical 24h HH:MM:SS — the only shape that may appear once mounted.
const HHMMSS = /\b([0-1]\d|2[0-3]):[0-5]\d:[0-5]\d\b/;

// A fixed, known instant. `new Date(2026, 0, 15, 14, 5, 30)` is LOCAL wall-clock
// time, so the expected digits are time-zone-independent: 14:05:30 local.
const at = (h: number, mi: number, s: number): Date =>
  new Date(2026, 0, 15, h, mi, s, 0);

// Defer the import so a MISSING module surfaces as a failing test (red for the
// right reason) instead of crashing collection. Renders under fake timers; the
// initial render + effect flush are wrapped in act() so React's mount effects
// (the mount-gate flip + interval start) run deterministically.
async function renderClock(): Promise<RenderResult> {
  const { TopClock } = await import("@/components/clock/TopClock");
  let result!: RenderResult;
  await act(async () => {
    result = render(<TopClock />);
  });
  return result;
}

// The widget's root element (it must be the single rendered node).
const rootOf = (r: RenderResult): HTMLElement =>
  r.container.firstElementChild as HTMLElement;

// Visible text of the whole widget, trimmed.
const textOf = (r: RenderResult): string => (r.container.textContent ?? "").trim();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(14, 5, 30));
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TopClock — reflects the visitor device, not the active weather location (FR-CLOCK-01)", () => {
  it("renders the device time standalone (no LocationProvider) — no useLocation dependency", async () => {
    // The clock shows the visitor's DEVICE clock and must not depend on the active
    // weather location. Rendered with no LocationProvider in the tree it still shows
    // the device-set time; if it consumed useLocation() it would throw here (no
    // provider). A clean render of the device time is the proof of independence.
    const r = await renderClock();
    expect(textOf(r)).toContain("14:05:30");
  });
});

describe("TopClock — mount-gate: no hydration flash (D2, NFR-OBS-01)", () => {
  it("first paint shows the reserved placeholder, NOT a live time", async () => {
    // Render WITHOUT flushing effects: the mount-gate is still false, so the very
    // first client render must equal the server render — a reserved slot with no
    // ticking digits (otherwise server↔client markup would diverge => hydration warn).
    const { TopClock } = await import("@/components/clock/TopClock");
    // Render synchronously; React 19 still runs passive effects async, but we read
    // the container before advancing timers / flushing, capturing the pre-mount paint.
    const r = render(<TopClock />);
    const firstPaint = (r.container.textContent ?? "").trim();
    expect(
      HHMMSS.test(firstPaint),
      `pre-hydration paint must NOT contain a live HH:MM:SS time, got: "${firstPaint}"`,
    ).toBe(false);
    // The widget still renders SOME element (the reserved slot), not null.
    expect(r.container.firstElementChild, "placeholder slot must render").not.toBeNull();
    // Flush so afterEach cleanup is tidy.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("after mount/effects flush, the formatted device time appears in the slot", async () => {
    const r = await renderClock();
    const shown = textOf(r);
    expect(HHMMSS.test(shown), `mounted clock must show HH:MM:SS, got: "${shown}"`).toBe(true);
    // It is the DEVICE time we set, not a server/placeholder value.
    expect(shown).toContain("14:05:30");
  });
});

describe("TopClock — live tick & resync (D1, FR-CLOCK-01)", () => {
  it("advances the displayed time once per second", async () => {
    const r = await renderClock();
    expect(textOf(r)).toContain("14:05:30");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(textOf(r)).toContain("14:05:31");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(textOf(r)).toContain("14:05:32");
  });

  it("RESYNCS to the true current time after a clock jump (re-reads Date, not a counter)", async () => {
    const r = await renderClock();
    expect(textOf(r)).toContain("14:05:30");

    // Simulate the tab being backgrounded / the system clock jumping forward: the
    // wall clock is now far ahead, but only ONE interval has elapsed. A counter-based
    // clock would show 14:05:31; a Date-re-reading clock jumps to the real time.
    vi.setSystemTime(at(16, 30, 0));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const shown = textOf(r);
    // advanceTimersByTime(1000) also advances the mocked clock by 1s, so the tick
    // re-reads 16:30:01 (the resync target), not 16:30:00 — and crucially not the
    // counter value 14:05:31.
    expect(shown).toContain("16:30:01");
    expect(shown).not.toContain("14:05:31");
  });
});

describe("TopClock — accessible name, quiet status (D4, NFR-A11Y-01, BC-BRAND-01)", () => {
  it("exposes a non-empty Ukrainian accessible name (aria-label) for the clock", async () => {
    const r = await renderClock();
    const labelled =
      r.container.querySelector("[aria-label]") as HTMLElement | null;
    expect(labelled, "the clock must carry an aria-label").not.toBeNull();
    const name = labelled?.getAttribute("aria-label") ?? "";
    expect(name.trim().length, "accessible name must be non-empty").toBeGreaterThan(0);
    expect(CYRILLIC.test(name), `accessible name must be Ukrainian: "${name}"`).toBe(true);
    expect(name).not.toContain("!");
  });

  it("the accessible name is sourced from clock.label in lib/i18n (not hardcoded)", async () => {
    // Once the clock.* namespace ships, clock.label resolves to a non-empty Cyrillic
    // string and the rendered aria-label must equal / contain it (centralized copy).
    const label = clockLabel();
    expect(
      label.trim().length,
      "clock.label must resolve to a non-empty i18n string once the namespace is added",
    ).toBeGreaterThan(0);
    const r = await renderClock();
    const labelled = r.container.querySelector("[aria-label]") as HTMLElement | null;
    expect(labelled?.getAttribute("aria-label") ?? "").toContain(label);
  });

  it("the ticking time node carries NO aria-live region (no per-second SR flooding)", async () => {
    const r = await renderClock();
    // No element anywhere in the widget may be a polite/assertive live region, and
    // no role=timer live region — per-second updates must not be announced.
    const live = r.container.querySelector('[aria-live="polite"], [aria-live="assertive"]');
    expect(live, "the per-second tick must NOT be an aria-live region").toBeNull();
    // The text that holds the live digits in particular must not be aria-live.
    const root = rootOf(r);
    expect(root.getAttribute("aria-live")).toBeNull();
  });
});

describe("TopClock — no-CLS footprint: tabular-nums + fixed min-width (D3, NFR-PERF-02)", () => {
  // jsdom cannot measure pixel widths, so we assert the no-CLS MECHANISM is present:
  // (1) tabular numerals so every glyph has equal advance, and (2) a fixed min-width
  // sized to the 8-char HH:MM:SS string. Tailwind classes (`tabular-nums`, a
  // `min-w-*`) or inline style both satisfy the contract — accept either.
  const hasTabularNums = (el: HTMLElement): boolean =>
    /tabular-nums/.test(el.className) ||
    el.style.fontVariantNumeric.includes("tabular-nums") ||
    // querySelector for a descendant carrying it
    el.querySelector('[class*="tabular-nums"]') !== null ||
    el.querySelector('[style*="tabular-nums"]') !== null;

  const hasFixedWidth = (el: HTMLElement): boolean => {
    const selfMinW = /\bmin-w(?:idth)?-/.test(el.className) || el.style.minWidth !== "";
    const descMinW =
      el.querySelector('[class*="min-w-"]') !== null ||
      el.querySelector('[style*="min-width"]') !== null;
    return selfMinW || descMinW;
  };

  it("the mounted time slot uses tabular-nums (equal-advance digits)", async () => {
    const r = await renderClock();
    expect(
      hasTabularNums(rootOf(r)),
      "the time node must carry tabular-nums so changing digits cannot change width",
    ).toBe(true);
  });

  it("the mounted time slot reserves a fixed min-width sized to HH:MM:SS", async () => {
    const r = await renderClock();
    expect(
      hasFixedWidth(rootOf(r)),
      "the clock container must reserve a fixed min-width (no CLS as digits change)",
    ).toBe(true);
  });

  it("the pre-hydration placeholder reserves the SAME footprint (tabular-nums + min-width)", async () => {
    // Capture the PRE-mount paint (placeholder) and assert it carries the same
    // no-CLS affordances, so filling in the time later cannot shift the header.
    const { TopClock } = await import("@/components/clock/TopClock");
    const r = render(<TopClock />);
    const placeholder = r.container.firstElementChild as HTMLElement;
    expect(placeholder, "placeholder slot must render before mount").not.toBeNull();
    expect(
      hasTabularNums(placeholder),
      "placeholder must reserve the tabular-nums footprint",
    ).toBe(true);
    expect(
      hasFixedWidth(placeholder),
      "placeholder must reserve the same fixed min-width as the live time",
    ).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe("TopClock — timer cleanup on unmount (D1, NFR-OBS-01)", () => {
  it("clears the interval on unmount", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const r = await renderClock();
    act(() => {
      r.unmount();
    });
    expect(clearSpy, "unmount must clearInterval the per-second tick").toHaveBeenCalled();
  });

  it("fires NO further update after unmount (no orphan tick)", async () => {
    const r = await renderClock();
    expect(textOf(r)).toContain("14:05:30");
    act(() => {
      r.unmount();
    });
    // Move the wall clock far ahead and run the timer queue; nothing should update
    // (the component is gone) and nothing should throw.
    vi.setSystemTime(at(18, 0, 0));
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(5000);
      }),
    ).not.toThrow();
    // The (unmounted) container is empty — the old time certainly didn't re-render.
    expect((r.container.textContent ?? "").trim()).toBe("");
  });
});

describe("TopClock — console silence on a healthy session (NFR-OBS-01)", () => {
  it("logs no console.error / console.warn during mount, tick, and unmount", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await renderClock(); // mount (hydration-safe path, no mismatch warn)
    await act(async () => {
      vi.advanceTimersByTime(1000); // tick
    });
    act(() => {
      r.unmount(); // cleanup (no update-on-unmounted warning)
    });

    expect(
      errSpy,
      `console.error called: ${errSpy.mock.calls.map((c) => String(c[0])).join(" | ")}`,
    ).not.toHaveBeenCalled();
    expect(
      warnSpy,
      `console.warn called: ${warnSpy.mock.calls.map((c) => String(c[0])).join(" | ")}`,
    ).not.toHaveBeenCalled();
  });
});
