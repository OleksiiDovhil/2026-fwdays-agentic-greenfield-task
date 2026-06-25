// First-load empty-state hero slot — design.md D7, FR-SHELL-03. Presents calm
// hero copy and a prominently CENTERED city-search slot as the primary focal
// point. In this slice the search input is an INERT stub (the city-search slice
// fills it later); the slot, its `search` landmark, and the centering exist now
// so downstream only edits this file. All copy comes from `lib/i18n` (no
// exclamation marks, BC-BRAND-01). Framework-free of client hooks so it renders
// standalone (a server component in the page tree).
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
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

      {/* Centered city-search slot — the primary focal point (FR-SHELL-03).
          Inert stub: the real input + suggestions arrive with city-search. */}
      <div
        role="search"
        data-testid="search-slot"
        data-slot="search"
        aria-label={t("shell.search.label")}
        className="mx-auto w-full max-w-md"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            inputSize="lg"
            className="pl-10"
            placeholder={t("shell.search.placeholder")}
            aria-label={t("shell.search.label")}
            // Inert in this slice — the city-search slice wires interactivity.
            readOnly
            disabled
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("shell.search.hint")}
        </p>
      </div>
    </section>
  );
}
