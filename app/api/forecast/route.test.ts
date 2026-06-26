// Test-first (RED): asserts the SPECIFIED forecast Route Handler data path pinned
// by design.md D1 (server-side keyless forecast behind `app/api/forecast`,
// mirroring `app/api/geocode/route.ts`) and the forecast spec ("Fetch daily and
// hourly forecast for the active location in one request" + "Degrade honestly when
// the forecast cannot load"). The implementation (`app/api/forecast/route.ts`) does
// NOT exist yet — these MUST fail because the module is MISSING, not because of weak
// assertions. Never weaken a test to make it pass.
//
// Contract under test (D1, tasks 3.1-3.4, 5.4):
//   - GET(request: Request) reads `?lat=&lon=`, parses them as finite numbers IN
//     RANGE, performs ONE keyless server-side fetch to the Open-Meteo FORECAST URL
//     (the URL/params live ONLY here, TC-DATA-01) asking for BOTH blocks with the
//     pinned params (daily=…, hourly=temperature_2m, temperature_unit=celsius,
//     windspeed_unit=ms, timezone=auto, forecast_days=7), parses with
//     `lib/forecast`, and returns Response.json({ forecast }) — the client never
//     sees the Open-Meteo URL, params, or raw column shape.
//   - Honest degradation (NFR-OBS-01): the handler NEVER returns a raw 500. Missing
//     / non-numeric / out-of-range lat|lon → a typed result WITHOUT calling
//     Open-Meteo. A non-OK upstream / a thrown fetch / a .json() that throws / a
//     zod-failed 200 body / a schema-valid ZERO-day body → { error: "failed" } with
//     a client-readable status (so the client `fetch` RESOLVES and reads the body),
//     never partial data.
//
// `global.fetch` is MOCKED throughout — deterministic and offline (it never hits
// the real, keyless Open-Meteo).
//
// @trace FR-FORECAST-01, NFR-OBS-01, TC-DATA-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── A real-ish Open-Meteo forecast body (Kyiv): COLUMN-oriented daily block (7
// parallel arrays aligned by index against daily.time) + a 49-point hourly block.
function buildOpenMeteoBody(days = 7, hours = 49) {
  const time = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 27) + i * 86_400_000);
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${d.getUTCFullYear()}-${m}-${day}`;
  });
  const hTime = Array.from({ length: hours }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 27, 0) + i * 3_600_000);
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    return `${d.getUTCFullYear()}-${m}-${day}T${h}:00`;
  });
  return {
    latitude: 50.45,
    longitude: 30.52,
    timezone: "Europe/Kyiv",
    daily: {
      time,
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
      time: hTime,
      temperature_2m: Array.from({ length: hours }, (_, i) => 12 + (i % 10)),
    },
  };
}

// A Response-like stub good enough for the handler's `await fetch(...)` usage:
// `.ok`, `.status`, and `.json()`.
function mockResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; jsonThrows?: boolean },
): Response {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: init?.jsonThrows
      ? async () => {
          throw new SyntaxError("Unexpected token in JSON");
        }
      : async () => body,
  } as unknown as Response;
}

// Defer the import so a MISSING module surfaces as a failing test (red for the
// right reason) rather than crashing collection.
async function callGet(url: string): Promise<Response> {
  const { GET } = await import("@/app/api/forecast/route");
  return GET(new Request(url));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => mockResponse(buildOpenMeteoBody()));
  vi.stubGlobal("fetch", fetchMock);
  // The handler must not be the source of console noise on any path.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("app/api/forecast GET — happy path returns the typed minimal Forecast (TC-DATA-01)", () => {
  it("responds 200 with { forecast: { days, hourly } } (7 days, hourly slice)", async () => {
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forecast?: { days?: unknown[]; hourly?: unknown[] };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.forecast).toBeDefined();
    expect(Array.isArray(body.forecast?.days)).toBe(true);
    expect(body.forecast?.days).toHaveLength(7);
    expect(Array.isArray(body.forecast?.hourly)).toBe(true);
    expect((body.forecast?.hourly ?? []).length).toBeGreaterThanOrEqual(48);
  });

  it("the typed days carry the internal Forecast contract, NOT the raw Open-Meteo columns", async () => {
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    const body = (await res.json()) as {
      forecast?: { days?: Array<Record<string, unknown>> };
    };
    const day0 = body.forecast?.days?.[0] ?? {};
    // The internal DailyForecast field names (the only shape the client knows).
    expect(typeof day0.time).toBe("string");
    expect("tempMax" in day0).toBe(true);
    expect("tempMin" in day0).toBe(true);
    expect("apparentHigh" in day0).toBe(true);
    expect("windMax" in day0).toBe(true);
    expect("weatherCode" in day0).toBe(true);
    // The raw Open-Meteo column-array keys NEVER cross the boundary.
    expect(day0.temperature_2m_max).toBeUndefined();
    expect(day0.wind_speed_10m_max).toBeUndefined();
    expect(day0.weather_code).toBeUndefined();
    // The top-level body carries no raw Open-Meteo daily/hourly column blocks.
    const full = body as Record<string, unknown>;
    expect(full.daily).toBeUndefined();
    expect(full.hourly).toBeUndefined();
  });

  it("calls the KEYLESS Open-Meteo FORECAST URL with the pinned params — never exposed to the client (TC-DATA-01)", async () => {
    await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    const url = new URL(calledUrl);

    // The upstream forecast host/path lives ONLY in the handler. The geocoding
    // host is a different subdomain — assert the forecast host specifically.
    expect(url.hostname).toContain("api.open-meteo.com");
    expect(url.pathname).toContain("/v1/forecast");

    // The active location's coordinates are forwarded.
    expect(url.searchParams.get("latitude")).toBe("50.45");
    expect(url.searchParams.get("longitude")).toBe("30.52");

    // The pinned units + window (FR-FORECAST-01).
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(url.searchParams.get("windspeed_unit")).toBe("ms");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("forecast_days")).toBe("7");

    // ONE request asks for BOTH blocks the downstream views need.
    const daily = url.searchParams.get("daily") ?? "";
    for (const field of [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "uv_index_max",
      "cloud_cover_mean",
      "sunrise",
      "sunset",
    ]) {
      expect(daily, `daily must request ${field}`).toContain(field);
    }
    expect(url.searchParams.get("hourly") ?? "").toContain("temperature_2m");

    // KEYLESS: no api key / token / auth ANYWHERE in the request (NFR-COST-01).
    expect(calledUrl.toLowerCase()).not.toMatch(/(apikey|api_key|appid|token|key=)/);
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = JSON.stringify(init?.headers ?? {}).toLowerCase();
    expect(headers).not.toMatch(/authorization|x-api-key/);
  });

  it("uses a short timeout / abort signal so a slow upstream cannot hang the handler", async () => {
    await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    // The handler bounds the upstream call — either an AbortSignal (e.g.
    // AbortSignal.timeout) on the fetch init, or `signal` is otherwise present.
    expect(init?.signal, "the upstream fetch must carry an abort/timeout signal").toBeDefined();
  });
});

describe("app/api/forecast GET — missing / invalid lat|lon never hits Open-Meteo (NFR-OBS-01)", () => {
  it("MISSING lat|lon → a degraded typed result WITHOUT fetching upstream", async () => {
    const res = await callGet("http://localhost/api/forecast");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    // Degraded: a typed error (or at least no forecast) and NO upstream call.
    expect(body.forecast).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NON-NUMERIC lat|lon → degraded, no upstream call", async () => {
    const res = await callGet("http://localhost/api/forecast?lat=abc&lon=xyz");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.forecast).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("OUT-OF-RANGE lat|lon (lat=200, lon=999) → degraded, no upstream call (defence in depth)", async () => {
    for (const q of ["lat=200&lon=30", "lat=50&lon=999", "lat=-91&lon=0", "lat=0&lon=181"]) {
      fetchMock.mockClear();
      const res = await callGet(`http://localhost/api/forecast?${q}`);
      expect(res.status, `q="${q}"`).not.toBe(500);
      const body = (await res.json()) as { forecast?: unknown };
      expect(body.forecast, `q="${q}" must not return a forecast`).toBeUndefined();
      expect(fetchMock, `q="${q}" must not fetch upstream`).not.toHaveBeenCalled();
    }
  });
});

describe("app/api/forecast GET — upstream failures degrade to { error: 'failed' }, never a raw 500 (NFR-OBS-01)", () => {
  it("a NON-OK upstream status yields a client-readable typed result, not a 500", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: true, reason: "upstream down" }, { ok: false, status: 500 }),
    );
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    // The client `fetch` must RESOLVE and read a typed body — no raw 500.
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.forecast).toBeUndefined();
    expect(body.error).toBe("failed");
  });

  it("a THROWN fetch (network error) yields { error: 'failed' }, not an unhandled 500", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.forecast).toBeUndefined();
    expect(body.error).toBe("failed");
  });

  it("a 200 whose .json() itself throws is caught and degrades to { error: 'failed' }", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { jsonThrows: true }));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.error).toBe("failed");
  });

  it("a 200 body that FAILS the zod schema is treated like a failed fetch (not partial data)", async () => {
    // A malformed daily column → the body fails the forecast payload contract.
    const bad = buildOpenMeteoBody();
    (bad.daily as unknown as Record<string, unknown>).temperature_2m_max = "not-an-array";
    fetchMock.mockResolvedValueOnce(mockResponse(bad));
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.forecast).toBeUndefined();
    expect(body.error).toBe("failed");
  });

  it("a 200 body with a MISSING hourly block is rejected (the hourly block is validated)", async () => {
    const bad = buildOpenMeteoBody() as unknown as Record<string, unknown>;
    delete bad.hourly;
    fetchMock.mockResolvedValueOnce(mockResponse(bad));
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.error).toBe("failed");
  });

  it("a schema-valid ZERO-day body degrades to { error: 'failed' } (no day to render)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(buildOpenMeteoBody(0, 49)));
    const res = await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { forecast?: unknown; error?: unknown };
    expect(body.forecast).toBeUndefined();
    expect(body.error).toBe("failed");
  });

  it("keeps the server console clean on EVERY failure path (NFR-OBS-01)", async () => {
    const errSpy = console.error as unknown as ReturnType<typeof vi.fn>;
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;

    // network throw
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    // non-OK
    fetchMock.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 503 }));
    await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");
    // zod-failed body
    const bad = buildOpenMeteoBody() as unknown as Record<string, unknown>;
    delete bad.daily;
    fetchMock.mockResolvedValueOnce(mockResponse(bad));
    await callGet("http://localhost/api/forecast?lat=50.45&lon=30.52");

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
