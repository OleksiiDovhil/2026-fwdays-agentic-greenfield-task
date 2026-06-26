// Footer slot — design.md D7. MANDATORY attribution (BC-BRAND-02): Open-Meteo for
// weather/geocoding data and OpenStreetMap for map tiles, each as a hyperlink. It
// also hosts the jokes slot, filled by the bottom-jokes slice (add-bottom-jokes,
// D5): `<FooterJoke/>` renders one deterministic Ukrainian weather joke per local
// day, or omits the line entirely when the corpus is empty/malformed (D4). All
// copy comes from `lib/i18n` (no exclamation marks). Framework-free of client
// hooks so it renders standalone.
import { t } from "@/lib/i18n";
import { FooterJoke } from "@/components/jokes/FooterJoke";

const OPEN_METEO_URL = "https://open-meteo.com/";
const OSM_URL = "https://www.openstreetmap.org/copyright";

export function AppFooter() {
  return (
    <footer className="mt-auto w-full border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Jokes slot (D5): one deterministic Ukrainian weather joke per local
            day. Omitted entirely when the corpus is empty/malformed (D4). The
            superseded `shell.jokes.placeholder` copy is no longer consumed. */}
        <FooterJoke />

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
