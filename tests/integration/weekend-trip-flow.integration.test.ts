// Phase 5 cross-cutting INTEGRATION layer — the core Weather Explorer business
// flow ("is this weekend worth a trip, and where?") driven END-TO-END over the REAL
// route handlers (`app/api/{geocode,forecast,reverse-geocode}/route.ts`) + the REAL
// pure domain layers (`lib/{search,forecast,scoring,compare}`), with Open-Meteo /
// Nominatim mocked at `fetch` (ADR-0003 service-level integration; ADR-0004 Vitest
// only, NO Playwright, NO DB; AGENTS.md local-date discipline). NOT new unit tests —
// each pure function has its own colocated unit suite; this asserts they COMPOSE
// across the slice boundaries the way the product does.
//
// THE FLOW (one user journey):
//   1. Search "Kyiv" -> the geocode handler -> typed { suggestions }; select one
//      (the active location's lat/lon/name).                         [FR-SEARCH-01/03]
//   2. Forecast the active location -> the forecast handler -> typed { forecast };
//      map days via toComfortInput -> comfortScore; upcomingWeekend(days) ->
//      the weekend verdict = avg of the IN-WINDOW Saturday + consecutive Sunday,
//      chosen by LOCAL `time` date (invariant under a far viewer timezone).
//                                                       [FR-FORECAST-01, FR-COMFORT-05]
//   3. Compare: pin 3 cities, forecast each in PARALLEL via the SAME forecast route,
//      selectWeekend + buildCompareRow per city -> the 3-column compare model; the
//      cities' comfort scores DIFFER as the fixtures dictate.        [FR-COMPARE-02]
//   4. Honest degradation across the flow: a non-OK / malformed / thrown upstream ->
//      the handlers return a TYPED empty/error (never a raw 500/throw) and the
//      downstream comfort/compare layers degrade calmly (no NaN/throw); console
//      stays clean.                                                  [NFR-OBS-01]
//
// `global.fetch` is MOCKED throughout — deterministic, offline, never the real,
// keyless Open-Meteo / Nominatim.
//
// @trace FR-SEARCH-01, FR-SEARCH-03, FR-FORECAST-01, FR-COMFORT-05, FR-COMPARE-02, NFR-OBS-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  geocodingSearchBody,
  geocodingEmptyBody,
  kyivForecastBody,
  forecastBodyForCoords,
  reverseGeocodeBody,
  mockResponse,
  KYIV,
  LVIV,
  ODESA,
  FORECAST_DATES,
  WEEKEND_SATURDAY,
  WEEKEND_SUNDAY,
  SATURDAY_INDEX,
  SUNDAY_INDEX,
} from "@/tests/fixtures/open-meteo";

import type { GeocodeResult, GeoSuggestion } from "@/lib/search/types";
import type { Forecast, ForecastResult } from "@/lib/forecast/types";
import { toComfortInput } from "@/lib/forecast/types";
import { comfortScore, bandOf, upcomingWeekend } from "@/lib/scoring/comfort";
import { selectWeekend } from "@/lib/compare/weekend";
import { buildCompareRow } from "@/lib/compare/row";
import { keyOf } from "@/lib/location/key";
import type { Location } from "@/lib/location/types";

// ── Driving the REAL handlers (deferred imports; fresh module per test via
//    resetModules) ──────────────────────────────────────────────────────────────
async function callGeocode(url: string): Promise<Response> {
  const { GET } = await import("@/app/api/geocode/route");
  return GET(new Request(url));
}
async function callForecast(url: string): Promise<Response> {
  const { GET } = await import("@/app/api/forecast/route");
  return GET(new Request(url));
}
async function callReverse(url: string): Promise<Response> {
  const { GET } = await import("@/app/api/reverse-geocode/route");
  return GET(new Request(url));
}

// Typed wrappers that exercise the handler AND assert the cross-boundary contract
// shape, so a downstream step works against the SAME typed body the client gets.
async function geocode(q: string): Promise<GeocodeResult> {
  const res = await callGeocode(`http://localhost/api/geocode?q=${encodeURIComponent(q)}`);
  expect(res.status, "geocode handler must resolve 200, never a raw 500").toBe(200);
  return (await res.json()) as GeocodeResult;
}
async function forecast(loc: { lat: number; lon: number }): Promise<ForecastResult> {
  const res = await callForecast(
    `http://localhost/api/forecast?lat=${loc.lat}&lon=${loc.lon}`,
  );
  expect(res.status, "forecast handler must resolve 200, never a raw 500").toBe(200);
  return (await res.json()) as ForecastResult;
}

// A single fetch mock that routes by URL to the right fixture body, so the PARALLEL
// per-city compare fetches all resolve deterministically from ONE mock — exactly the
// shape the real CompareSection issues (N forecast requests to the same route).
function routeByUrl(url: string): Response {
  const u = new URL(url);
  if (u.hostname.includes("geocoding-api.open-meteo.com")) {
    return mockResponse(geocodingSearchBody());
  }
  if (u.hostname.includes("api.open-meteo.com") && u.pathname.includes("/v1/forecast")) {
    const lat = Number(u.searchParams.get("latitude"));
    const lon = Number(u.searchParams.get("longitude"));
    const body = forecastBodyForCoords(lat, lon);
    // An unknown coordinate would be a fixture gap — fail loudly rather than mask it.
    if (body === null) throw new Error(`no forecast fixture for ${lat},${lon}`);
    return mockResponse(body);
  }
  if (u.hostname.includes("nominatim.openstreetmap.org")) {
    return mockResponse(reverseGeocodeBody());
  }
  throw new Error(`unexpected upstream URL in integration flow: ${url}`);
}

let fetchMock: ReturnType<typeof vi.fn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => routeByUrl(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  // NFR-OBS-01: the whole flow must keep the console silent on a healthy session.
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ───────────────────────────────────────────────────────────────────────────────
// STEP 1+2 — Search -> select -> forecast -> comfort -> weekend verdict
// ───────────────────────────────────────────────────────────────────────────────
describe("Weekend-trip flow: search -> select -> forecast -> comfort -> weekend (FR-SEARCH-01/03, FR-FORECAST-01, FR-COMFORT-05)", () => {
  it("searches Kyiv through the geocode handler and yields typed suggestions (the raw Open-Meteo shape never crosses)", async () => {
    const result = await geocode("Kyiv");

    // Typed success branch: { suggestions }, never the upstream { results } shape.
    expect("error" in result).toBe(false);
    const suggestions = (result as { suggestions: GeoSuggestion[] }).suggestions;
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);

    const first = suggestions[0];
    expect(first.name).toBe(KYIV.name);
    expect(first.lat).toBe(KYIV.latitude);
    expect(first.lon).toBe(KYIV.longitude);
    expect(first.countryCode).toBe("UA");
    // The verbose upstream fields were stripped at the boundary (TC-DATA-01).
    const asRecord = first as unknown as Record<string, unknown>;
    expect(asRecord.latitude).toBeUndefined();
    expect(asRecord.country_code).toBeUndefined();
    expect(asRecord.elevation).toBeUndefined();
    expect(asRecord.feature_code).toBeUndefined();
  });

  it("selecting a suggestion sets a usable active Location that forecasts to a typed Forecast", async () => {
    const { suggestions } = (await geocode("Kyiv")) as { suggestions: GeoSuggestion[] };
    // Step: select the first suggestion -> the active location (lat/lon/name).
    const active: Location = {
      lat: suggestions[0].lat,
      lon: suggestions[0].lon,
      name: suggestions[0].name,
    };

    const fResult = await forecast(active);
    expect("error" in fResult).toBe(false);
    const fc = (fResult as { forecast: Forecast }).forecast;

    // The 7-day window with the local-date sunrise/sunset + the active location's
    // UTC offset (timezone=auto) carried onto the typed Forecast.
    expect(fc.days).toHaveLength(7);
    expect(fc.days.map((d) => d.time)).toEqual([...FORECAST_DATES]);
    expect(fc.hourly.length).toBeGreaterThanOrEqual(48);
    expect(fc.utcOffsetSeconds).toBe(10_800);

    // The handler asked the KEYLESS forecast endpoint with the active coordinates.
    const forecastCall = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/v1/forecast"));
    expect(forecastCall).toBeDefined();
    const fUrl = new URL(forecastCall as string);
    expect(fUrl.searchParams.get("latitude")).toBe(String(active.lat));
    expect(fUrl.searchParams.get("longitude")).toBe(String(active.lon));
    expect(fUrl.searchParams.get("timezone")).toBe("auto");
    expect((forecastCall as string).toLowerCase()).not.toMatch(/(apikey|api_key|appid|token|key=)/);
  });

  it("maps the forecast days through toComfortInput -> comfortScore and highlights the upcoming weekend (avg of in-window Sat + consecutive Sun)", async () => {
    const fResult = await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });
    const fc = (fResult as { forecast: Forecast }).forecast;

    // The SAME composition the forecast grid uses: per-day comfort via the locked
    // mapping point + the locked pure scorer.
    const scoredDays = fc.days.map((day) => ({
      time: day.time,
      value: comfortScore(toComfortInput(day)).value,
    }));

    // The weekend highlight is upcomingWeekend over those scored days.
    const weekend = upcomingWeekend(scoredDays);

    // It picked exactly the IN-WINDOW Saturday + its consecutive Sunday (by local
    // date), and the verdict is their integer average.
    const satScore = comfortScore(toComfortInput(fc.days[SATURDAY_INDEX])).value;
    const sunScore = comfortScore(toComfortInput(fc.days[SUNDAY_INDEX])).value;
    expect(fc.days[SATURDAY_INDEX].time).toBe(WEEKEND_SATURDAY);
    expect(fc.days[SUNDAY_INDEX].time).toBe(WEEKEND_SUNDAY);

    expect(weekend.available).toBe("both");
    expect(weekend.saturday).toBe(satScore);
    expect(weekend.sunday).toBe(sunScore);
    expect(weekend.value).toBe(Math.round((satScore + sunScore) / 2));

    // Kyiv's fixture weekend is pleasant -> a green verdict the trip planner endorses.
    expect(weekend.value).not.toBeNull();
    expect(bandOf(weekend.value as number)).toBe("green");
    // No NaN ever leaks from the composition.
    expect(Number.isFinite(weekend.value as number)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// LOCAL-DATE / TIMEZONE PROOF — the weekend selection is the LOCATION's local date,
// invariant under the VIEWER's clock (FR-COMFORT-05, AGENTS.md).
// ───────────────────────────────────────────────────────────────────────────────
describe("Local-date discipline: the chosen weekend does NOT shift under a far viewer timezone (FR-COMFORT-05)", () => {
  // The fixture dates are picked so a LOCAL-vs-UTC off-by-one WOULD change the answer:
  // a far-WEST viewer reading the date through the buggy `new Date("YYYY-MM-DD")
  // .getDay()` sees 2026-06-27 as a Friday and would shift the weekend; the lib's
  // `Date.UTC(y,m-1,d) + getUTCDay()` discipline does not. We prove BOTH:
  //  (a) the real selectors pick the SAME interior Sat/Sun regardless of the system
  //      clock we simulate (a far-west AND a far-east instant), and
  //  (b) the naive UTC-instant `.getDay()` recomputation WOULD disagree under the
  //      far-west wall clock — so the invariance in (a) is meaningful, not vacuous.

  async function weekendVerdictForKyiv(): Promise<{
    saturday: string | null;
    sunday: string | null;
    value: number | null;
  }> {
    const fResult = await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });
    const fc = (fResult as { forecast: Forecast }).forecast;
    // selectWeekend returns the day OBJECTS (the compare path); read their dates.
    const { saturday, sunday } = selectWeekend(fc);
    const scored = fc.days.map((d) => ({ time: d.time, value: comfortScore(toComfortInput(d)).value }));
    const weekend = upcomingWeekend(scored);
    return {
      saturday: saturday?.time ?? null,
      sunday: sunday?.time ?? null,
      value: weekend.value,
    };
  }

  it("picks Sat 2026-06-27 + Sun 2026-06-28 under a FAR-WEST viewer instant (UTC-11 wall clock)", async () => {
    // Pin "now" to an instant where a UTC-11 viewer's local calendar day is the day
    // BEFORE the UTC day — the classic off-by-one trigger. The lib never reads this
    // clock for the weekend; it reads the location-local date strings.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T05:00:00Z")); // 2026-06-26 18:00 at UTC-11

    const verdict = await weekendVerdictForKyiv();
    expect(verdict.saturday).toBe(WEEKEND_SATURDAY);
    expect(verdict.sunday).toBe(WEEKEND_SUNDAY);
    expect(verdict.value).not.toBeNull();
  });

  it("picks the SAME Sat/Sun under a FAR-EAST viewer instant (UTC+14 wall clock) — verdict is identical", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T22:00:00Z")); // 2026-06-28 12:00 at UTC+14

    const verdict = await weekendVerdictForKyiv();
    expect(verdict.saturday).toBe(WEEKEND_SATURDAY);
    expect(verdict.sunday).toBe(WEEKEND_SUNDAY);
    expect(verdict.value).not.toBeNull();
  });

  it("the naive UTC-instant `.getDay()` WOULD shift the weekend under a far-west offset — proving the invariance above is load-bearing", () => {
    // The BUGGY recomputation the lib deliberately avoids: parse "YYYY-MM-DD" as a
    // UTC instant, then read the weekday in a far-WEST (UTC-11) wall clock. The
    // Saturday string slips back to a Friday (5) and the Sunday to a Saturday (6) —
    // a different weekend. (Pure arithmetic; no real Date timezone needed.)
    const WEST_OFFSET_MIN = -11 * 60;
    const naiveLocalWeekday = (isoDate: string): number => {
      const utcMidnight = Date.UTC(
        Number(isoDate.slice(0, 4)),
        Number(isoDate.slice(5, 7)) - 1,
        Number(isoDate.slice(8, 10)),
      );
      return new Date(utcMidnight + WEST_OFFSET_MIN * 60_000).getUTCDay();
    };
    // Under the buggy path the Saturday is NOT a Saturday (6) and the Sunday is NOT
    // a Sunday (0) — so a viewer-clock implementation would pick a different pair.
    expect(naiveLocalWeekday(WEEKEND_SATURDAY)).not.toBe(6);
    expect(naiveLocalWeekday(WEEKEND_SUNDAY)).not.toBe(0);
    expect(naiveLocalWeekday(WEEKEND_SATURDAY)).toBe(5); // Friday
    expect(naiveLocalWeekday(WEEKEND_SUNDAY)).toBe(6); // Saturday
  });

  it("the two simulated-clock verdicts are EQUAL (the selection is purely the location's local date)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T05:00:00Z"));
    const west = await weekendVerdictForKyiv();
    vi.setSystemTime(new Date("2026-06-27T22:00:00Z"));
    const east = await weekendVerdictForKyiv();
    expect(west).toEqual(east);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// STEP 3 — Compare: pin 3 cities, forecast each in PARALLEL, build the 3-column model
// ───────────────────────────────────────────────────────────────────────────────
describe("Weekend-compare flow: 3 pinned cities forecast in parallel -> the compare model; comfort scores differ as fixtures dictate (FR-COMPARE-02)", () => {
  const PINS: Location[] = [
    { lat: KYIV.latitude, lon: KYIV.longitude, name: KYIV.name },
    { lat: LVIV.latitude, lon: LVIV.longitude, name: LVIV.name },
    { lat: ODESA.latitude, lon: ODESA.longitude, name: ODESA.name },
  ];

  // Fetch all pinned cities in PARALLEL through the SAME forecast route (Promise.all,
  // mirroring CompareSection's Promise.allSettled fan-out — never a waterfall), then
  // build each column model with the locked pure builder.
  async function buildCompareModel() {
    const results = await Promise.all(
      PINS.map(async (city) => {
        const fResult = await forecast(city);
        const state =
          "error" in fResult
            ? ({ status: "failed" } as const)
            : ({ status: "ok", forecast: fResult.forecast } as const);
        return buildCompareRow(city, state);
      }),
    );
    return results;
  }

  it("issues ONE forecast request per pinned city (parallel fan-out, same route, keyless)", async () => {
    await buildCompareModel();
    const forecastCalls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/v1/forecast"));
    expect(forecastCalls).toHaveLength(3);
    // Each pinned city's coordinates appear exactly once.
    for (const city of PINS) {
      const hit = forecastCalls.find((u) => {
        const p = new URL(u).searchParams;
        return p.get("latitude") === String(city.lat) && p.get("longitude") === String(city.lon);
      });
      expect(hit, `a forecast request for ${city.name}`).toBeDefined();
    }
  });

  it("builds a 3-column compare model with the right per-city identity + Sat/Sun cells", async () => {
    const rows = await buildCompareModel();
    expect(rows).toHaveLength(3);

    for (let i = 0; i < PINS.length; i += 1) {
      const row = rows[i];
      const city = PINS[i];
      expect(row.status).toBe("ok");
      expect(row.key).toBe(keyOf(city)); // the shared rounded identity
      expect(row.name).toBe(city.name);
      // Both weekend days are in the window -> both DayCells present, no NaN.
      expect(row.saturday).not.toBeNull();
      expect(row.sunday).not.toBeNull();
      expect(typeof row.saturday?.comfortValue).toBe("number");
      expect(typeof row.sunday?.comfortValue).toBe("number");
      expect(Number.isFinite(row.saturday?.comfortValue as number)).toBe(true);
      expect(Number.isFinite(row.sunday?.comfortValue as number)).toBe(true);
    }
  });

  it("the Sat/Sun cells carry the same hi/lo/precip the fixture pins (not fabricated, nullable carried as-is)", async () => {
    const rows = await buildCompareModel();
    const kyiv = rows[0];
    // Kyiv's interior Saturday fixture: tempMax 23 / tempMin 14 / precip 5.
    expect(kyiv.saturday?.tempMax).toBe(23);
    expect(kyiv.saturday?.tempMin).toBe(14);
    expect(kyiv.saturday?.precipProbability).toBe(5);
    // Kyiv's interior Sunday fixture: tempMax 24 / tempMin 15 / precip 8.
    expect(kyiv.sunday?.tempMax).toBe(24);
    expect(kyiv.sunday?.precipProbability).toBe(8);
  });

  it("the three cities land in DISTINCT comfort bands (green Kyiv > yellow Odesa > red Lviv) — the compare answers 'where'", async () => {
    const rows = await buildCompareModel();
    const [kyiv, lviv, odesa] = rows;

    // Each city's weekend comfort = the average of its two day cells (the value the
    // compare summary ranks on). Compose it the same way the table does.
    const weekendAvg = (row: (typeof rows)[number]): number =>
      Math.round(
        ((row.saturday?.comfortValue ?? 0) + (row.sunday?.comfortValue ?? 0)) / 2,
      );

    const kyivAvg = weekendAvg(kyiv);
    const lvivAvg = weekendAvg(lviv);
    const odesaAvg = weekendAvg(odesa);

    // Exact fixture-pinned verdicts (verified against the real comfortScore).
    expect(kyivAvg).toBe(93);
    expect(odesaAvg).toBe(57);
    expect(lvivAvg).toBe(1);

    // DISTINCT bands -> a real "where to go" answer, not three look-alike columns.
    expect(bandOf(kyivAvg)).toBe("green");
    expect(bandOf(odesaAvg)).toBe("yellow");
    expect(bandOf(lvivAvg)).toBe("red");
    expect(kyivAvg).toBeGreaterThan(odesaAvg);
    expect(odesaAvg).toBeGreaterThan(lvivAvg);

    // Per-day too: the displayed comfort cells differ across cities (the fixtures
    // genuinely vary the weather, so the columns are not identical).
    expect(kyiv.saturday?.comfortValue).not.toBe(lviv.saturday?.comfortValue);
    expect(kyiv.saturday?.comfortValue).not.toBe(odesa.saturday?.comfortValue);
    expect(odesa.saturday?.comfortValue).not.toBe(lviv.saturday?.comfortValue);
  });

  it("a click-to-relocate reverse-geocode resolves a city name through the handler (the map's set-active path)", async () => {
    // The map slice's click path: reverse-geocode a clicked point -> a usable name,
    // which becomes the active location that the forecast step above consumes.
    const res = await callReverse("http://localhost/api/reverse-geocode?lat=46.4843&lon=30.7323");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name?: string | null };
    // The minimal { name } projection — never the raw Nominatim address block.
    expect(body.name).toBe(ODESA.name);
    expect((body as Record<string, unknown>).address).toBeUndefined();
    expect((body as Record<string, unknown>).display_name).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// STEP 4 — Honest degradation END-TO-END (NFR-OBS-01): bad upstreams never 500,
// the downstream comfort/compare layers degrade calmly, console stays clean.
// ───────────────────────────────────────────────────────────────────────────────
describe("Honest degradation across the flow (NFR-OBS-01): bad upstreams degrade to typed results; comfort/compare never NaN/throw; console clean", () => {
  it("a NON-OK geocode upstream -> typed { error } from the handler (no raw 500, no partial data)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: true, reason: "upstream down" }, { ok: false, status: 503 }),
    );
    const result = await geocode("Kyiv"); // geocode() already asserts status 200
    expect("suggestions" in result && (result as { suggestions: unknown[] }).suggestions.length).toBeFalsy();
    expect((result as { error?: string }).error).toBe("failed");
  });

  it("a MALFORMED geocode 200 body (results is a string) -> typed { error }, never a broken suggestion", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ results: "not-an-array" }));
    const result = await geocode("Kyiv");
    expect((result as { error?: string }).error).toBe("failed");
  });

  it("ZERO geocode results -> typed { suggestions: [] } (the 'Nothing found' inline path, NOT an error)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(geocodingEmptyBody()));
    const result = await geocode("zzzqqq-no-such-city");
    expect("error" in result).toBe(false);
    expect((result as { suggestions: GeoSuggestion[] }).suggestions).toEqual([]);
  });

  it("a THROWN forecast fetch (network) -> typed { error }; the compare builder degrades that city to 'failed' (no throw, no NaN)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const city: Location = { lat: KYIV.latitude, lon: KYIV.longitude, name: KYIV.name };
    let fResult!: ForecastResult;
    await expect(
      (async () => {
        fResult = await forecast(city);
      })(),
    ).resolves.not.toThrow();
    expect((fResult as { error?: string }).error).toBe("failed");

    // The downstream compare layer turns that typed error into a calm 'failed'
    // column with not-ready cells — never a thrown render, never a NaN score.
    const row = buildCompareRow(
      city,
      "error" in fResult ? { status: "failed" } : { status: "ok", forecast: fResult.forecast },
    );
    expect(row.status).toBe("failed");
    expect(row.saturday).toBeNull();
    expect(row.sunday).toBeNull();
    expect(row.key).toBe(keyOf(city)); // header still renders in the failed state
    expect(row.name).toBe(city.name);
  });

  it("a MALFORMED forecast 200 body (a daily column corrupted) -> typed { error }; comfort + weekend stay calm (no NaN)", async () => {
    // Corrupt ONE daily column on a FRESH Kyiv body (idempotent fixture — this never
    // leaks into another test's copy).
    const bad = kyivForecastBody();
    (bad.daily as unknown as Record<string, unknown>).temperature_2m_max = "not-an-array";
    fetchMock.mockResolvedValueOnce(mockResponse(bad));

    const fResult = await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });
    expect((fResult as { error?: string }).error).toBe("failed");

    // The forecast section, with no usable days, falls back to an empty day list ->
    // upcomingWeekend([]) is the calm "none" verdict, value null, never NaN/throw.
    const days = "forecast" in fResult ? fResult.forecast.days : [];
    const scored = days.map((d) => ({ time: d.time, value: comfortScore(toComfortInput(d)).value }));
    const weekend = upcomingWeekend(scored);
    expect(weekend.available).toBe("none");
    expect(weekend.value).toBeNull();
  });

  it("a forecast 200 whose .json() THROWS -> typed { error } (caught, not a raw 500)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { jsonThrows: true }));
    let fResult!: ForecastResult;
    await expect(
      (async () => {
        fResult = await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });
      })(),
    ).resolves.not.toThrow();
    expect((fResult as { error?: string }).error).toBe("failed");
  });

  it("ONE failed city among three does NOT strand the others — the compare model keeps the healthy columns (parallel isolation)", async () => {
    const PINS: Location[] = [
      { lat: KYIV.latitude, lon: KYIV.longitude, name: KYIV.name },
      { lat: LVIV.latitude, lon: LVIV.longitude, name: LVIV.name },
      { lat: ODESA.latitude, lon: ODESA.longitude, name: ODESA.name },
    ];
    // Make ONLY Lviv's forecast fail (route Lviv to a non-OK, everything else healthy).
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      const u = new URL(url);
      if (u.pathname.includes("/v1/forecast")) {
        const lat = Number(u.searchParams.get("latitude"));
        if (lat.toFixed(4) === LVIV.latitude.toFixed(4)) {
          return mockResponse({ reason: "down" }, { ok: false, status: 502 });
        }
      }
      return routeByUrl(url);
    });

    const rows = await Promise.all(
      PINS.map(async (city) => {
        const fResult = await forecast(city);
        const state =
          "error" in fResult
            ? ({ status: "failed" } as const)
            : ({ status: "ok", forecast: fResult.forecast } as const);
        return buildCompareRow(city, state);
      }),
    );

    expect(rows[0].status).toBe("ok"); // Kyiv survives
    expect(rows[1].status).toBe("failed"); // Lviv degraded calmly
    expect(rows[2].status).toBe("ok"); // Odesa survives
    // The healthy columns still carry real, finite comfort cells (not stranded).
    expect(Number.isFinite(rows[0].saturday?.comfortValue as number)).toBe(true);
    expect(Number.isFinite(rows[2].saturday?.comfortValue as number)).toBe(true);
    // The failed column renders its header but no cells (calm, not a thrown render).
    expect(rows[1].saturday).toBeNull();
    expect(rows[1].name).toBe(LVIV.name);
  });

  it("a reverse-geocode upstream returning an { error } body -> { name: null } (the coordinate-label fallback path)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: "Unable to geocode" }));
    const res = await callReverse("http://localhost/api/reverse-geocode?lat=46.4843&lon=30.7323");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name?: string | null };
    expect(body.name).toBeNull();
  });

  it("keeps the console SILENT across every degradation path (NFR-OBS-01)", async () => {
    // Run a representative sweep of failure modes back-to-back.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });

    fetchMock.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));
    await geocode("Kyiv");

    const badForecast = kyivForecastBody() as unknown as Record<string, unknown>;
    delete badForecast.daily;
    fetchMock.mockResolvedValueOnce(mockResponse(badForecast));
    await forecast({ lat: KYIV.latitude, lon: KYIV.longitude });

    fetchMock.mockResolvedValueOnce(mockResponse(null, { jsonThrows: true }));
    await callReverse("http://localhost/api/reverse-geocode?lat=46.4843&lon=30.7323");

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
