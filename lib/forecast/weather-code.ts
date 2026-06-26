// Pure, framework-free Open-Meteo WMO weather-code mapping — design.md D2,
// FR-FORECAST-02, TC-PURE-01.
//
// `describeWeather(code)` maps the Open-Meteo WMO `weather_code` to:
//   (a) a stable icon NAME string — a `lucide-react` key the card resolves; the
//       lib stays DOM-free (returns a name, never a React element);
//   (b) an i18n label KEY under `forecast.condition.*` — the lib carries NO copy
//       (NFR-I18N-01), the card calls `t(labelKey)`;
//   (c) a day/night-AGNOSTIC `category` (clear | cloudy | fog | drizzle | rain |
//       snow | thunder) the later `add-animated-bg` slice consumes.
//
// TOTAL: an unknown / out-of-range / `null` code maps to a NEUTRAL default
// (category `cloudy`, the generic `forecast.condition.unknown` key, a generic
// icon) so no card breaks on an unexpected code.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.

/** Day/night-agnostic weather categories (the add-animated-bg contract). */
export type WeatherCategory =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

export type WeatherDescription = {
  /** A lucide-react icon NAME (resolved to a component by the card). */
  icon: string;
  /** An i18n key under `forecast.condition.*` (the card calls `t(labelKey)`). */
  labelKey: string;
  /** The day/night-agnostic category (add-animated-bg consumes this). */
  category: WeatherCategory;
};

// The neutral default for an unknown / out-of-range / null code — never blank.
const UNKNOWN: WeatherDescription = {
  icon: "CloudSun",
  labelKey: "forecast.condition.unknown",
  category: "cloudy",
};

// The documented WMO groups → { icon, labelKey, category }. Codes not in the table
// fall through to UNKNOWN. Icon names are stable lucide-react keys.
const WMO: Record<number, WeatherDescription> = {
  // 0 — clear sky.
  0: { icon: "Sun", labelKey: "forecast.condition.clear", category: "clear" },
  // 1 — mainly clear.
  1: { icon: "SunMedium", labelKey: "forecast.condition.mainlyClear", category: "cloudy" },
  // 2 — partly cloudy.
  2: { icon: "CloudSun", labelKey: "forecast.condition.partlyCloudy", category: "cloudy" },
  // 3 — overcast.
  3: { icon: "Cloud", labelKey: "forecast.condition.overcast", category: "cloudy" },
  // 45 / 48 — fog and depositing rime fog.
  45: { icon: "CloudFog", labelKey: "forecast.condition.fog", category: "fog" },
  48: { icon: "CloudFog", labelKey: "forecast.condition.fog", category: "fog" },
  // 51 / 53 / 55 — drizzle (light / moderate / dense); 56 / 57 — freezing drizzle.
  51: { icon: "CloudDrizzle", labelKey: "forecast.condition.drizzle", category: "drizzle" },
  53: { icon: "CloudDrizzle", labelKey: "forecast.condition.drizzle", category: "drizzle" },
  55: { icon: "CloudDrizzle", labelKey: "forecast.condition.drizzle", category: "drizzle" },
  56: { icon: "CloudDrizzle", labelKey: "forecast.condition.drizzle", category: "drizzle" },
  57: { icon: "CloudDrizzle", labelKey: "forecast.condition.drizzle", category: "drizzle" },
  // 61 / 63 / 65 — rain (slight / moderate / heavy); 66 / 67 — freezing rain.
  61: { icon: "CloudRain", labelKey: "forecast.condition.rain", category: "rain" },
  63: { icon: "CloudRain", labelKey: "forecast.condition.rain", category: "rain" },
  65: { icon: "CloudRain", labelKey: "forecast.condition.rain", category: "rain" },
  66: { icon: "CloudRain", labelKey: "forecast.condition.rain", category: "rain" },
  67: { icon: "CloudRain", labelKey: "forecast.condition.rain", category: "rain" },
  // 71 / 73 / 75 — snow fall (slight / moderate / heavy); 77 — snow grains.
  71: { icon: "CloudSnow", labelKey: "forecast.condition.snow", category: "snow" },
  73: { icon: "CloudSnow", labelKey: "forecast.condition.snow", category: "snow" },
  75: { icon: "CloudSnow", labelKey: "forecast.condition.snow", category: "snow" },
  77: { icon: "CloudSnow", labelKey: "forecast.condition.snow", category: "snow" },
  // 80 / 81 / 82 — rain showers (slight / moderate / violent).
  80: { icon: "CloudRainWind", labelKey: "forecast.condition.rainShowers", category: "rain" },
  81: { icon: "CloudRainWind", labelKey: "forecast.condition.rainShowers", category: "rain" },
  82: { icon: "CloudRainWind", labelKey: "forecast.condition.rainShowers", category: "rain" },
  // 85 / 86 — snow showers (slight / heavy).
  85: { icon: "CloudSnow", labelKey: "forecast.condition.snowShowers", category: "snow" },
  86: { icon: "CloudSnow", labelKey: "forecast.condition.snowShowers", category: "snow" },
  // 95 — thunderstorm; 96 / 99 — thunderstorm with hail.
  95: { icon: "CloudLightning", labelKey: "forecast.condition.thunder", category: "thunder" },
  96: { icon: "CloudLightning", labelKey: "forecast.condition.thunder", category: "thunder" },
  99: { icon: "CloudLightning", labelKey: "forecast.condition.thunder", category: "thunder" },
};

/**
 * Total weather-code → display description. An unknown / out-of-range / `null`
 * code returns the neutral `UNKNOWN` default (no throw, no blank icon/label key).
 */
export function describeWeather(code: number | null): WeatherDescription {
  if (typeof code !== "number" || !Number.isFinite(code)) return UNKNOWN;
  return WMO[code] ?? UNKNOWN;
}
