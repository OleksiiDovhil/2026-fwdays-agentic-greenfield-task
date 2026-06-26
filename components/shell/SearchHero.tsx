// First-load empty-state hero slot — design.md D7, FR-SHELL-03. Presents calm
// hero copy and a prominently CENTERED city-search slot as the primary focal
// point. The city-search slice (add-city-search, D7) fills the slot with the real
// interactive <SearchBox/>; the slot's `search` landmark and centering exist here
// so downstream only edits this file (NOT the shared app/page.tsx serialize
// point, §3a). Hero copy comes from `lib/i18n` (no exclamation marks, BC-BRAND-01).
import { SearchBox } from "@/components/search/SearchBox";
import { t } from "@/lib/i18n";

export function SearchHero() {
  return (
    <section className="flex w-full flex-col items-center gap-6 px-4 py-12 text-center sm:py-16">
      <div className="flex max-w-2xl flex-col items-center gap-3">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("shell.hero.title")}
        </h1>
        <p className="text-balance text-base text-muted-foreground sm:text-lg">
          {t("shell.hero.subtitle")}
        </p>
      </div>

      {/* Centered city-search slot — the primary focal point (FR-SHELL-03). The
          real <SearchBox/> (city-search, D7) renders the interactive combobox,
          its suggestion listbox, the "Use my location" button, and the inline
          Notice states within this centered column. The `search` landmark, the
          `search-slot` test id, and the centering are preserved from the shell. */}
      <div
        role="search"
        data-testid="search-slot"
        data-slot="search"
        aria-label={t("search.label")}
        className="mx-auto w-full max-w-md"
      >
        <SearchBox />
      </div>
    </section>
  );
}
