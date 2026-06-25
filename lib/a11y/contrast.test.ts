// Test-first (red): asserts the SPECIFIED computational WCAG-AA contrast check
// pinned by design.md D6 + spec "Accessibility and contrast across themes"
// (NFR-A11Y-02). This is how AA is verified WITHOUT a browser (ADR-0004).
// Implementation (`lib/a11y/contrast.ts`, `lib/a11y/palette.ts`) does not exist
// yet — these MUST fail because the modules are missing.
//
// Contract under test:
//   - `contrastRatio(fg, bg)` implements the WCAG relative-luminance ratio:
//     black/white ≈ 21:1, any color against itself = 1:1, and it is symmetric.
//   - Every fg/bg token pair in `lib/a11y/palette.ts` clears its threshold —
//     ≥ 4.5:1 for normal text, ≥ 3:1 for large text / UI — in BOTH light and
//     dark, surfaced by `checkPalette()`.
//
// @trace NFR-A11Y-02
import { describe, it, expect } from "vitest";
import { contrastRatio, checkPalette } from "@/lib/a11y/contrast";
import { palette } from "@/lib/a11y/palette";

describe("lib/a11y/contrast — contrastRatio (WCAG relative luminance)", () => {
  it("returns ~21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns ~21:1 for white on black (symmetric)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("returns exactly 1:1 for a color against itself", () => {
    expect(contrastRatio("#000000", "#000000")).toBeCloseTo(1, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#6b7280", "#6b7280")).toBeCloseTo(1, 5);
  });

  it("is order-independent (ratio(a,b) === ratio(b,a))", () => {
    const a = "#1f2937";
    const b = "#f9fafb";
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });

  it("matches a known mid-contrast reference (#767676 on white ≈ 4.54)", () => {
    // #767676 on #ffffff is the canonical WCAG AA borderline for normal text.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
});

// Normalize whatever shape palette/checkPalette expose into a flat list of
// { theme, name, fg, bg, large } so the AA thresholds can be asserted directly
// off the single source-of-truth tokens (D6) regardless of nesting choices.
type Pair = { theme: string; name?: string; fg: string; bg: string; large?: boolean };

function collectPairs(node: unknown, theme = ""): Pair[] {
  if (Array.isArray(node)) {
    return node.flatMap((n) => collectPairs(n, theme));
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.fg === "string" && typeof obj.bg === "string") {
      return [
        {
          theme,
          name: typeof obj.name === "string" ? obj.name : undefined,
          fg: obj.fg,
          bg: obj.bg,
          large: obj.large === true || obj.ui === true,
        },
      ];
    }
    return Object.entries(obj).flatMap(([k, v]) =>
      collectPairs(v, theme || (k === "light" || k === "dark" ? k : theme)),
    );
  }
  return [];
}

describe("lib/a11y/palette — token pairs cover both themes", () => {
  it("exposes fg/bg pairs for the light theme", () => {
    const light = collectPairs(palette).filter((p) => p.theme === "light");
    expect(light.length).toBeGreaterThan(0);
  });

  it("exposes fg/bg pairs for the dark theme", () => {
    const dark = collectPairs(palette).filter((p) => p.theme === "dark");
    expect(dark.length).toBeGreaterThan(0);
  });
});

describe("lib/a11y/contrast — every palette pair clears AA in both themes", () => {
  it("each fg/bg pair meets ≥ 4.5:1 (normal) or ≥ 3:1 (large/UI)", () => {
    const pairs = collectPairs(palette);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      const ratio = contrastRatio(p.fg, p.bg);
      const threshold = p.large ? 3 : 4.5;
      expect(
        ratio,
        `${p.theme}/${p.name ?? `${p.fg} on ${p.bg}`} = ${ratio.toFixed(2)}:1 (need ≥ ${threshold})`,
      ).toBeGreaterThanOrEqual(threshold);
    }
  });

  it("checkPalette() reports an overall pass with no failing pairs", () => {
    const result = checkPalette();
    // Tolerate a boolean result or a structured { ok, failures } report.
    const ok = typeof result === "boolean" ? result : (result as { ok: boolean }).ok;
    const failures =
      typeof result === "boolean"
        ? []
        : ((result as { failures?: unknown[] }).failures ?? []);
    expect(failures).toHaveLength(0);
    expect(ok).toBe(true);
  });
});
