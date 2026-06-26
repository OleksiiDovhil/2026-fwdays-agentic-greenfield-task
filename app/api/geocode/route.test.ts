// Test-first (RED): asserts the SPECIFIED Route Handler data path pinned by
// design.md D1 (server-side keyless geocoding behind `app/api/geocode`) and the
// city-search spec ("Failures and malformed payloads degrade calmly"). The
// implementation (`app/api/geocode/route.ts`) does NOT exist yet — these MUST
// fail because the module is missing, not because of weak assertions. Never
// weaken a test to pass it.
//
// Contract under test (D1, tasks 3.1-3.4, 5.4):
//   - GET(request: Request) reads `?q=`, performs a KEYLESS server-side fetch to
//     the Open-Meteo geocoding URL (the URL/params live ONLY here, TC-DATA-01),
//     parses with `lib/search`, and returns Response.json({ suggestions }) — the
//     client never sees the Open-Meteo URL or raw shape.
//   - Honest degradation (NFR-OBS-01): the handler NEVER returns a raw 500 on bad
//     input or a bad upstream. Empty/oversized/missing `q` -> 200 { suggestions: [] }
//     WITHOUT calling Open-Meteo. A non-OK upstream / a thrown fetch / a zod-failed
//     200 body -> a calm typed result the client can read (status chosen so the
//     client `fetch` RESOLVES; never an unhandled 500), never partial data.
//
// `global.fetch` is MOCKED throughout — the test is deterministic and offline
// (it never hits the real, keyless Open-Meteo).
//
// @trace FR-SEARCH-01, NFR-OBS-01, TC-DATA-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A real-ish Open-Meteo geocoding body for "Kyiv".
const OPEN_METEO_BODY = {
  results: [
    {
      id: 703448,
      name: "Київ",
      latitude: 50.45466,
      longitude: 30.5238,
      country_code: "UA",
      country: "Україна",
      admin1: "Київ",
      elevation: 187,
      timezone: "Europe/Kyiv",
    },
  ],
  generationtime_ms: 0.4,
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
  const { GET } = await import("@/app/api/geocode/route");
  return GET(new Request(url));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => mockResponse(OPEN_METEO_BODY));
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

describe("app/api/geocode GET — happy path returns typed minimal suggestions (TC-DATA-01)", () => {
  it("responds 200 with { suggestions: [...] } mapped to GeoSuggestion", async () => {
    const res = await callGet("http://localhost/api/geocode?q=Kyiv");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions?: unknown };
    expect(Array.isArray(body.suggestions)).toBe(true);
    const suggestions = body.suggestions as Array<Record<string, unknown>>;
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.name).toBe("Київ");
    expect(s.lat).toBe(50.45466);
    expect(s.lon).toBe(30.5238);
    expect(s.countryCode).toBe("UA");
    // The raw Open-Meteo shape never crosses the boundary.
    expect(s.latitude).toBeUndefined();
    expect(s.country_code).toBeUndefined();
    expect(s.elevation).toBeUndefined();
  });

  it("calls the KEYLESS Open-Meteo geocoding URL — the client never sees it (TC-DATA-01)", async () => {
    await callGet("http://localhost/api/geocode?q=Kyiv");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // The upstream geocoding host/path lives ONLY in the handler.
    expect(calledUrl).toContain("geocoding-api.open-meteo.com");
    expect(calledUrl).toContain("/v1/search");
    // The user's query is forwarded (URL-encoded) as the `name` param.
    expect(calledUrl).toMatch(/[?&]name=Kyiv\b/);
    // KEYLESS: no api key / token / auth ANYWHERE in the request (NFR-COST-01).
    expect(calledUrl.toLowerCase()).not.toMatch(/(apikey|api_key|appid|token|key=)/);
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = JSON.stringify(init?.headers ?? {}).toLowerCase();
    expect(headers).not.toMatch(/authorization|x-api-key/);
  });

  it("URL-encodes a non-ASCII query into the upstream request", async () => {
    await callGet(`http://localhost/api/geocode?q=${encodeURIComponent("Київ")}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // The Cyrillic query reaches Open-Meteo percent-encoded, never raw/garbled.
    expect(calledUrl).toContain(encodeURIComponent("Київ"));
  });
});

describe("app/api/geocode GET — empty results is 200 not an error (NFR-OBS-01)", () => {
  it("returns 200 { suggestions: [] } when Open-Meteo returns no results", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));
    const res = await callGet("http://localhost/api/geocode?q=zzzzzzzz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions?: unknown; error?: unknown };
    expect(body.suggestions).toEqual([]);
    // Zero results is NOT an error — no error field on this branch.
    expect(body.error).toBeUndefined();
  });

  it("treats an absent `results` key as zero results (200, empty)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ generationtime_ms: 0.1 }));
    const res = await callGet("http://localhost/api/geocode?q=anything");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions?: unknown };
    expect(body.suggestions).toEqual([]);
  });
});

describe("app/api/geocode GET — empty/missing/oversized q never hits Open-Meteo", () => {
  it("returns 200 { suggestions: [] } for a MISSING q, without fetching", async () => {
    const res = await callGet("http://localhost/api/geocode");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions?: unknown };
    expect(body.suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 200 { suggestions: [] } for an EMPTY / whitespace q, without fetching", async () => {
    for (const q of ["", "   ", "%20%20"]) {
      fetchMock.mockClear();
      const res = await callGet(`http://localhost/api/geocode?q=${q}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { suggestions?: unknown };
      expect(body.suggestions).toEqual([]);
      expect(fetchMock, `q="${q}" must not fetch upstream`).not.toHaveBeenCalled();
    }
  });

  it("caps an oversized q at 120 chars before the upstream request (defence in depth)", async () => {
    const huge = "k".repeat(5000);
    const res = await callGet(`http://localhost/api/geocode?q=${huge}`);
    // The handler still responds calmly (200), and if it fetched at all the sent
    // `name` is bounded to 120 chars — never the unbounded 5,000-char value.
    expect(res.status).toBe(200);
    if (fetchMock.mock.calls.length > 0) {
      const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
      const sentName = calledUrl.searchParams.get("name") ?? "";
      expect(sentName.length).toBeLessThanOrEqual(120);
      expect(sentName.length).toBeLessThan(5000);
    }
  });
});

describe("app/api/geocode GET — upstream failures degrade to a calm typed result, never a raw 500", () => {
  it("a NON-OK upstream status yields a client-readable result, not a 500", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: true, reason: "upstream down" }, { ok: false, status: 503 }),
    );
    const res = await callGet("http://localhost/api/geocode?q=Kyiv");
    // The client `fetch` must RESOLVE and be able to read a typed body — so the
    // handler does NOT surface a raw 500 to the visitor.
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { suggestions?: unknown; error?: unknown };
    // Either a typed error OR an empty suggestions list — but NEVER partial data
    // from the upstream error body.
    const hasTypedError = typeof body.error === "string";
    const hasEmptySuggestions = Array.isArray(body.suggestions);
    expect(hasTypedError || hasEmptySuggestions).toBe(true);
    if (hasEmptySuggestions) expect(body.suggestions).toEqual([]);
  });

  it("a THROWN fetch (network error) yields a calm typed result, not an unhandled 500", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let res!: Response;
    // The handler must not let the rejection escape as an unhandled error.
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/geocode?q=Kyiv");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { suggestions?: unknown; error?: unknown };
    expect(typeof body.error === "string" || Array.isArray(body.suggestions)).toBe(true);
  });

  it("a 200 body that FAILS the zod schema is treated like a failed fetch, not rendered", async () => {
    // `results` is a string -> the body fails the geocoding payload contract.
    fetchMock.mockResolvedValueOnce(mockResponse({ results: "not-an-array" }));
    const res = await callGet("http://localhost/api/geocode?q=Kyiv");
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { suggestions?: unknown; error?: unknown };
    // Never partial / malformed suggestions: either a typed error or empty list.
    if (Array.isArray(body.suggestions)) {
      expect(body.suggestions).toEqual([]);
    } else {
      expect(typeof body.error).toBe("string");
    }
  });

  it("a 200 whose .json() itself throws is caught and degrades calmly", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { jsonThrows: true }));
    let res!: Response;
    await expect(
      (async () => {
        res = await callGet("http://localhost/api/geocode?q=Kyiv");
      })(),
    ).resolves.not.toThrow();
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { suggestions?: unknown; error?: unknown };
    expect(typeof body.error === "string" || Array.isArray(body.suggestions)).toBe(true);
  });

  it("keeps the server console clean on the failure paths (NFR-OBS-01)", async () => {
    const errSpy = console.error as unknown as ReturnType<typeof vi.fn>;
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await callGet("http://localhost/api/geocode?q=Kyiv");
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
