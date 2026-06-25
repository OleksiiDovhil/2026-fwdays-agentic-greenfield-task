// Computational WCAG-AA contrast verification — design.md D6, NFR-A11Y-02,
// ADR-0004. This is how AA is checked WITHOUT a browser. Framework-free, no DOM.
import { palette, type PalettePair } from "./palette";

/** Parse a `#rgb` or `#rrggbb` hex string into 8-bit r/g/b channels. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const int = Number.parseInt(h, 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

/** Linearize one sRGB channel (0–255) per the WCAG relative-luminance formula. */
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/**
 * WCAG contrast ratio between a foreground and a background color, in `[1, 21]`.
 * Symmetric: `contrastRatio(a, b) === contrastRatio(b, a)`. Black on white ≈ 21,
 * any color against itself = 1.
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA thresholds: 3:1 for large text / non-text UI, 4.5:1 for normal text. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** A pair that failed its AA threshold, with the measured ratio for reporting. */
export type ContrastFailure = {
  theme: "light" | "dark";
  name: string;
  fg: string;
  bg: string;
  ratio: number;
  threshold: number;
};

export type PaletteCheckResult = {
  ok: boolean;
  failures: ContrastFailure[];
};

function thresholdFor(pair: PalettePair): number {
  return pair.ui ? AA_LARGE : AA_NORMAL;
}

/**
 * Verify every foreground/background token pair in `lib/a11y/palette.ts` clears
 * its AA threshold in BOTH light and dark. Returns `{ ok, failures }`; `ok` is
 * true only when `failures` is empty.
 */
export function checkPalette(): PaletteCheckResult {
  const failures: ContrastFailure[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const pair of palette[theme]) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      const threshold = thresholdFor(pair);
      if (ratio < threshold) {
        failures.push({
          theme,
          name: pair.name,
          fg: pair.fg,
          bg: pair.bg,
          ratio,
          threshold,
        });
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
