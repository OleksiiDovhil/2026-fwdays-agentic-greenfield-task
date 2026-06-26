"use client";

// Location-aware body that branches the first-load EMPTY state vs the located
// layout (design.md D7, FR-SHELL-03). It reads the already-validated active
// location from `useLocation()` (never re-parsing the URL — spec) and:
//   - no active location  -> renders <SearchHero/> (hero + centered search slot),
//   - an active location   -> hides the hero (the located content takes over).
// The main content REGION carries the responsive grid chain
// `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (FR-SHELL-02, D8) and hosts the
// forecast / map / compare slots filled by later waves — so those slices edit
// their own slot files, never `app/page.tsx` (§3a serialize point).
import { useLocation } from "@/components/providers/LocationProvider";
import { ForecastSection } from "@/components/forecast/ForecastSection";
import { SearchHero } from "@/components/shell/SearchHero";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";

export function ShellContent() {
  const { location } = useLocation();
  const isEmpty = location === null;

  return (
    <>
      {isEmpty ? <SearchHero /> : null}

      <section
        aria-label={t("shell.main.label")}
        className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 pb-12 sm:px-6 md:grid-cols-2 xl:grid-cols-3"
      >
        {isEmpty ? (
          // Deliberate, explained state — never a silently blank region
          // (NFR-OBS-01). Later slices replace these with real content slots.
          <Notice variant="empty" className="md:col-span-2 xl:col-span-3" />
        ) : (
          // Located layout: the forecast slice fills the forecast slot (it may span
          // grid columns for the wider daily grid + chart); map / compare remain
          // inert placeholders owned by later waves.
          <>
            <ForecastSection />
            <div data-slot="map" aria-hidden="true" />
            <div data-slot="compare" aria-hidden="true" />
          </>
        )}
      </section>
    </>
  );
}
