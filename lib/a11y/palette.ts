// Single source-of-truth palette token PAIRS, mirrored as plain data so the
// computational WCAG-AA checker (`lib/a11y/contrast.ts`) needs no DOM
// (design.md D6, NFR-A11Y-02, ADR-0004). Framework-free.
//
// LOCKSTEP WITH `app/globals.css`: every hex below must match the corresponding
// CSS variable in `:root` (light) / `[data-theme="dark"]` (dark). If you change a
// color in `globals.css`, change it here too — the contrast test reads ONLY this
// file, and `npm run build` ships ONLY `globals.css`; drift would let an
// AA-failing color reach users while the test stays green.
//
// What is listed: exactly the pairs that WCAG requires to pass — readable TEXT
// pairs (>= 4.5:1) and meaningful non-text UI pairs (>= 3:1: focus ring and the
// edges of interactive controls). A purely decorative 1px hairline (`--border`)
// is WCAG-exempt and intentionally NOT listed; interactive edges use the
// 3:1-grade `--border-strong` token.

/** `ui: true` marks a large-text / non-text-UI pair (threshold 3:1 instead of 4.5:1). */
export type PalettePair = {
  name: string;
  fg: string;
  bg: string;
  ui?: true;
};

export type Palette = {
  light: PalettePair[];
  dark: PalettePair[];
};

export const palette: Palette = {
  light: [
    // Text (>= 4.5:1)
    { name: "foreground/background", fg: "#1e293b", bg: "#f6f8fb" },
    { name: "foreground/surface", fg: "#1e293b", bg: "#ffffff" },
    { name: "muted-foreground/background", fg: "#475569", bg: "#f6f8fb" },
    { name: "muted-foreground/surface", fg: "#475569", bg: "#ffffff" },
    { name: "primary/surface", fg: "#1d4ed8", bg: "#ffffff" },
    { name: "accent/surface", fg: "#0f766e", bg: "#ffffff" },
    { name: "primary-foreground/primary", fg: "#ffffff", bg: "#1d4ed8" },
    { name: "accent-foreground/accent", fg: "#ffffff", bg: "#0f766e" },
    // UI / large (>= 3:1)
    { name: "ring/background", fg: "#1d4ed8", bg: "#f6f8fb", ui: true },
    { name: "ring/surface", fg: "#1d4ed8", bg: "#ffffff", ui: true },
    { name: "border-strong/background", fg: "#64748b", bg: "#f6f8fb", ui: true },
    { name: "border-strong/surface", fg: "#64748b", bg: "#ffffff", ui: true },
  ],
  dark: [
    // Text (>= 4.5:1)
    { name: "foreground/background", fg: "#e6edf6", bg: "#0b1220" },
    { name: "foreground/surface", fg: "#e6edf6", bg: "#131d2f" },
    { name: "muted-foreground/background", fg: "#9fb0c3", bg: "#0b1220" },
    { name: "muted-foreground/surface", fg: "#9fb0c3", bg: "#131d2f" },
    { name: "primary/surface", fg: "#60a5fa", bg: "#131d2f" },
    { name: "accent/surface", fg: "#2dd4bf", bg: "#131d2f" },
    { name: "primary-foreground/primary", fg: "#0b1220", bg: "#60a5fa" },
    { name: "accent-foreground/accent", fg: "#0b1220", bg: "#2dd4bf" },
    // UI / large (>= 3:1)
    { name: "ring/background", fg: "#7cb3fb", bg: "#0b1220", ui: true },
    { name: "ring/surface", fg: "#7cb3fb", bg: "#131d2f", ui: true },
    { name: "border-strong/background", fg: "#5b6f8a", bg: "#0b1220", ui: true },
    { name: "border-strong/surface", fg: "#5b6f8a", bg: "#131d2f", ui: true },
  ],
};

export default palette;
