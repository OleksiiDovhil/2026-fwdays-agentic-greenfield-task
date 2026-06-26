"use client";

// Persistent top bar slot — design.md D7. Shows the product wordmark, an inert
// clock slot (owned by the top-clock slice later), and the theme indicator/
// toggle. The theme control exposes an accessible NAME describing the CURRENT
// theme and the action it performs; activating it flips `data-theme` light<->dark
// (D3, NFR-A11Y-01). All copy comes from `lib/i18n` (no exclamation marks).
import { CloudSun, Moon, Sun } from "lucide-react";
import { TopClock } from "@/components/clock/TopClock";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

export function AppHeader() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // Accessible name = the CURRENT theme + the action the click performs. The
  // action must match the click: when the active theme is light, activating it
  // switches TO dark (and vice-versa). It updates when the theme flips, so
  // assistive tech always announces the current state and the next action (the
  // spec's "indicator reflects the active theme" + "updates to reflect the new
  // theme", NFR-A11Y-01).
  const themeLabel = isDark
    ? `${t("shell.theme.dark")}, ${t("shell.theme.switchToLight")}`
    : `${t("shell.theme.light")}, ${t("shell.theme.switchToDark")}`;

  return (
    <header className="flex w-full items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <CloudSun aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <span className="truncate text-base font-semibold text-foreground sm:text-lg">
          {t("app.name")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Clock slot — filled by the top-clock slice (D7). `TopClock` is the
            live DEVICE-local clock; it owns `data-slot="clock"` and its own
            no-CLS footprint + accessible name. The `sm:` wrapper preserves the
            shell's responsive visibility (hidden on the narrowest viewport). */}
        <div className="hidden sm:block">
          <TopClock />
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label={themeLabel}
          onClick={toggleTheme}
        >
          {isDark ? (
            <Moon aria-hidden="true" className="size-5" />
          ) : (
            <Sun aria-hidden="true" className="size-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
