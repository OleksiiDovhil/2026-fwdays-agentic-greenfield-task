// Footer slot — design.md D7. MANDATORY attribution (BC-BRAND-02): Open-Meteo for
// weather/geocoding data and OpenStreetMap for map tiles, each as a hyperlink. It
// also hosts an inert jokes slot (owned by the bottom-jokes slice later). All
// copy comes from `lib/i18n` (no exclamation marks). Framework-free of client
// hooks so it renders standalone.
import { t } from "@/lib/i18n";

const OPEN_METEO_URL = "https://open-meteo.com/";
const OSM_URL = "https://www.openstreetmap.org/copyright";

export function AppFooter() {
  return (
    <footer className="mt-auto w-full border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Inert jokes slot — the bottom-jokes slice fills this later. */}
        <p
          data-slot="jokes"
          aria-label={t("shell.jokes.label")}
          className="text-balance"
        >
          {t("shell.jokes.placeholder")}
        </p>

        <p className="text-balance sm:text-right">
          {t("shell.footer.dataCredit")}:{" "}
          <a
            href={OPEN_METEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open-Meteo
          </a>{" "}
          {t("shell.footer.and")} {t("shell.footer.mapCredit").toLowerCase()}{" "}
          <a
            href={OSM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            OpenStreetMap
          </a>
        </p>
      </div>

      <p className="mt-3 text-balance text-xs text-muted-foreground">
        {t("shell.footer.privacy")}
      </p>
    </footer>
  );
}
