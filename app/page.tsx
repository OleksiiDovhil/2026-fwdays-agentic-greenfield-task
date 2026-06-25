// Single-page shell — design.md D7, FR-SHELL-01/02/03. A THIN server component
// that composes the NAMED slot components so later waves edit their own slot file
// (or module), never this page (§3a serialize point):
//   - <WeatherBackground/> — decorative, non-interactive background slot,
//   - <AppHeader/>        — logo + theme indicator/toggle + clock slot,
//   - <ShellContent/>     — the location-aware body: the first-load empty state
//                            (<SearchHero/> hero + centered search) when there is
//                            no active location, plus the responsive main content
//                            region (forecast/map/compare slots),
//   - <AppFooter/>        — Open-Meteo + OpenStreetMap credits + jokes slot.
// The empty state is always honest: hero copy + a centered search are shown, the
// screen is never blank (NFR-OBS-01).
import { AppFooter } from "@/components/shell/AppFooter";
import { AppHeader } from "@/components/shell/AppHeader";
import { ShellContent } from "@/components/shell/ShellContent";
import { WeatherBackground } from "@/components/shell/WeatherBackground";

export default function Home() {
  return (
    <>
      <WeatherBackground />
      <div className="flex min-h-svh flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col">
          <ShellContent />
        </main>
        <AppFooter />
      </div>
    </>
  );
}
