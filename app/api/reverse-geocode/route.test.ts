// Test-first (RED): asserts the SPECIFIED reverse-geocode Route Handler data path
// pinned by design.md D1 / ADR-0005 and the map spec ("Click-to-relocate via
// reverse geocoding…", "Malformed reverse-geocode payload is treated as no usable
// place", "Reverse geocoding request fails"). The implementation
// (`app/api/reverse-geocode/route.ts`) does NOT exist yet — these MUST fail
// because the module is MISSING, not because of weak assertions. Never weaken a
// test to pass it.
//
// Contract under test (D1, ADR-0005, tasks 3.1-3.4, 5.3) — mirrors
// `app/api/geocode/route.ts` exactly:
//   - GET(request: Request) reads `?lat=&lon=`, NORMALIZES them (clamp lat / wrap
//     lon) via lib/geo, performs a KEYLESS server-side fetch to the OSM Nominatim
//     reverse URL (the URL/params live ONLY here, TC-DATA-01) with a descriptive
//     User-Agent + Referer (Nominatim policy) and an AbortSignal.timeout, parses
//     with `lib/geo` (parseReverseName), and returns Response.json({ name }) — the
//     client never sees the Nominatim URL or raw shape.
//   - Honest degradation (NFR-OBS-01): the handler NEVER returns a raw 500. Missing
//     / non-numeric lat|lon -> 200 { name: null } WITHOUT calling Nominatim. A
//     non-OK upstream / a thrown fetch / a timeout / a `.json()` throw / a
//     zod-failed 200 body -> 200 { name: null } (a client-readable status the
//     client `fetch` RESOLVES and reads), never partial data, never the raw
//     Nominatim shape.
//
// `global.fetch` is MOCKED throughout — deterministic and offline (it never hits
// the real, keyless Nominatim).
//
// @trace FR-MAP-03, NFR-OBS-01, TC-DATA-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A real-ish Nominatim `jsonv2` reverse body for a point in Odesa.
const NOMINATIM_BODY = {
  place_id: 12345678,
  osm_type: "relation",
  osm_id: 1234567,
  lat: "46.4843023",
  lon: "30.7322878",
  category: "boundary",
  type: "administrative",
  addresstype: "city",
  name: "Одеса",
  display_name: "Одеса, Одеський район, Одеська область, 65000, Україна",
  address: {
    city: "Одеса",
    county: "Одеський район",
    state: "Одеська область",
    postcode: "65000",
    country: "Україна",
    country_code: "ua",
  },
};

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
  const { GET } = await import("@/app/api/reverse-geocode/route");
  return GET(new Request(url));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => mockResponse(NOMINATIM_BODY));
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

describe("app/api/reverse-geocode GET — happy path returns the typed minimal { name } (TC-DATA-01)", () => {
  it("responds 200 with { name: 'Одеса' } projected from the Nominatim body", async () => {
    const res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBe("Одеса");
  });

  it("never leaks the raw Nominatim shape across the boundary (only { name })", async () => {
    const res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    const body = (await res.json()) as Record<string, unknown>;
    // The minimal DTO is exactly { name } — none of the verbose Nominatim fields.
    expect(Object.keys(body)).toEqual(["name"]);
    expect(body.address).toBeUndefined();
    expect(body.display_name).toBeUndefined();
    expect(body.osm_id).toBeUndefined();
    expect(body.place_id).toBeUndefined();
    expect(body.country_code).toBeUndefined();
  });

  it("calls the KEYLESS Nominatim reverse URL with the pinned params — the client never sees it (TC-DATA-01)", async () => {
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // The upstream reverse host/path lives ONLY in the handler.
    expect(calledUrl).toContain("nominatim.openstreetmap.org/reverse");
    // HTTPS only (TC-MAP-01-adjacent obligations).
    expect(calledUrl.startsWith("https://")).toBe(true);
    // The pinned Nominatim params.
    const url = new URL(calledUrl);
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("zoom")).toBe("10");
    expect(url.searchParams.get("accept-language")).toBe("uk");
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(46.4825, 4);
    expect(Number(url.searchParams.get("lon"))).toBeCloseTo(30.7233, 4);
    // KEYLESS: no api key / token / auth ANYWHERE in the request (NFR-COST-01).
    expect(calledUrl.toLowerCase()).not.toMatch(/(apikey|api_key|appid|token|key=)/);
  });

  it("sends a descriptive User-Agent (and a Referer) per the Nominatim usage policy", async () => {
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    // Read headers whether passed as a plain object or a Headers instance.
    const rawHeaders = init?.headers ?? {};
    const headers =
      typeof (rawHeaders as Headers).get === "function"
        ? rawHeaders as Headers
        : new Headers(rawHeaders as Record<string, string>);
    const ua = headers.get("user-agent") ?? headers.get("User-Agent") ?? "";
    expect(ua.trim().length, "a descriptive User-Agent is required by Nominatim").toBeGreaterThan(0);
    const referer = headers.get("referer") ?? headers.get("Referer") ?? "";
    expect(referer.trim().length, "a Referer identifying the app is required by Nominatim").toBeGreaterThan(0);
    // No auth header smuggled in (keyless).
    expect(JSON.stringify(rawHeaders).toLowerCase()).not.toMatch(/authorization|x-api-key/);
  });

  it("bounds the upstream call with a timeout signal (AbortSignal.timeout)", async () => {
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    // A hung Nominatim must not leave the request pending forever — a signal is set.
    expect(init?.signal, "the upstream fetch must carry an abort signal (timeout)").toBeDefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("app/api/reverse-geocode GET — normalizes out-of-range coordinates before the upstream call (the antimeridian scenario)", () => {
  it("wraps an out-of-range longitude (190.5 -> -169.5) before fetching Nominatim", async () => {
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=190.5");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    // The handler must send the NORMALIZED lon, never the raw out-of-range value.
    expect(Number(url.searchParams.get("lon"))).toBeCloseTo(-169.5, 4);
    expect(Number(url.searchParams.get("lon"))).not.toBeCloseTo(190.5, 4);
  });

  it("clamps an out-of-range latitude (95 -> 90) before fetching Nominatim", async () => {
    await callGet("http://localhost/api/reverse-geocode?lat=95&lon=30");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Number(url.searchParams.get("lat"))).toBeCloseTo(90, 4);
  });
});

describe("app/api/reverse-geocode GET — missing/invalid lat|lon -> { name: null } WITHOUT calling Nominatim", () => {
  it("returns 200 { name: null } when lat|lon are MISSING, without fetching", async () => {
    const res = await callGet("http://localhost/api/reverse-geocode");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 200 { name: null } for NON-NUMERIC lat|lon, without fetching", async () => {
    for (const qs of ["lat=abc&lon=30", "lat=46&lon=xyz", "lat=&lon=", "lat=NaN&lon=Infinity"]) {
      fetchMock.mockClear();
      const res = await callGet(`http://localhost/api/reverse-geocode?${qs}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name?: unknown };
      expect(body.name, `"${qs}" must yield { name: null }`).toBeNull();
      expect(fetchMock, `"${qs}" must not call Nominatim`).not.toHaveBeenCalled();
    }
  });
});

describe("app/api/reverse-geocode GET — upstream failures degrade to { name: null }, never a raw 500 (NFR-OBS-01)", () => {
  it("a NON-OK upstream status yields { name: null }, not a 500", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: "rate limited" }, { ok: false, status: 429 }),
    );
    const res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    // The client `fetch` must RESOLVE and read a typed body — never a raw 500.
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("a THROWN fetch (network error) yields { name: null }, not an unhandled 500", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("a TIMEOUT (an aborted/rejected fetch) yields { name: null }", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("a 200 whose .json() itself throws is caught and degrades to { name: null }", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { jsonThrows: true }));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("a 200 body that FAILS the zod schema (an `{ error }` body) yields { name: null }, not partial data", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: "Unable to geocode" }));
    const res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("a 200 body with no usable place (no locality, no display_name) yields { name: null }", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ address: { country_code: "ua" } }));
    const res = await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    const body = (await res.json()) as { name?: unknown };
    expect(body.name).toBeNull();
  });

  it("keeps the server console clean on the failure paths (NFR-OBS-01)", async () => {
    const errSpy = console.error as unknown as ReturnType<typeof vi.fn>;
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    fetchMock.mockResolvedValueOnce(mockResponse({ error: "Unable to geocode" }));
    await callGet("http://localhost/api/reverse-geocode?lat=46.4825&lon=30.7233");
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
