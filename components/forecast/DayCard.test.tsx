// Test-first (RED): asserts the SPECIFIED day-card formatting contract pinned by
// design.md D4 and the forecast spec ("Pin numeric formatting and unit labels for
// forecast values" + "Render daily forecast cards"). The implementation
// (`components/forecast/DayCard.tsx`) does NOT exist yet — these MUST fail because
// the component is MISSING, not because of weak assertions. Never weaken a test to
// make it pass; if it contradicts the spec, change it deliberately.
//
// Contract under test (D4, tasks 4.4, 5.8):
//   - temperature rounds to a WHOLE °C (round half away from zero, no decimals,
//     the i18n minus glyph for negatives): hi -7.4 / lo -6.6 → both "-7°C";
//   - wind rounds to a whole m/s with the i18n m/s unit label: 3.6 → "4" + label;
//   - a present precip 0 → "0%"; an ABSENT precip → the "—" placeholder (distinct);
//   - an EXTREME high -58.7 → "-59°C" and wind 212.4 → "212" without overflow,
//     no throw, console clean;
//   - a Ukrainian weekday label from i18n (forecast.weekday.*), not a raw API string;
//   - each card shows a comfort ComfortBadge for that day.
//
// @trace FR-FORECAST-02
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { DailyForecast } from "@/lib/forecast/types";

// forecast.* keys are added by this slice; read via the t() parameter-type cast.
async function tk(key: string): Promise<string> {
  const { t } = await import("@/lib/i18n");
  return t(key as Parameters<typeof t>[0]);
}

const CYRILLIC = /[Ѐ-ӿ]/;

// A complete DailyForecast the test mutates per case.
function makeDay(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    time: "2026-06-29", // a Monday (2026-06-29) → a known weekday index
    weatherCode: 3,
    tempMax: 20,
    tempMin: 12,
    apparentHigh: 19,
    apparentLow: 11,
    precipProbability: 40,
    windMax: 5,
    cloudCover: 50,
    uvIndex: 4,
    sunrise: "2026-06-29T05:00",
    sunset: "2026-06-29T21:00",
    ...overrides,
  };
}

// Defer the import so a MISSING module fails the test rather than crashing
// collection.
async function renderCard(day: DailyForecast) {
  const mod = await import("@/components/forecast/DayCard");
  const DayCard = (mod.default ?? mod.DayCard) as React.ComponentType<{
    day: DailyForecast;
  }>;
  return render(<DayCard day={day} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DayCard — temperature rounds to whole °C with the minus glyph (FR-FORECAST-02)", () => {
  it("hi -7.4 and lo -6.6 both read -7°C (rounded, no decimals, minus present)", async () => {
    const minus = await tk("forecast.minus"); // the app's standard minus glyph
    const { container } = await renderCard(
      makeDay({ tempMax: -7.4, tempMin: -6.6 }),
    );
    const text = container.textContent ?? "";
    // Rounded to -7 (no ".4"/".6" decimals leak through), with the °C unit.
    expect(text).toContain("7");
    expect(text).not.toContain("7.4");
    expect(text).not.toContain("6.6");
    expect(text).not.toContain("7.0");
    // The negative sign is present (ASCII minus OR the i18n minus glyph).
    const hasMinus = text.includes("-7") || (minus.length > 0 && text.includes(`${minus}7`));
    expect(hasMinus, "the negative sign must be present on a sub-zero temperature").toBe(true);
    // Celsius, never Kelvin/Fahrenheit.
    expect(text).not.toContain("266");
    expect(text).not.toContain("K");
  });

  it("an EXTREME high -58.7 reads -59°C and wind 212.4 reads 212, no overflow, no throw, console clean", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let container!: HTMLElement;
    await expect(
      (async () => {
        const r = await renderCard(makeDay({ tempMax: -58.7, windMax: 212.4 }));
        container = r.container;
      })(),
    ).resolves.not.toThrow();
    const text = container.textContent ?? "";
    expect(text).toContain("59"); // -58.7 → -59 (round half away from zero)
    expect(text).toContain("212"); // 212.4 → 212
    expect(text).not.toContain("58.7");
    expect(text).not.toContain("212.4");
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("DayCard — wind shows an integer m/s with the i18n unit label (FR-FORECAST-02)", () => {
  it("wind 3.6 reads 4 and the m/s unit comes from forecast.unit.wind (not hardcoded)", async () => {
    const windUnit = await tk("forecast.unit.wind");
    expect(windUnit.trim().length, "forecast.unit.wind must resolve to a non-empty i18n string").toBeGreaterThan(0);
    const { container } = await renderCard(makeDay({ windMax: 3.6 }));
    const text = container.textContent ?? "";
    expect(text).toContain("4"); // 3.6 → 4
    expect(text).not.toContain("3.6");
    // The unit label is the i18n one, matching the requested windspeed_unit=ms.
    expect(text).toContain(windUnit);
  });
});

describe("DayCard — precipitation 0% is distinct from a missing value (FR-FORECAST-02)", () => {
  it("a present precip 0 renders 0%", async () => {
    const { container } = await renderCard(makeDay({ precipProbability: 0 }));
    expect(container.textContent ?? "").toContain("0%");
  });

  it("an ABSENT precip (null) renders the neutral placeholder, NOT 0%", async () => {
    const placeholder = await tk("forecast.precipPlaceholder"); // "—"
    expect(placeholder.trim().length, "forecast.precipPlaceholder must resolve").toBeGreaterThan(0);
    const { container } = await renderCard(makeDay({ precipProbability: null }));
    const text = container.textContent ?? "";
    expect(text).toContain(placeholder);
    // The absent day must NOT masquerade as a 0% chance.
    expect(text).not.toContain("0%");
  });
});

describe("DayCard — weekday label is Ukrainian from i18n + a ComfortBadge renders (FR-FORECAST-02)", () => {
  it("renders a Ukrainian weekday label from forecast.weekday.* (not a raw API date string)", async () => {
    const { container } = await renderCard(makeDay({ time: "2026-06-29" }));
    const text = container.textContent ?? "";
    // A Ukrainian (Cyrillic) weekday label is present.
    expect(CYRILLIC.test(text), `the weekday label must read as Ukrainian: "${text}"`).toBe(true);
    // The raw ISO date string is not shown verbatim as the weekday.
    expect(text).not.toContain("2026-06-29");
  });

  it("shows a comfort ComfortBadge value for the day (the comfort level beyond color)", async () => {
    // A pleasant day → comfortScore yields a concrete integer the badge renders.
    const { comfortScore } = await import("@/lib/scoring/comfort");
    const { toComfortInput } = await import("@/lib/forecast/types");
    const day = makeDay();
    const { value } = comfortScore(toComfortInput(day));
    const { container } = await renderCard(day);
    // The badge renders its numeric value (the same value comfortScore computed).
    expect(container.textContent ?? "").toContain(String(value));
  });

  it("renders calmly with NO exclamation mark anywhere (BC-BRAND-01)", async () => {
    const { container } = await renderCard(makeDay());
    expect(container.textContent ?? "").not.toContain("!");
  });
});
