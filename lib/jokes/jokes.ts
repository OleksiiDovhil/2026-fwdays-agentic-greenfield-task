// Framework-free joke selector + daily-rotation key — design.md D1-D2,
// FR-JOKES-01, NFR-OBS-01, TC-PURE-01.
//
// Pure, total, deterministic. No `next/*`, no `react`, no DOM globals, no
// clock/network read of its own: both functions derive everything from the
// `corpus` / `Date` they are handed, so the module is 100% unit-testable on
// synthetic corpora and fixed `Date`s. The corpus content lives in `lib/i18n`
// (`uk.jokes.items` / `en.jokes.items`, D3); this module is content-agnostic and
// accepts any `readonly string[]`.

/**
 * Pick one joke from `corpus` deterministically by an integer `key`.
 *
 * Total and deterministic — the same `key` always yields the same joke (no
 * randomness, no `Date.now()`, no global state), which is what makes the feature
 * demonstrable and unit-testable rather than network-driven (D1).
 *
 * - **Empty corpus → `undefined`, never throws.** `N === 0` is guarded FIRST,
 *   before any `% N` or array access (no division by N), so the caller can treat
 *   `undefined` as "no joke" and omit the line (D1, D4, NFR-OBS-01).
 * - **Non-negative modulo range normalisation.** The index is
 *   `((key % N) + N) % N` — the JS-`%`-keeps-sign correction — so it is always
 *   within `0..N-1` for ANY key: large, exactly at `N`/`2N` (wrap to 0), and
 *   NEGATIVE (`-1 → N-1`). A bare `key % N` would yield a negative index for a
 *   negative key; `Math.abs(key) % N` would map `-1` and `+1` to the same index,
 *   breaking the exactly-one-step-per-day cadence near a wrap. `key` is coerced
 *   toward an integer with `Math.trunc` first so a non-integer never produces a
 *   fractional index (D1).
 * - **Malformed-entry tolerance.** If the resolved entry is not a usable string
 *   (non-string, or empty/whitespace-only after trim), it is treated as absent
 *   and `undefined` is returned rather than throwing on it — the selector never
 *   assumes the corpus is clean (D1, D4, NFR-OBS-01).
 */
export function pickJoke(
  corpus: readonly string[],
  key: number,
): string | undefined {
  const n = corpus.length;
  // Guard the empty corpus BEFORE any `% N` or indexing (no division by zero,
  // no array access) so the selector is total and never throws (D1, D4).
  if (n === 0) return undefined;

  // Coerce toward an integer so a non-integer key never yields a fractional
  // index, then normalise into [0, N) with the non-negative modulo (D1).
  const index = ((Math.trunc(key) % n) + n) % n;
  const entry = corpus[index];

  // Treat a non-string or empty/whitespace-only entry as absent rather than
  // returning/throwing on it (malformed-entry tolerance, D4).
  if (typeof entry !== "string" || entry.trim().length === 0) return undefined;

  return entry;
}

/** Milliseconds in one calendar day — the divisor for the days-since-epoch count. */
const MS_PER_DAY = 86_400_000;

/**
 * Days-since-epoch integer derived from a `Date`'s LOCAL calendar fields (D2).
 *
 * Reads the device-LOCAL `getFullYear()` / `getMonth()` / `getDate()` and
 * converts those exact integers to a day count via
 * `Math.floor(Date.UTC(localY, localM, localD) / 86_400_000)`. `Date.UTC` is
 * used ONLY as a stable arithmetic base for already-local fields — it introduces
 * no time zone and discards the time-of-day and the offset, so:
 *   - two `Date`s on the SAME local calendar day map to the IDENTICAL key
 *     (the joke is stable all local day), and
 *   - the next local calendar day's key is exactly `previous + 1`
 *     (the selected index advances by exactly one position, wrapping N-1 → 0).
 *
 * NOT `toISOString()` / viewer-UTC derived (the locked day-bound rule): a visitor
 * west of UTC would otherwise roll to "tomorrow"'s joke in the evening (and east
 * of UTC still show "yesterday"'s in the morning) — a visible off-by-one drift
 * against the visitor's actual calendar day. Reading the LOCAL Y-M-D makes the
 * rollover happen at the visitor's local midnight.
 *
 * Pure and total for any `Date`: it reads only numeric local fields and does
 * integer arithmetic, so it cannot throw.
 */
export function dailyKey(date: Date): number {
  const localY = date.getFullYear();
  const localM = date.getMonth();
  const localD = date.getDate();
  return Math.floor(Date.UTC(localY, localM, localD) / MS_PER_DAY);
}
