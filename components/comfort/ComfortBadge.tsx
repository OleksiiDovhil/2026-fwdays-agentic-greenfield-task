// Accessible comfort badge — design.md D6, FR-COMFORT-04, NFR-A11Y-01/02.
//
// Reuses the base `components/ui/Badge.tsx` cva primitive (which has no semantic
// green/yellow/red variants) and maps `bandOf(value)` to a token-driven class via
// `cn()`, keyed off the AA-verified comfort band tokens (lib/a11y/palette.ts +
// app/globals.css). It renders BOTH the numeric value AND an accessible Ukrainian
// band label (from `lib/i18n`), so the comfort level is conveyed beyond color
// alone (NFR-A11Y-01). Calm copy, no exclamation marks (BC-BRAND-01).
import { Badge } from "@/components/ui/Badge";
import { bandOf, type ComfortBand } from "@/lib/scoring/comfort";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Per-band token class (background + text), AA-verified for light AND dark. Each
// band yields a DISTINCT, stable class string so the badge's color is driven by
// the same single source of truth the contrast checker guards.
const BAND_CLASS: Record<ComfortBand, string> = {
  green: "bg-comfort-green-bg text-comfort-green-fg",
  yellow: "bg-comfort-yellow-bg text-comfort-yellow-fg",
  red: "bg-comfort-red-bg text-comfort-red-fg",
};

// Static i18n keys per band (typed off the comfort.* namespace).
const BAND_LABEL_KEY = {
  green: "comfort.band.green",
  yellow: "comfort.band.yellow",
  red: "comfort.band.red",
} as const;

const BAND_A11Y_KEY = {
  green: "comfort.a11y.green",
  yellow: "comfort.a11y.yellow",
  red: "comfort.a11y.red",
} as const;

export type ComfortBadgeProps = {
  /** The comfort score (already an integer in 0..100 from `comfortScore`). */
  value: number;
  className?: string;
};

export function ComfortBadge({ value, className }: ComfortBadgeProps) {
  const band = bandOf(value);
  // `t` accepts the typed MessageKey union; the comfort.* keys resolve once the
  // namespace is present (it is, in this slice).
  const label = t(BAND_LABEL_KEY[band] as Parameters<typeof t>[0]);
  const a11y = t(BAND_A11Y_KEY[band] as Parameters<typeof t>[0]);

  // The accessible name pairs the numeric value with the fuller band description
  // so screen-reader users get the level without relying on color.
  const accessibleName = `${a11y}: ${value}`;

  return (
    <Badge
      aria-label={accessibleName}
      className={cn(BAND_CLASS[band], "tabular-nums", className)}
    >
      <span aria-hidden="true">{value}</span>
      <span aria-hidden="true">{label}</span>
    </Badge>
  );
}

export default ComfortBadge;
