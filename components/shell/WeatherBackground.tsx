// Animated-background slot — design.md D7, FR-ANIM-*. INERT in this slice: a
// fixed, decorative, non-interactive layer that NEVER intercepts clicks
// (`pointer-events: none`, FR-ANIM-04) and is hidden from assistive tech. The
// weather-background slice fills it later (honoring `prefers-reduced-motion`,
// FR-ANIM-03, and the active location's day/night, FR-ANIM-02).
import { t } from "@/lib/i18n";

export function WeatherBackground() {
  return (
    <div
      data-slot="weather-background"
      aria-hidden="true"
      role="presentation"
      aria-label={t("shell.background.label")}
      className="pointer-events-none fixed inset-0 -z-10 bg-background"
    />
  );
}
