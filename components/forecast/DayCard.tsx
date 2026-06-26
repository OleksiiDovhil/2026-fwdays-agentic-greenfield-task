// A single forecast day card — design.md D3/D4, FR-FORECAST-02, NFR-I18N-01,
// NFR-A11Y-01. Renders one day: the Ukrainian weekday label (from the local `time`
// date via the fixed-Date.UTC parse, never the viewer's clock), hi/lo in °C, the
// weather icon + UA condition label (from `describeWeather` + `t(labelKey)`),
// precipitation probability %, wind in m/s, and a comfort-score `ComfortBadge` for
// the day.
//
// Number formatting is TOTAL (FR-FORECAST-02): temperatures + wind round to a whole
// number (round half away from zero) via the pure `roundAwayFromZero`, with the
// minus glyph + unit labels resolved from `forecast.*` (never hardcoded). A present
// precip `0` → "0%"; an absent precip → the neutral `forecast.precipPlaceholder`
// ("—"), distinct from "0%". An extreme value rounds + renders without overflow, no
// throw, no console warning. All copy comes from `forecast.*` (no exclamation
// marks, BC-BRAND-01).
import * as Icons from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { ComfortBadge } from "@/components/comfort/ComfortBadge";
import { Card } from "@/components/ui/Card";
import { describeWeather } from "@/lib/forecast/weather-code";
import { roundAwayFromZero, localWeekday } from "@/lib/forecast/format";
import { toComfortInput, type DailyForecast } from "@/lib/forecast/types";
import { comfortScore } from "@/lib/scoring/comfort";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type DayCardProps = {
  /** The validated forecast day to render. */
  day: DailyForecast;
  /** The day's comfort value (precomputed by the section to avoid double work). If
   *  omitted, the card computes it from `comfortScore(toComfortInput(day))`. */
  comfortValue?: number;
  className?: string;
};

// Render a lucide-react icon by NAME (from `describeWeather`). The pure lib stays
// DOM-free by returning a name; this module-scope component maps it to the icon,
// defaulting to a generic icon if a name is ever unrecognised (never a blank / a
// throw). Defined at module scope (not created during render) so it is a stable
// component identity (react-hooks/static-components).
function WeatherIcon({ name, ...props }: { name: string } & LucideProps) {
  const map = Icons as unknown as Record<string, LucideIcon>;
  const Icon = map[name] ?? Icons.CloudSun;
  return <Icon {...props} />;
}

/** Format a temperature to a whole °C with the i18n minus glyph; `null` → "—". */
function formatTemp(value: number | null): string {
  const rounded = roundAwayFromZero(value);
  if (rounded === null) return t("forecast.precipPlaceholder");
  const celsius = t("forecast.unit.celsius");
  if (rounded < 0) return `${t("forecast.minus")}${Math.abs(rounded)}${celsius}`;
  return `${rounded}${celsius}`;
}

/** Format a wind speed to a whole m/s with the i18n unit label; `null` → "—". */
function formatWind(value: number | null): string {
  const rounded = roundAwayFromZero(value);
  if (rounded === null) return t("forecast.precipPlaceholder");
  // Wind is non-negative; show the magnitude with the i18n m/s label.
  return `${rounded} ${t("forecast.unit.wind")}`;
}

/** Format a precipitation probability: a present value → "N%"; `null` → "—". */
function formatPrecip(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return t("forecast.precipPlaceholder");
  }
  return `${roundAwayFromZero(value) ?? 0}${t("forecast.unit.percent")}`;
}

export function DayCard({ day, comfortValue, className }: DayCardProps) {
  const weather = describeWeather(day.weatherCode);
  const conditionLabel = t(weather.labelKey as Parameters<typeof t>[0]);

  const weekday = localWeekday(day.time);
  const weekdayLabel =
    weekday !== null
      ? t(`forecast.weekday.${weekday}` as Parameters<typeof t>[0])
      : "";

  const value =
    comfortValue ?? comfortScore(toComfortInput(day)).value;

  return (
    <Card
      data-slot="day-card"
      padded={false}
      className={cn("flex flex-col gap-2 p-4", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{weekdayLabel}</span>
        <ComfortBadge value={value} />
      </div>

      <div className="flex items-center gap-2">
        <WeatherIcon
          name={weather.icon}
          aria-hidden="true"
          className="size-6 shrink-0 text-muted-foreground"
        />
        <span className="text-sm text-muted-foreground">{conditionLabel}</span>
      </div>

      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-lg font-semibold text-foreground">
          {formatTemp(day.tempMax)}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatTemp(day.tempMin)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground tabular-nums">
        <span>{formatPrecip(day.precipProbability)}</span>
        <span>{formatWind(day.windMax)}</span>
      </div>
    </Card>
  );
}

export default DayCard;
