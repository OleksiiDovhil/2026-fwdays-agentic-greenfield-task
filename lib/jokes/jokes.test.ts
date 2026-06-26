// Asserts the SPECIFIED behavior of the pure joke selector + daily-rotation key
// pinned by design.md D1-D3 and the `bottom-jokes` spec (Deterministic in-repo
// joke selection, Daily rotation by date-derived key, Ukrainian-first joke copy
// with calm tone, Empty/malformed corpus degrades gracefully). Authored test-first
// (red) against the then-missing `lib/jokes/jokes.ts` module and `jokes.*` corpus;
// both now ship, so the suite is green WITHOUT any assertion having been weakened.
// Never weaken a test to make it pass.
//
// `lib/jokes/jokes.ts` is framework-free (TC-PURE-01): no `next/*`, no `react`,
// no DOM globals, no clock/network read of its own — it derives everything from
// the `corpus` / `Date` it is handed, so it is exercised here on synthetic
// corpora and fixed `Date`s.
//
// The `jokes.*` namespace this slice adds is now typed on the dictionary, so the
// corpus arrays (`uk.jokes.items` / `en.jokes.items`) are read DIRECTLY off the
// well-typed `uk` / `en` objects (no cast).
//
// Contracts under test:
//   - Determinism (D1): same key -> same joke; different in-range keys map to the
//     corresponding corpus entries; no network is touched during selection.
//   - Non-negative modulo (D1): out-of-range AND negative keys normalise into
//     [0, N) via `((key % N) + N) % N` (key N -> index 0, key -1 -> index N-1).
//   - Empty corpus (D1, D4): `pickJoke([], key)` -> undefined, guarded BEFORE any
//     `% N` / indexing, never throws.
//   - Malformed entry (D1, D4): a non-string / empty / whitespace-only selected
//     entry is treated as absent -> undefined, never throws.
//   - dailyKey local-date (D2): advances by exactly 1 per LOCAL calendar day; same
//     local day -> same key; NOT toISOString/UTC-derived (off-by-one proof).
//   - No `!` in the shipped corpus (D3, BC-BRAND-01): no `uk`/`en` joke contains an
//     exclamation mark; every entry is non-empty after trim().
//
// @trace FR-JOKES-01, NFR-OBS-01, BC-BRAND-01
import { describe, it, expect, vi, afterEach } from "vitest";
import { pickJoke, dailyKey } from "@/lib/jokes/jokes";
import * as ukMod from "@/lib/i18n/uk";
import * as enMod from "@/lib/i18n/en";

// A fixed, synthetic corpus — the selector is content-agnostic (D1), so its
// index/wrap/determinism contract is tested on these neutral strings, decoupled
// from the real (eval-graded) joke copy.
const CORPUS: readonly string[] = ["a0", "b1", "c2", "d3", "e4"];
const N = CORPUS.length; // 5

// The reference index the spec pins: a non-negative modulo correct for ANY key
// (large, negative, fractional), always within 0..N-1.
const refIndex = (key: number, n: number): number =>
  ((Math.trunc(key) % n) + n) % n;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickJoke — determinism (D1, FR-JOKES-01)", () => {
  it("returns the SAME joke for the same key, called repeatedly", () => {
    const first = pickJoke(CORPUS, 2);
    const second = pickJoke(CORPUS, 2);
    const third = pickJoke(CORPUS, 2);
    expect(first).toBe("c2"); // CORPUS[2]
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("maps different in-range keys to the corresponding corpus entries", () => {
    for (let key = 0; key < N; key++) {
      expect(pickJoke(CORPUS, key)).toBe(CORPUS[key]);
    }
  });

  it("makes NO network request during selection (no fetch touched)", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((() => {
        throw new Error("pickJoke must not perform a network request");
      }) as unknown as typeof fetch);
    expect(pickJoke(CORPUS, 3)).toBe("d3");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pickJoke — non-negative modulo normalisation (D1, FR-JOKES-01)", () => {
  it("equals corpus[((key % N) + N) % N] for an in-range key", () => {
    const key = 3;
    expect(pickJoke(CORPUS, key)).toBe(CORPUS[refIndex(key, N)]);
  });

  it("normalises a LARGE out-of-range key back into [0, N)", () => {
    const key = N * 1000 + 3; // 5003 -> index 3
    expect(pickJoke(CORPUS, key)).toBe(CORPUS[refIndex(key, N)]);
    expect(pickJoke(CORPUS, key)).toBe("d3");
  });

  it("wraps key === N to index 0 and key === 2N to index 0", () => {
    expect(pickJoke(CORPUS, N)).toBe(CORPUS[0]); // 5 -> 0
    expect(pickJoke(CORPUS, 2 * N)).toBe(CORPUS[0]); // 10 -> 0
    expect(pickJoke(CORPUS, N + 1)).toBe(CORPUS[1]); // 6 -> 1
  });

  it("maps a NEGATIVE key via non-negative modulo, NOT a sign-mirroring abs()", () => {
    // The exact wrap the design pins: -1 -> N-1, -N -> 0, -(N+1) -> N-1.
    expect(pickJoke(CORPUS, -1)).toBe(CORPUS[N - 1]); // -1 -> 4 ("e4")
    expect(pickJoke(CORPUS, -N)).toBe(CORPUS[0]); // -5 -> 0 ("a0")
    expect(pickJoke(CORPUS, -(N + 1))).toBe(CORPUS[N - 1]); // -6 -> 4 ("e4")
    // A bare Math.abs(key) % N would map -1 and +1 to the SAME index, breaking
    // the daily cadence near a wrap — assert -1 and +1 differ.
    expect(pickJoke(CORPUS, -1)).not.toBe(pickJoke(CORPUS, 1));
  });

  it("always returns one of the corpus entries (index within 0..N-1) for assorted keys", () => {
    for (const key of [0, 1, N - 1, N, 2 * N, N * 1000 + 3, -1, -N, -123]) {
      const joke = pickJoke(CORPUS, key);
      expect(CORPUS).toContain(joke);
    }
  });
});

describe("pickJoke — empty corpus degrades, never throws (D1, D4, NFR-OBS-01)", () => {
  it("returns undefined for an empty corpus across several keys", () => {
    for (const key of [0, 3, N * 1000 + 3, -1, -N]) {
      expect(pickJoke([], key)).toBeUndefined();
    }
  });

  it("does NOT throw on an empty corpus (guarded before any % N or indexing)", () => {
    for (const key of [0, 3, N * 1000 + 3, -1, -N]) {
      expect(() => pickJoke([], key)).not.toThrow();
    }
  });

  it("keeps the console silent on the empty-corpus path", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(pickJoke([], 0)).toBeUndefined();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("pickJoke — malformed entry tolerated (D1, D4, NFR-OBS-01)", () => {
  it("returns undefined (no throw) when the selected entry is a non-string", () => {
    // A corpus whose selected index holds a non-string value: the selector must
    // treat it as absent rather than render/return it or throw on it.
    const malformed = ["ok0", 123 as unknown as string, "ok2"];
    expect(() => pickJoke(malformed, 1)).not.toThrow();
    expect(pickJoke(malformed, 1)).toBeUndefined();
    // A well-formed neighbouring index still resolves normally.
    expect(pickJoke(malformed, 0)).toBe("ok0");
  });

  it("returns undefined (no throw) when the selected entry is empty / whitespace-only", () => {
    const malformed = ["ok0", "   ", "ok2"];
    expect(() => pickJoke(malformed, 1)).not.toThrow();
    expect(pickJoke(malformed, 1)).toBeUndefined();
  });

  it("keeps the console silent on the malformed-entry path", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const malformed = ["ok0", "", "ok2"];
    expect(pickJoke(malformed, 1)).toBeUndefined();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("dailyKey — local-calendar days-since-epoch (D2, FR-JOKES-01)", () => {
  it("maps two different times on the SAME local calendar day to the SAME key", () => {
    // 00:10 and 23:50 LOCAL on the same calendar day. `new Date(y, m, d, ...)` is
    // local wall-clock, so these are zone-independent: both are 2026-03-14 locally.
    const earlyLocal = new Date(2026, 2, 14, 0, 10, 0, 0);
    const lateLocal = new Date(2026, 2, 14, 23, 50, 0, 0);
    expect(dailyKey(earlyLocal)).toBe(dailyKey(lateLocal));
  });

  it("advances by EXACTLY 1 from one local calendar day to the next", () => {
    const today = new Date(2026, 2, 14, 12, 0, 0, 0); // 2026-03-14 local
    const tomorrow = new Date(2026, 2, 15, 12, 0, 0, 0); // 2026-03-15 local
    expect(dailyKey(tomorrow)).toBe(dailyKey(today) + 1);

    // And it is monotonic across a longer run of consecutive local days.
    for (let d = 14; d < 20; d++) {
      const a = new Date(2026, 2, d, 8, 0, 0, 0);
      const b = new Date(2026, 2, d + 1, 8, 0, 0, 0);
      expect(dailyKey(b)).toBe(dailyKey(a) + 1);
    }
  });

  it("is NOT toISOString/UTC-derived — a late-local instant whose UTC date is already TOMORROW still maps to TODAY's local key (off-by-one proof)", () => {
    // Build a local instant late enough that its UTC calendar date has already
    // rolled to the next day for any timezone at or west of UTC. We then assert
    // dailyKey reads the LOCAL date, not the UTC date string.
    //
    // 23:30 local on 2026-03-14. For runners west of UTC (e.g. America/*), the
    // UTC instant is already 2026-03-15. We assert dailyKey is unchanged from
    // noon the SAME local day (so it is NOT the UTC-roll), and that it is NOT a
    // value derived from `toISOString().slice(0,10)`.
    const noonLocal = new Date(2026, 2, 14, 12, 0, 0, 0);
    const lateLocal = new Date(2026, 2, 14, 23, 30, 0, 0);

    // Same LOCAL day => identical key, regardless of where UTC midnight falls.
    expect(dailyKey(lateLocal)).toBe(dailyKey(noonLocal));

    // The UTC-derived day count that a toISOString() implementation would yield.
    const utcDayCount = (d: Date): number => {
      const iso = d.toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
      const [y, m, day] = iso.split("-").map(Number);
      return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
    };
    // The LOCAL day count the spec mandates dailyKey to equal.
    const localDayCount = (d: Date): number =>
      Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

    // dailyKey follows the LOCAL date...
    expect(dailyKey(lateLocal)).toBe(localDayCount(lateLocal));

    // ...and when the two disagree (the off-UTC late-evening case), dailyKey does
    // NOT take the UTC value. (When they agree — e.g. a UTC runner — both checks
    // hold trivially; the assertion still pins the LOCAL derivation.)
    if (utcDayCount(lateLocal) !== localDayCount(lateLocal)) {
      expect(dailyKey(lateLocal)).not.toBe(utcDayCount(lateLocal));
    }
  });

  it("drives pickJoke to advance the selected index by exactly one position per local day (wrapping N-1 -> 0)", () => {
    // Across N consecutive local days the selected index walks 0..N-1 by +1 each
    // day and wraps N-1 -> 0 on the following day.
    const base = new Date(2026, 2, 14, 9, 0, 0, 0);
    const baseIdx = refIndex(dailyKey(base), N);
    for (let offset = 0; offset <= N; offset++) {
      const day = new Date(2026, 2, 14 + offset, 9, 0, 0, 0);
      const expected = CORPUS[(baseIdx + offset) % N];
      expect(pickJoke(CORPUS, dailyKey(day))).toBe(expected);
    }
    // After N steps we are back to the starting joke (full wrap).
    const afterWrap = new Date(2026, 2, 14 + N, 9, 0, 0, 0);
    expect(pickJoke(CORPUS, dailyKey(afterWrap))).toBe(CORPUS[baseIdx]);
  });
});

describe("jokes corpus — no exclamation marks, non-empty entries (D3, BC-BRAND-01)", () => {
  // Read the corpus arrays DIRECTLY off the dictionary objects (D3): `t()` resolves
  // a single string leaf and cannot return an array, so the footer (and these
  // tests) read `uk.jokes.items` / `en.jokes.items`. The `jokes.*` namespace is now
  // typed on the dictionary, so these are well-typed string arrays (no cast).
  const uk = ukMod.default ?? ukMod.uk;
  const en = enMod.default ?? enMod.en;

  const ukItems = uk.jokes.items;
  const enItems = en.jokes.items;

  it("ships a non-empty Ukrainian joke corpus (uk.jokes.items)", () => {
    expect(Array.isArray(ukItems)).toBe(true);
    expect((ukItems ?? []).length).toBeGreaterThan(0);
  });

  it("ships a non-empty English fallback corpus (en.jokes.items)", () => {
    expect(Array.isArray(enItems)).toBe(true);
    expect((enItems ?? []).length).toBeGreaterThan(0);
  });

  it("contains NO exclamation mark in any Ukrainian joke and every entry is non-empty after trim", () => {
    for (const [i, joke] of (ukItems ?? []).entries()) {
      expect(typeof joke, `uk.jokes.items[${i}] must be a string`).toBe("string");
      expect(joke, `uk.jokes.items[${i}] must not contain "!"`).not.toContain("!");
      expect(
        joke.trim().length,
        `uk.jokes.items[${i}] must be non-empty after trim`,
      ).toBeGreaterThan(0);
    }
  });

  it("contains NO exclamation mark in any English joke and every entry is non-empty after trim", () => {
    for (const [i, joke] of (enItems ?? []).entries()) {
      expect(typeof joke, `en.jokes.items[${i}] must be a string`).toBe("string");
      expect(joke, `en.jokes.items[${i}] must not contain "!"`).not.toContain("!");
      expect(
        joke.trim().length,
        `en.jokes.items[${i}] must be non-empty after trim`,
      ).toBeGreaterThan(0);
    }
  });
});
