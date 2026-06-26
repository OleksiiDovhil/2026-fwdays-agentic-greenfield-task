// Test-first (RED): asserts the SPECIFIED pure parse contract pinned by design.md
// D2 (zod parse of BOTH the daily and hourly blocks, total, framework-free) and
// the forecast spec ("Fetch daily and hourly forecast …", "Render daily forecast
// cards", "Payload that fails schema validation is rejected"). The implementation
// (`lib/forecast/validation.ts`, `lib/forecast/types.ts`) does NOT exist yet —
// these MUST fail because the modules are MISSING, not because of weak assertions.
// Never weaken a test to make it pass; if a test contradicts the spec, change it
// deliberately, not silently.
//
// Contract under test (D2, tasks 2.1-2.2, 5.1):
//   - `parseForecast(body: unknown): ForecastResult`. The upstream `daily` block is
//     COLUMN-oriented (parallel arrays keyed by index against `daily.time`); the
//     parser ZIPS the columns per index into `DailyForecast[]` and maps the hourly
//     arrays into `HourlyPoint[]`. On success → `{ forecast: { days, hourly } }`.
//   - TOTAL: a malformed / partial / non-object body, a body whose shape fails the
//     schema, a missing/non-array/non-numeric HOURLY block, OR a schema-valid but
//     ZERO-day body → `{ error: "failed" }` and NEVER throws.
//   - A SHORT daily array (1..6 days) is valid and yields that many days. A per-day
//     nullable field absent for a day → `null` (not zero, not dropped).
//   - `toComfortInput(day)` maps `windMax → windSpeed`, the rest pass-through.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM, no `fetch`.
//
// @trace FR-FORECAST-01, FR-COMFORT-02
import { describe, it, expect } from "vitest";
// Type-only import of the planned contract: until `lib/forecast/types` exists this
// is a missing-module error (TS2307) like the rest — but annotating the map
// callback below with it keeps the RED output strictly "missing module", never an
// incidental noImplicitAny once the types land.
import type { DailyForecast } from "@/lib/forecast/types";

// Defer the imports so a MISSING module surfaces as a failing test (red for the
// right reason) rather than crashing collection.
async function loadValidation() {
  return import("@/lib/forecast/validation");
}
async function loadTypes() {
  return import("@/lib/forecast/types");
}

// ── A real-ish Open-Meteo forecast body (Kyiv, 7 daily days + a 49-point hourly
// block). The `daily` block is COLUMN-oriented: parallel arrays aligned by index
// against `daily.time`. Built by a factory so individual tests can mutate one
// column (drop a value, shorten an array, corrupt a type) without disturbing the
// rest. ──────────────────────────────────────────────────────────────────────

function isoDay(offset: number): string {
  // A fixed YYYY-MM-DD local calendar date (timezone=auto pins this server-side);
  // we only need 7 stable, chronological strings, so derive from a fixed base.
  const base = Date.UTC(2026, 5, 27); // 2026-06-27 (a Saturday)
  const d = new Date(base + offset * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hourlyTimes(count: number): string[] {
  // ISO-local "YYYY-MM-DDTHH:00" strings (no zone suffix — timezone=auto).
  const out: string[] = [];
  const base = Date.UTC(2026, 5, 27, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base + i * 3_600_000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    out.push(`${y}-${m}-${day}T${h}:00`);
  }
  return out;
}

type OpenMeteoBody = {
  daily: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    apparent_temperature_max: (number | null)[];
    apparent_temperature_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    uv_index_max: (number | null)[];
    cloud_cover_mean: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
  hourly: { time: string[]; temperature_2m: (number | null)[] };
};

function makeBody(days = 7, hours = 49): OpenMeteoBody {
  const time = Array.from({ length: days }, (_, i) => isoDay(i));
  return {
    daily: {
      time,
      // distinct per-day values so the zip-by-index can be asserted precisely.
      weather_code: time.map((_, i) => [0, 3, 61, 71, 95, 45, 80][i % 7]),
      temperature_2m_max: time.map((_, i) => 20 + i),
      temperature_2m_min: time.map((_, i) => 10 + i),
      apparent_temperature_max: time.map((_, i) => 18 + i),
      apparent_temperature_min: time.map((_, i) => 8 + i),
      precipitation_probability_max: time.map((_, i) => 10 * i),
      wind_speed_10m_max: time.map((_, i) => 2 + i),
      uv_index_max: time.map((_, i) => i),
      cloud_cover_mean: time.map((_, i) => 5 * i),
      sunrise: time.map((d) => `${d}T05:00`),
      sunset: time.map((d) => `${d}T21:00`),
    },
    hourly: {
      time: hourlyTimes(hours),
      temperature_2m: Array.from({ length: hours }, (_, i) => 12 + (i % 10)),
    },
  };
}

describe("parseForecast — maps a real-ish 7-day Open-Meteo body to a typed Forecast (FR-FORECAST-01)", () => {
  it("returns { forecast } with 7 DailyForecasts zipped per index (comfort + display fields)", async () => {
    const { parseForecast } = await loadValidation();
    const result = parseForecast(makeBody(7, 49));

    // Success branch carries `forecast`, never the typed error.
    expect("forecast" in result, "a valid body must yield { forecast }").toBe(true);
    if (!("forecast" in result)) return; // type-narrow for the rest
    const { forecast } = result;

    expect(forecast.days).toHaveLength(7);

    // Index 0 — every field zipped from its column at index 0.
    const d0 = forecast.days[0];
    expect(d0.time).toBe(isoDay(0));
    expect(d0.weatherCode).toBe(0);
    expect(d0.tempMax).toBe(20);
    expect(d0.tempMin).toBe(10);
    expect(d0.apparentHigh).toBe(18);
    expect(d0.apparentLow).toBe(8);
    expect(d0.precipProbability).toBe(0);
    expect(d0.windMax).toBe(2);
    expect(d0.uvIndex).toBe(0);
    expect(d0.cloudCover).toBe(0);
    expect(d0.sunrise).toBe(`${isoDay(0)}T05:00`);
    expect(d0.sunset).toBe(`${isoDay(0)}T21:00`);

    // Index 4 — proves the parser zips by INDEX (not just the first row).
    const d4 = forecast.days[4];
    expect(d4.time).toBe(isoDay(4));
    expect(d4.weatherCode).toBe(95);
    expect(d4.tempMax).toBe(24);
    expect(d4.apparentHigh).toBe(22);
    expect(d4.precipProbability).toBe(40);
    expect(d4.windMax).toBe(6);
    expect(d4.uvIndex).toBe(4);
    expect(d4.cloudCover).toBe(20);
  });

  it("maps the hourly block to HourlyPoint[] in order", async () => {
    const { parseForecast } = await loadValidation();
    const result = parseForecast(makeBody(7, 49));
    if (!("forecast" in result)) throw new Error("expected { forecast }");
    const { hourly } = result.forecast;

    expect(hourly).toHaveLength(49);
    expect(hourly[0]).toEqual({ time: hourlyTimes(1)[0], temperature: 12 });
    // The 49th point exists (≥ 48 h coverage from the single request).
    expect(hourly[48].temperature).toBe(12 + (48 % 10));
    // Every point carries the { time, temperature } HourlyPoint shape.
    for (const p of hourly) {
      expect(typeof p.time).toBe("string");
      expect(p.temperature === null || typeof p.temperature === "number").toBe(true);
    }
  });

  it("out-of-range values are TOLERATED (parse never gates on plausibility)", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49);
    body.daily.temperature_2m_max[0] = -80; // implausible cold
    body.daily.wind_speed_10m_max[0] = 400; // implausible wind
    body.daily.precipitation_probability_max[0] = 250; // > 100
    const result = parseForecast(body);
    expect("forecast" in result, "extreme values must still parse").toBe(true);
    if (!("forecast" in result)) return;
    expect(result.forecast.days[0].tempMax).toBe(-80);
    expect(result.forecast.days[0].windMax).toBe(400);
    expect(result.forecast.days[0].precipProbability).toBe(250);
  });

  it("never throws and never mutates the input body", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49);
    const snapshot = JSON.stringify(body);
    expect(() => parseForecast(body)).not.toThrow();
    expect(JSON.stringify(body), "parseForecast must not mutate its argument").toBe(
      snapshot,
    );
  });
});

describe("parseForecast — a SHORT daily array renders the days it has (FR-FORECAST-02)", () => {
  it("a 4-day body yields exactly 4 DailyForecasts, chronological", async () => {
    const { parseForecast } = await loadValidation();
    const result = parseForecast(makeBody(4, 49));
    expect("forecast" in result).toBe(true);
    if (!("forecast" in result)) return;
    expect(result.forecast.days).toHaveLength(4);
    expect(result.forecast.days.map((d: DailyForecast) => d.time)).toEqual([
      isoDay(0),
      isoDay(1),
      isoDay(2),
      isoDay(3),
    ]);
  });

  it("a 1-day body yields exactly 1 day (the minimum valid daily array)", async () => {
    const { parseForecast } = await loadValidation();
    const result = parseForecast(makeBody(1, 49));
    expect("forecast" in result).toBe(true);
    if (!("forecast" in result)) return;
    expect(result.forecast.days).toHaveLength(1);
  });
});

describe("parseForecast — an absent per-day value becomes null, not zero, not dropped (FR-FORECAST-02)", () => {
  it("a day missing precipitation_probability_max → that day's precip is null", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49);
    // Open-Meteo represents a missing hour/day value as an explicit null in the
    // column. Day index 2 has no precip probability.
    body.daily.precipitation_probability_max[2] = null;
    const result = parseForecast(body);
    expect("forecast" in result).toBe(true);
    if (!("forecast" in result)) return;
    expect(result.forecast.days[2].precipProbability).toBeNull();
    // The day is NOT dropped — all 7 remain, and a present 0 elsewhere is kept.
    expect(result.forecast.days).toHaveLength(7);
    expect(result.forecast.days[0].precipProbability).toBe(0); // present zero ≠ null
  });

  it("a day missing cloud_cover_mean → that day's cloudCover is null (comfort neutral fallback covers it)", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49);
    body.daily.cloud_cover_mean[3] = null;
    const result = parseForecast(body);
    if (!("forecast" in result)) throw new Error("expected { forecast }");
    expect(result.forecast.days[3].cloudCover).toBeNull();
  });

  it("an entirely ABSENT cloud_cover_mean column → every day's cloudCover is null (field optional)", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as OpenMeteoBody & {
      daily: { cloud_cover_mean?: (number | null)[] };
    };
    // Some Open-Meteo plans omit the daily mean entirely; the schema treats the
    // column as optional and derives per-day null (never a fabricated value).
    delete (body.daily as { cloud_cover_mean?: unknown }).cloud_cover_mean;
    const result = parseForecast(body);
    expect("forecast" in result, "an absent optional column must not fail the parse").toBe(
      true,
    );
    if (!("forecast" in result)) return;
    expect(result.forecast.days).toHaveLength(7);
    for (const d of result.forecast.days) expect(d.cloudCover).toBeNull();
  });
});

describe("parseForecast — TOTAL: malformed / empty / mismatched bodies degrade to { error } (FR-FORECAST-01, NFR-OBS-01)", () => {
  it("a non-object body → { error: 'failed' } (never throws)", async () => {
    const { parseForecast } = await loadValidation();
    for (const bad of [null, undefined, 42, "nope", true, [], NaN]) {
      let result: unknown;
      expect(() => {
        result = parseForecast(bad);
      }, `parseForecast(${String(bad)}) must not throw`).not.toThrow();
      expect(result).toEqual({ error: "failed" });
    }
  });

  it("a daily COLUMN of the wrong type → { error: 'failed' }", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as { daily: Record<string, unknown> };
    body.daily.temperature_2m_max = "not-an-array";
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });

  it("a daily time column that is not an array of strings → { error: 'failed' }", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as { daily: Record<string, unknown> };
    body.daily.time = [1, 2, 3]; // numbers, not date strings
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });

  it("a body whose `daily` block is missing entirely → { error: 'failed' }", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as Record<string, unknown>;
    delete body.daily;
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });

  it("a schema-valid ZERO-day body (empty daily.time) → { error: 'failed' } (no day to render)", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(0, 49); // every daily column empty, hourly intact
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });
});

describe("parseForecast — the HOURLY block is validated before the daily cards render (FR-FORECAST-01)", () => {
  it("a MISSING hourly block → { error: 'failed' } (rejected like a failed fetch)", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as Record<string, unknown>;
    delete body.hourly;
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });

  it("a NON-ARRAY hourly temperature → { error: 'failed' }", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as { hourly: Record<string, unknown> };
    body.hourly.temperature_2m = "warm";
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });

  it("NON-NUMERIC hourly entries (e.g. strings) → { error: 'failed' }", async () => {
    const { parseForecast } = await loadValidation();
    const body = makeBody(7, 49) as unknown as { hourly: { temperature_2m: unknown[] } };
    body.hourly.temperature_2m = ["12", "13", "14"];
    expect(parseForecast(body)).toEqual({ error: "failed" });
  });
});

describe("toComfortInput — the ONE daily→comfort mapping point (FR-COMFORT-02)", () => {
  it("maps windMax → windSpeed and passes the comfort factors through by name", async () => {
    const { parseForecast } = await loadValidation();
    const { toComfortInput } = await loadTypes();
    const result = parseForecast(makeBody(7, 49));
    if (!("forecast" in result)) throw new Error("expected { forecast }");
    const day = result.forecast.days[4];

    const input = toComfortInput(day);
    expect(input.time).toBe(day.time);
    expect(input.apparentHigh).toBe(day.apparentHigh);
    expect(input.apparentLow).toBe(day.apparentLow);
    expect(input.precipProbability).toBe(day.precipProbability);
    expect(input.cloudCover).toBe(day.cloudCover);
    expect(input.uvIndex).toBe(day.uvIndex);
    // The single rename: the daily `windMax` becomes the comfort `windSpeed`.
    expect(input.windSpeed).toBe(day.windMax);
    // The mapper does NOT leak display-only fields into the comfort input.
    expect((input as Record<string, unknown>).windMax).toBeUndefined();
    expect((input as Record<string, unknown>).tempMax).toBeUndefined();
    expect((input as Record<string, unknown>).weatherCode).toBeUndefined();
  });

  it("preserves a null comfort factor as null (so comfortScore's neutral fallback applies)", async () => {
    const { parseForecast } = await loadValidation();
    const { toComfortInput } = await loadTypes();
    const body = makeBody(7, 49);
    body.daily.uv_index_max[0] = null;
    body.daily.wind_speed_10m_max[0] = null;
    const result = parseForecast(body);
    if (!("forecast" in result)) throw new Error("expected { forecast }");
    const input = toComfortInput(result.forecast.days[0]);
    expect(input.uvIndex).toBeNull();
    expect(input.windSpeed).toBeNull();
  });

  it("the produced ComfortInput is the exact shape comfortScore consumes → a valid badge value", async () => {
    const { parseForecast } = await loadValidation();
    const { toComfortInput } = await loadTypes();
    const { comfortScore } = await import("@/lib/scoring/comfort");
    const result = parseForecast(makeBody(7, 49));
    if (!("forecast" in result)) throw new Error("expected { forecast }");

    for (const day of result.forecast.days) {
      const { value } = comfortScore(toComfortInput(day));
      // comfortScore returns an integer in the inclusive band 0..100 for every
      // day — proof the mapper feeds a shape comfortScore fully understands.
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
