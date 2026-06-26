// Test-first (RED): asserts the SPECIFIED accessible comfort badge pinned by
// design.md D6 and spec "Comfort badge color thresholds" (esp. "Badge meaning is
// conveyed beyond color"). The implementation
// (`components/comfort/ComfortBadge.tsx`) does NOT exist yet — these MUST fail
// because the component is missing. The `comfort.*` i18n keys it reads are also
// added by this slice, so the label resolves once both land. Never weaken a test.
//
// Contract under test (D6, FR-COMFORT-04, NFR-A11Y-01):
//   - renders the numeric `value` AND an accessible Ukrainian band label;
//   - maps `bandOf(value)` to a distinct green/yellow/red token-driven class
//     (70/69/40/39 land on green/yellow/yellow/red);
//   - conveys level BEYOND color alone — the value and/or label appear in the
//     accessible name, and the static label comes from `lib/i18n` (calm, no "!").
//
// @trace FR-COMFORT-04, NFR-A11Y-01
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { t } from "@/lib/i18n";

// `comfort.*` keys are introduced by this slice and are not yet in the typed
// `MessageKey` union, so cast through `never` (the established pattern in
// lib/i18n/i18n.test.ts). Once uk.ts gains the namespace these resolve to the
// Ukrainian labels; until then they degrade to "" — so the tests assert the
// rendered label directly (non-empty Cyrillic) rather than trusting an empty key.
const bandLabel = (band: "green" | "yellow" | "red") => t(`comfort.band.${band}` as never);
const CYRILLIC = /[Ѐ-ӿ]/;

// Defer the import so a MISSING module surfaces as a failing test (red for the
// right reason) instead of crashing collection.
async function renderBadge(value: number) {
  const { ComfortBadge } = await import("@/components/comfort/ComfortBadge");
  return render(<ComfortBadge value={value} />);
}

describe("ComfortBadge — renders the numeric value (FR-COMFORT-04)", () => {
  it("shows the score number in the badge", async () => {
    const { container } = await renderBadge(82);
    expect(container.textContent ?? "").toContain("82");
  });

  it("renders a value at every band boundary (70/69/40/39) including the number", async () => {
    for (const value of [70, 69, 40, 39]) {
      const { container, unmount } = await renderBadge(value);
      expect(container.textContent ?? "", `value ${value} must appear`).toContain(String(value));
      unmount();
    }
  });
});

describe("ComfortBadge — accessible Ukrainian label, meaning beyond color (NFR-A11Y-01)", () => {
  it("exposes an accessible name that includes the numeric value (color is not the only signal)", async () => {
    const { container } = await renderBadge(82);
    const el = container.firstElementChild as HTMLElement | null;
    expect(el, "badge must render an element").not.toBeNull();
    const accessibleName =
      (el?.getAttribute("aria-label") ?? "") + " " + (el?.textContent ?? "");
    expect(accessibleName).toContain("82");
  });

  it("renders a non-empty Ukrainian (Cyrillic) band label, not color alone", async () => {
    const { container } = await renderBadge(82);
    const text =
      (container.firstElementChild?.getAttribute("aria-label") ?? "") +
      " " +
      (container.textContent ?? "");
    expect(text.trim().length, "badge must carry a textual label").toBeGreaterThan(0);
    expect(CYRILLIC.test(text), `badge label must be Ukrainian: "${text}"`).toBe(true);
  });

  it("the static band label is sourced from lib/i18n (comfort.band.green)", async () => {
    // Once the comfort.* namespace exists, the green badge's accessible text must
    // contain the i18n-sourced green label — proving the label is centralized, not
    // hardcoded (NFR-I18N-01).
    const label = bandLabel("green");
    expect(label.trim().length, "comfort.band.green must resolve to a non-empty i18n string").toBeGreaterThan(0);
    const { container } = await renderBadge(82);
    const text =
      (container.firstElementChild?.getAttribute("aria-label") ?? "") +
      " " +
      (container.textContent ?? "");
    expect(text).toContain(label);
  });

  it("contains no exclamation mark (BC-BRAND-01)", async () => {
    const { container } = await renderBadge(82);
    expect(container.textContent ?? "").not.toContain("!");
    expect(container.firstElementChild?.getAttribute("aria-label") ?? "").not.toContain("!");
  });
});

describe("ComfortBadge — distinct green/yellow/red variant per band (FR-COMFORT-04)", () => {
  // The class is token-driven (design D6: base badgeVariants has no semantic color
  // variants; the badge maps each band to a class via cn()). We assert the three
  // bands produce DISTINCT class strings and that boundary values land in the
  // right band's class, without pinning the exact Tailwind token names.
  async function classOf(value: number): Promise<string> {
    const { container, unmount } = await renderBadge(value);
    const cls = (container.firstElementChild as HTMLElement | null)?.className ?? "";
    unmount();
    return cls;
  }

  it("green (82), yellow (55), and red (20) render three DISTINCT class strings", async () => {
    const green = await classOf(82);
    const yellow = await classOf(55);
    const red = await classOf(20);
    expect(green).not.toBe(yellow);
    expect(yellow).not.toBe(red);
    expect(green).not.toBe(red);
    expect(green.length).toBeGreaterThan(0);
  });

  it("boundary 70 matches the green class and 69 matches the yellow class", async () => {
    const seventy = await classOf(70);
    const sixtyNine = await classOf(69);
    const knownGreen = await classOf(85);
    const knownYellow = await classOf(55);
    expect(seventy).toBe(knownGreen);
    expect(sixtyNine).toBe(knownYellow);
    expect(seventy).not.toBe(sixtyNine);
  });

  it("boundary 40 matches the yellow class and 39 matches the red class", async () => {
    const forty = await classOf(40);
    const thirtyNine = await classOf(39);
    const knownYellow = await classOf(55);
    const knownRed = await classOf(10);
    expect(forty).toBe(knownYellow);
    expect(thirtyNine).toBe(knownRed);
    expect(forty).not.toBe(thirtyNine);
  });
});

describe("ComfortBadge — labels distinguish the bands (NFR-A11Y-01)", () => {
  it("green, yellow, and red badges carry DIFFERENT Ukrainian labels (level survives without color)", async () => {
    const textOf = async (value: number) => {
      const { container, unmount } = await renderBadge(value);
      const txt =
        (container.firstElementChild?.getAttribute("aria-label") ?? "") +
        " " +
        (container.textContent ?? "");
      unmount();
      // Strip the numeric value so we compare the textual band label only.
      return txt.replace(/\d+/g, "").trim();
    };
    const green = await textOf(82);
    const yellow = await textOf(55);
    const red = await textOf(20);
    expect(green).not.toBe(yellow);
    expect(yellow).not.toBe(red);
    expect(green).not.toBe(red);
  });
});

// A focused render-smoke: the badge never throws for the boundary set (NFR-OBS-01).
describe("ComfortBadge — never throws across the boundary set", () => {
  it("renders 0, 39, 40, 69, 70, 100 without throwing", async () => {
    for (const value of [0, 39, 40, 69, 70, 100]) {
      let unmount: () => void = () => {};
      await expect(
        (async () => {
          const r = await renderBadge(value);
          unmount = r.unmount;
        })(),
      ).resolves.not.toThrow();
      unmount();
    }
  });

  it("the rendered badge element contains its value text within itself", async () => {
    const { container } = await renderBadge(73);
    const el = container.firstElementChild as HTMLElement;
    expect(within(el).queryByText(/73/)).not.toBeNull();
  });
});
