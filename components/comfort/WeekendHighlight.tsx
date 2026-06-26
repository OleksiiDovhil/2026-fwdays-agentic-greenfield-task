// Upcoming-weekend highlight summary — design.md D7, FR-COMFORT-05, NFR-OBS-01.
//
// Consumes a pure `upcomingWeekend(days)` result (the selection math lives in
// framework-free lib/scoring/comfort.ts). When a weekend value is available
// (available "both" or "one") it renders the `comfort.weekend.label` summary
// label plus a ComfortBadge for the averaged value — the SAME band thresholds, so
// the comfort level is conveyed beyond color (NFR-A11Y-01). When no weekend day
// is in range (available "none" / value null) it renders the calm
// `comfort.weekend.outOfRange` Ukrainian state — never blank, never a thrown 500
// (NFR-OBS-01). All static copy comes from lib/i18n (calm, no "!").
//
// This slice ships the component + logic only; the forecast slice positions it at
// the TOP of the grid (it does not edit app/page.tsx).
import { ComfortBadge } from "@/components/comfort/ComfortBadge";
import type { UpcomingWeekend } from "@/lib/scoring/comfort";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type WeekendHighlightProps = {
  /** The pure selector result; the component renders, never recomputes. */
  weekend: UpcomingWeekend;
  className?: string;
};

export function WeekendHighlight({ weekend, className }: WeekendHighlightProps) {
  const label = t("comfort.weekend.label");
  const hasValue = weekend.value !== null && weekend.available !== "none";

  return (
    <section
      aria-label={label}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3",
        className,
      )}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hasValue ? (
        <ComfortBadge value={weekend.value as number} />
      ) : (
        // Calm out-of-range state (never an error toast / raw 500).
        <span role="status" className="text-sm text-muted-foreground">
          {t("comfort.weekend.outOfRange")}
        </span>
      )}
    </section>
  );
}

export default WeekendHighlight;
