// Test-first (RED): asserts the SPECIFIED weather-code mapping pinned by design.md
// D2 and the forecast spec ("Render daily forecast cards" — a weather icon derived
// from the day's weather code). The implementation (`lib/forecast/weather-code.ts`)
// does NOT exist yet — these MUST fail because the module is MISSING, not because of
// weak assertions. Never weaken a test to make it pass.
//
// Contract under test (D2, tasks 2.3, 5.2):
//   `describeWeather(code: number | null): { icon, labelKey, category }` maps the
//   Open-Meteo WMO `weather_code` to (a) a stable, non-empty icon NAME string (a
//   lucide-react key the card resolves — the lib stays DOM-free), (b) a non-empty
//   i18n KEY for the short Ukrainian condition label (the card calls t() — the lib
//   carries NO copy), and (c) a day/night-AGNOSTIC `category`
//   (clear | cloudy | fog | drizzle | rain | snow | thunder) the later
//   add-animated-bg consumes. TOTAL: an unknown / out-of-range / null code → a
//   neutral default (no throw, no blank icon, no blank label key).
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.
//
// @trace FR-FORECAST-02
import { describe, it, expect } from "vitest";

async function loadWeatherCode() {
  return import("@/lib/forecast/weather-code");
}

// The day/night-agnostic categories add-animated-bg will consume.
const CATEGORIES = ["clear", "cloudy", "fog", "drizzle", "rain", "snow", "thunder"];

describe("describeWeather — representative WMO codes map to the right category (FR-FORECAST-02)", () => {
  // One representative code per WMO group the spec/design pins.
  const cases: Array<[number, string, string]> = [
    [0, "clear", "0 = clear sky"],
    [3, "cloudy", "3 = overcast"],
    [48, "fog", "45/48 = fog"],
    [55, "drizzle", "51-57 = drizzle"],
    [61, "rain", "61-67 = rain"],
    [63, "rain", "61-67 = rain (moderate)"],
    [71, "snow", "71-77 = snow"],
    [73, "snow", "71-77 = snow (moderate)"],
    [95, "thunder", "95-99 = thunderstorm"],
  ];

  it.each(cases)("code %i → category '%s' (%s)", async (code, category) => {
    const { describeWeather } = await loadWeatherCode();
    const result = describeWeather(code);
    expect(result.category).toBe(category);
  });

  it("every representative code yields a NON-EMPTY icon name and label key", async () => {
    const { describeWeather } = await loadWeatherCode();
    for (const [code] of cases) {
      const r = describeWeather(code);
      expect(typeof r.icon, `code ${code}: icon must be a string`).toBe("string");
      expect(r.icon.trim().length, `code ${code}: icon must be non-empty`).toBeGreaterThan(0);
      expect(typeof r.labelKey, `code ${code}: labelKey must be a string`).toBe("string");
      expect(r.labelKey.trim().length, `code ${code}: labelKey must be non-empty`).toBeGreaterThan(0);
      // The category is always one of the documented day/night-agnostic set.
      expect(CATEGORIES).toContain(r.category);
    }
  });

  it("the label key targets the forecast.condition.* namespace (the card calls t(labelKey))", async () => {
    const { describeWeather } = await loadWeatherCode();
    // The lib returns a KEY, not copy (NFR-I18N-01) — keys live under the
    // forecast.* namespace this slice adds.
    expect(describeWeather(0).labelKey).toMatch(/^forecast\.condition\./);
    expect(describeWeather(95).labelKey).toMatch(/^forecast\.condition\./);
  });

  it("distinct weather groups get distinct condition label keys (clear ≠ rain ≠ snow ≠ thunder)", async () => {
    const { describeWeather } = await loadWeatherCode();
    const keys = new Set(
      [0, 61, 71, 95].map((c) => describeWeather(c).labelKey),
    );
    // Four genuinely different conditions must not collapse to one label.
    expect(keys.size).toBe(4);
  });
});

describe("describeWeather — TOTAL: unknown / out-of-range / null code → a safe neutral default (FR-FORECAST-02)", () => {
  it("an UNKNOWN code (999) → a neutral default, no throw, no blank", async () => {
    const { describeWeather } = await loadWeatherCode();
    let r!: ReturnType<typeof describeWeather>;
    expect(() => {
      r = describeWeather(999);
    }).not.toThrow();
    expect(r.icon.trim().length, "unknown code must still resolve a non-blank icon").toBeGreaterThan(0);
    expect(r.labelKey.trim().length, "unknown code must still resolve a non-blank label key").toBeGreaterThan(0);
    expect(CATEGORIES).toContain(r.category);
  });

  it("a NEGATIVE / out-of-range code → the neutral default (no throw)", async () => {
    const { describeWeather } = await loadWeatherCode();
    for (const code of [-1, -100, 1000, 12345]) {
      let r!: ReturnType<typeof describeWeather>;
      expect(() => {
        r = describeWeather(code);
      }, `code ${code} must not throw`).not.toThrow();
      expect(r.icon.trim().length).toBeGreaterThan(0);
      expect(r.labelKey.trim().length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(r.category);
    }
  });

  it("a NULL code → the neutral default (no throw, generic label + icon)", async () => {
    const { describeWeather } = await loadWeatherCode();
    let r!: ReturnType<typeof describeWeather>;
    expect(() => {
      r = describeWeather(null);
    }).not.toThrow();
    expect(r.icon.trim().length).toBeGreaterThan(0);
    expect(r.labelKey.trim().length).toBeGreaterThan(0);
    // The generic fallback key is still under the forecast.condition.* namespace.
    expect(r.labelKey).toMatch(/^forecast\.condition\./);
    expect(CATEGORIES).toContain(r.category);
  });
});
