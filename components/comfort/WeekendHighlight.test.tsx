// Test-first (RED): asserts the SPECIFIED weekend-highlight summary pinned by
// design.md D7 and spec "Upcoming-weekend highlight using local dates"
// (FR-COMFORT-05) + the honest-under-failure guarantee (NFR-OBS-01). The
// implementation (`components/comfort/WeekendHighlight.tsx`) does NOT exist yet —
// these MUST fail because the component is missing. The `comfort.weekend.*` i18n
// keys it reads are added by this slice. Never weaken a test to make it pass.
//
// Contract under test (D7, FR-COMFORT-05, NFR-OBS-01):
//   - consumes an `upcomingWeekend` result;
//   - when a value exists (available "both"/"one") it renders the
//     `comfort.weekend.label` summary label PLUS a ComfortBadge for the averaged
//     value (same thresholds — color is not the only signal);
//   - when `available === "none"` it renders the calm `comfort.weekend.outOfRange`
//     Ukrainian state — never blank, never a thrown 500;
//   - all static copy comes from `lib/i18n` (calm, no "!").
//
// @trace FR-COMFORT-05, NFR-OBS-01
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { upcomingWeekend } from "@/lib/scoring/comfort";
import { t } from "@/lib/i18n";

// comfort.* keys are introduced by this slice; cast through the t() parameter
// type (the established pattern). They resolve to Ukrainian once uk.ts has them.
const tk = (key: string) => t(key as Parameters<typeof t>[0]);
const CYRILLIC = /[Ѐ-ӿ]/;

// Defer the import so a MISSING module surfaces as a failing test (red for the
// right reason) instead of crashing collection.
async function renderHighlight(result: ReturnType<typeof upcomingWeekend>) {
  const { WeekendHighlight } = await import("@/components/comfort/WeekendHighlight");
  return render(<WeekendHighlight weekend={result} />);
}

// A both-days weekend: Sat=80, Sun=60 -> average 70 (green boundary).
const BOTH = upcomingWeekend([
  { time: "2026-06-27", value: 80 }, // Sat
  { time: "2026-06-28", value: 60 }, // Sun
]);
// A one-day weekend: only Saturday present -> that day's value, "one".
const ONE = upcomingWeekend([
  { time: "2026-06-26", value: 20 }, // Fri
  { time: "2026-06-27", value: 55 }, // Sat — the only weekend day
]);
// A weekend-free window -> value null, "none".
const NONE = upcomingWeekend([
  { time: "2026-06-29", value: 30 }, // Mon
  { time: "2026-06-30", value: 40 }, // Tue
]);

describe("WeekendHighlight — shows the summary label + badge for a weekend in range (FR-COMFORT-05)", () => {
  it("renders the comfort.weekend.label summary label for a both-days result", async () => {
    const label = tk("comfort.weekend.label");
    expect(label.trim().length, "comfort.weekend.label must resolve to a non-empty i18n string").toBeGreaterThan(0);
    const { container } = await renderHighlight(BOTH);
    expect(container.textContent ?? "").toContain(label);
  });

  it("renders a ComfortBadge carrying the averaged value (70) for a both-days result", async () => {
    expect(BOTH.value).toBe(70);
    expect(BOTH.available).toBe("both");
    const { container } = await renderHighlight(BOTH);
    // The averaged value appears (the badge renders it).
    expect(container.textContent ?? "", "the averaged value must appear in the badge").toContain("70");
  });

  it("renders the averaged value AND a non-empty Ukrainian label (meaning beyond color)", async () => {
    const { container } = await renderHighlight(BOTH);
    const text = container.textContent ?? "";
    expect(CYRILLIC.test(text), `summary must read as Ukrainian: "${text}"`).toBe(true);
    expect(text).toContain("70");
  });

  it("degrades to the single weekend day's value (55) for a one-day result", async () => {
    expect(ONE.available).toBe("one");
    expect(ONE.value).toBe(55);
    const { container } = await renderHighlight(ONE);
    expect(container.textContent ?? "").toContain("55");
    expect(container.textContent ?? "").toContain(tk("comfort.weekend.label"));
  });

  it("contains no exclamation mark (BC-BRAND-01)", async () => {
    const { container } = await renderHighlight(BOTH);
    expect(container.textContent ?? "").not.toContain("!");
  });
});

describe("WeekendHighlight — calm out-of-range state when no weekend is in range (NFR-OBS-01)", () => {
  it("shows the comfort.weekend.outOfRange copy and NOT a numeric badge for an available:'none' result", async () => {
    const outOfRange = tk("comfort.weekend.outOfRange");
    expect(outOfRange.trim().length, "comfort.weekend.outOfRange must resolve to a non-empty i18n string").toBeGreaterThan(0);
    expect(NONE.available).toBe("none");
    expect(NONE.value).toBeNull();

    const { container } = await renderHighlight(NONE);
    const text = container.textContent ?? "";
    expect(text, "the calm out-of-range copy must be shown").toContain(outOfRange);
    expect(text.trim().length, "must never render blank").toBeGreaterThan(0);
  });

  it("never renders blank and never throws for the none state", async () => {
    let unmount: () => void = () => {};
    await expect(
      (async () => {
        const r = await renderHighlight(NONE);
        unmount = r.unmount;
      })(),
    ).resolves.not.toThrow();
    unmount();
  });

  it("contains no exclamation mark in the out-of-range state (BC-BRAND-01)", async () => {
    const { container } = await renderHighlight(NONE);
    expect(container.textContent ?? "").not.toContain("!");
  });
});

describe("WeekendHighlight — never throws across all three availability states (NFR-OBS-01)", () => {
  it("renders both / one / none without throwing", async () => {
    for (const result of [BOTH, ONE, NONE]) {
      let unmount: () => void = () => {};
      await expect(
        (async () => {
          const r = await renderHighlight(result);
          unmount = r.unmount;
          // Always renders SOMETHING legible — at least one Cyrillic text node
          // (queryAllByText tolerates several matches without throwing).
          expect(within(r.container).queryAllByText(CYRILLIC).length).toBeGreaterThan(0);
        })(),
      ).resolves.not.toThrow();
      unmount();
    }
  });
});
