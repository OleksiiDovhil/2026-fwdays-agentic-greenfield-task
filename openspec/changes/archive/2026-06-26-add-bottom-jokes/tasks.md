## 1. Setup (jokes.* i18n corpus — the Ukrainian joke list + EN fallback)

> No database, no migrations, no auth, no email, no network (ADR-0003). No new
> deps — react is installed. The corpus is deterministic, IN-REPO content. Reuse
> the LOCKED app-shell conventions: `lib/i18n` namespaces + the centralised
> dictionary, the AppFooter jokes slot. No new color, so nothing for NFR-A11Y-02
> here.

- [x] 1.1 Add a `jokes` namespace to `lib/i18n/uk.ts` (sibling to `shell.*` —
  never edit `shell.*`) carrying the corpus as an ARRAY of strings:
  `jokes.items: readonly string[]` — a curated list of Ukrainian weather-themed
  jokes. Tone: calm, gentle humor, genuinely weather-themed, natural Ukrainian,
  **no exclamation marks** (BC-BRAND-01). Aim for a small but real list (e.g.
  6–12 entries) so the daily rotation visibly varies. Document in a code comment
  (D3) that this array is the CORPUS, accessed DIRECTLY off the `uk` dictionary
  object (`uk.jokes.items`), NOT via `t()` (which resolves a single string leaf,
  not an array). (D3, NFR-I18N-01.)
- [x] 1.2 Mirror the same `jokes.items` array in `lib/i18n/en.ts` (strict
  fallback subset, same key shape) as the per-index English fallback — same
  count and index alignment as `uk.jokes.items`, same calm tone, no exclamation
  marks (D3, NFR-I18N-01). The footer falls back to `en.jokes.items[i]` only when
  the Ukrainian entry at index `i` is missing/empty.
- [x] 1.3 Note in a code comment (D5) that the inert `shell.jokes.placeholder`
  copy ("Тут зʼявиться легкий жарт про погоду") is now SUPERSEDED by the real
  selected joke. Leave `shell.jokes.*` in place (removing it is a `shell.*` edit,
  §3a) but do NOT consume `shell.jokes.placeholder` from the footer joke
  component. The slot's accessible label `shell.jokes.label` is STILL used.

## 2. Pure domain logic (pickJoke + dailyKey, framework-free, TC-PURE-01)

> A tiny pure module; no `next/*`, no `react`, no DOM globals, no clock/network
> read of its own. Colocated `*.test.ts` with `@trace` ids. Write the section 5
> unit tests FIRST and confirm they FAIL (red) before implementing (test-first
> per AGENTS.md). The selector is content-agnostic — it takes any
> `readonly string[]`, decoupled from where the corpus lives.

- [x] 2.1 `lib/jokes/jokes.ts` — `pickJoke(corpus: readonly string[], key:
  number): string | undefined` (D1, FR-JOKES-01): TOTAL and DETERMINISTIC — the
  same integer `key` always yields the same joke (no randomness, no `Date.now()`,
  no global state). Guard `N === 0` FIRST and return `undefined` before any `% N`
  or indexing (no division by N, no array access). Otherwise index via the
  NON-NEGATIVE modulo `((key % N) + N) % N` (coerce `key` toward an integer first
  so a non-integer never produces a fractional index), so the index is always
  within `0..N-1` for ANY key incl. negative and out-of-range. If the resolved
  entry is not a usable string (non-string, or empty/whitespace-only after trim),
  treat it as absent and return `undefined` rather than throwing (malformed-entry
  tolerance). Never throws.
- [x] 2.2 `lib/jokes/jokes.ts` — `dailyKey(date: Date): number` (D2): a
  days-since-epoch integer computed from the date's LOCAL calendar fields
  (`getFullYear()`/`getMonth()`/`getDate()`), e.g.
  `Math.floor(Date.UTC(localY, localM, localD) / 86_400_000)` where `y/m/d` come
  from the LOCAL getters. It MUST increase by exactly 1 per local calendar day and
  MUST NOT be derived from `toISOString()` / viewer-UTC (the locked day-bound
  rule: use local Y-M-D, never `toISOString().slice(0,10)`). Pure, total for any
  `Date`, no clock read of its own (it derives from the `Date` it is handed). The
  selector stays agnostic to how the key was produced; `dailyKey` is the only key
  the app supplies.

## 3. UI (footer jokes slot component consuming pickJoke(corpus, dailyKey(today)))

> Read `node_modules/next/dist/docs/` (server vs client components) before
> writing. Reuse the AppFooter jokes slot the shell shipped for this purpose. The
> corpus is read DIRECTLY off the dictionary (`uk.jokes.items` / `en.jokes.items`),
> NOT via `t()`.

- [x] 3.1 `components/jokes/FooterJoke.tsx` (D5, FR-JOKES-01): compute
  `const joke = pickJoke(corpus, dailyKey(new Date()))`, applying the per-index
  English fallback — read `uk.jokes.items[i]`, falling back to `en.jokes.items[i]`
  when the Ukrainian entry at the selected index is missing/empty (D3). Render the
  joke `<p>` carrying the slot's accessible label `aria-label={t("shell.jokes.label")}`
  when a joke exists, or render NOTHING (`null`) when `pickJoke` returns `undefined`
  (D4). No joke string is hard-coded in the component (NFR-I18N-01). Keep it a
  server component unless interactivity is needed (D5 — it needs none; a stable
  per-day value rendered as text, no live ticking, so no hydration concern).
- [x] 3.2 Wire into the AppFooter jokes slot (D5, §3a): in
  `components/shell/AppFooter.tsx` REPLACE the inert
  `<p data-slot="jokes" aria-label={t("shell.jokes.label")}>{t("shell.jokes.placeholder")}</p>`
  block with `<FooterJoke/>` (or fold its logic inline), PRESERVING the surrounding
  footer layout (the `flex` row, the Open-Meteo / OpenStreetMap credits `<p>`, the
  privacy line). This is the shell's OWN slot file — do NOT edit `app/page.tsx`.
  When the corpus is empty/malformed the joke `<p>` is omitted entirely (D4), and
  the credits + privacy line still render.

## 4. Layout / page composition

> Intentionally empty. This slice owns NO `app/page.tsx` change: it fills the
> AppFooter jokes slot (the shell's own slot file, §3a), not the shared page
> serialize point. The footer composition itself is unchanged beyond swapping the
> inert placeholder for the selected joke (task 3.2).

## 5. Tests (Vitest only — pure unit + jsdom component + one eval; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–3 to
> green (test-first per AGENTS.md). Every test file carries `@trace` ids. Never
> weaken a test to pass it; if a test contradicts the spec, change it deliberately.

- [x] 5.1 Unit `lib/jokes/jokes.test.ts` — DETERMINISM (FR-JOKES-01, D1): for a
  fixed corpus of N>0 entries, `pickJoke(corpus, key)` called twice with the SAME
  `key` returns the IDENTICAL joke; assert no `fetch`/network is touched during
  selection (e.g. spy on `globalThis.fetch` and assert not called). `@trace
  FR-JOKES-01`.
- [x] 5.2 Unit — MODULO NORMALISATION incl. negative + out-of-range (FR-JOKES-01,
  D1): for a corpus of N entries, assert `pickJoke(corpus, key) === corpus[((key %
  N) + N) % N]` for a key in range, a LARGE key (e.g. `N*1000 + 3`), a key exactly
  at `N` and `2N` (wrap to index 0), and a NEGATIVE key (e.g. `-1` → `corpus[N-1]`,
  `-N` → `corpus[0]`); assert the returned entry is always one of the corpus
  entries (index within `0..N-1`). `@trace FR-JOKES-01`.
- [x] 5.3 Unit — EMPTY corpus → undefined, no throw (FR-JOKES-01, NFR-OBS-01, D1):
  `pickJoke([], key)` returns `undefined` for several keys (incl. 0, a large key,
  a negative key) and does NOT throw (assert `() => pickJoke([], k)).not.toThrow()`).
  `@trace FR-JOKES-01, NFR-OBS-01`.
- [x] 5.4 Unit — MALFORMED entry tolerated (NFR-OBS-01, D1): when the entry at the
  selected index is not a usable string (e.g. a corpus containing a non-string, or
  an empty/whitespace-only string at that index) and no fallback applies,
  `pickJoke` returns `undefined` rather than throwing; assert no throw and a clean
  console. `@trace NFR-OBS-01`.
- [x] 5.5 Unit — `dailyKey` advances by one per LOCAL day + is NOT toISOString-derived
  (FR-JOKES-01, D2): (a) two different `Date`s on the SAME local calendar day (e.g.
  00:10 and 23:50 local) map to the SAME `dailyKey`; (b) the next local calendar
  day's `dailyKey` is exactly `previous + 1`; (c) NOT toISOString-derived — pick a
  local instant late enough that `date.toISOString().slice(0,10)` is already the
  NEXT UTC date while the local calendar date is still today (or assert
  `dailyKey(d)` does not equal a value computed from `d.toISOString().slice(0,10)`
  for such an instant), proving the key follows the LOCAL date not UTC. Combined
  with `pickJoke`, assert the selected index advances by exactly one position
  across consecutive local days (wrapping `N-1 → 0`). `@trace FR-JOKES-01`.
- [x] 5.6 Unit — NO exclamation marks in any joke (BC-BRAND-01, D3): over
  `uk.jokes.items` AND `en.jokes.items` (read directly from the dictionaries),
  assert NO entry contains `!` and every entry is non-empty after `trim()`. (This
  is in addition to the existing `lib/i18n/i18n.test.ts` sweep, which already
  flattens arrays into leaves — keep this focused corpus assertion for a clear
  failure message.) `@trace BC-BRAND-01`.
- [x] 5.7 jsdom component `components/jokes/FooterJoke.test.tsx` — renders a joke
  (FR-JOKES-01, NFR-I18N-01, D5): with a populated corpus, render `FooterJoke` and
  (flushing the mount effect with `act()`) assert the rendered joke text EQUALS the
  expected `corpus[dailyKey(today) mod N]` Ukrainian entry (so it comes from i18n,
  not a hardcoded literal) and that the joke node carries the accessible label from
  `shell.jokes.label`; spy on `console.error`/`console.warn` and assert NEITHER was
  called. Also assert the CLIENT-side mount gate (the first synchronous render shows
  the deterministic index-0 joke — the SSR-equivalent value — then the visitor's
  local-day joke fills in after the mount effect) and the per-index ENGLISH fallback
  (mock `uk.jokes.items` so the SELECTED index is empty while `en.jokes.items[i]` is
  populated, and assert the English joke renders). `@trace FR-JOKES-01, NFR-I18N-01`.
- [x] 5.8 jsdom component — EMPTY corpus omits the line (NFR-OBS-01, D4): with an
  empty corpus (mock the dictionary so `jokes.items` = `[]`), the FooterJoke-level
  omission is asserted in `components/jokes/FooterJoke.test.tsx` and the
  FOOTER-level omission in `components/shell/AppFooter.test.tsx`: render the footer
  (flushing the mount effect with `act()`) and assert the joke `<p>` /
  `data-slot="jokes"` text is NOT present (the line is omitted, not blank), that the
  REST of the footer (the Open-Meteo / OpenStreetMap credits and the privacy line)
  STILL renders, and that the console stays silent (no warning/error).
  `@trace NFR-OBS-01`.
- [x] 5.9 EVAL `evals/cases/jokes-quality.eval.ts` (FR-JOKES-01, BC-BRAND-01,
  NFR-I18N-01) — graded Ukrainian joke quality, target every dimension ≥ 90.
  Browser-free `produce()` returns the Ukrainian joke corpus (`uk.jokes.items`, or
  a representative selection incl. what `pickJoke(corpus, dailyKey(today))` shows
  today) for a fresh `eval-judge` (maker ≠ checker) to grade. `dimension:
  "jokes-quality"`; mark gating lines `CRITICAL:`; mirror the `@trace` footer.
  Rubric grades: CRITICAL natural, fluent Ukrainian (not machine-translated, not
  English, no placeholders); CRITICAL no exclamation mark in any joke (BC-BRAND-01);
  CRITICAL no emoji/pictographic character; CRITICAL each joke is genuinely
  WEATHER-THEMED (about weather, sky, seasons, rain/sun/wind — not a generic joke);
  CRITICAL tone is calm and gently humorous (a light smile, never loud, crude, or
  alarmist); plus quality lines — the jokes read as written by a careful native
  speaker, are distinct from one another, and suit a calm weather app's footer.
  `@trace FR-JOKES-01, BC-BRAND-01, NFR-I18N-01`.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red), then
  implement sections 1–3 to green (test-first per AGENTS.md). Never weaken a test
  to pass it; if a test contradicts the spec, change it deliberately.
- [x] 6.2 Run `npm run lint` — zero errors/warnings.
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green.
- [x] 6.4 Run `npm run build` — production build succeeds; console clean (no
  warning for the footer joke). The once-per-day rotation reads the date at render
  with no live ticking, so there is no hydration concern to surface.
- [x] 6.5 Run `npx openspec validate add-bottom-jokes --strict` — zero
  errors/warnings ("Change 'add-bottom-jokes' is valid").
- [x] 6.6 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [x] 6.7 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-bottom-jokes` implemented/validated/archived, and record the conventions for
  downstream reuse (the `jokes.*` i18n namespace with the `jokes.items` CORPUS
  ARRAY accessed DIRECTLY off the dictionary — not via `t()`; that
  `shell.jokes.placeholder` is now superseded but `shell.jokes.label` is still used;
  `lib/jokes/jokes.ts` `pickJoke` + `dailyKey` as the pure selector/rotation;
  `components/jokes/FooterJoke.tsx` filling the footer jokes slot; the
  local-calendar-date `dailyKey` days-since-epoch pattern as the reusable recipe for
  any future date-keyed rotation) plus the exact next step (Wave 1 complete →
  Wave 2 `add-city-search`).
- [x] 6.8 SERVICE / RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003), step
  by step: (a) DETERMINISM — call `pickJoke(corpus, key)` twice with the same key
  and assert the IDENTICAL joke, and `pickJoke(corpus, dailyKey(today))` twice on
  the same day and assert the same joke; (b) FOOTER RENDER — under jsdom render the
  footer with a populated corpus and assert the selected Ukrainian joke text appears
  with its `shell.jokes.label` accessible label and NO `console.error`/`console.warn`;
  (c) EMPTY-CORPUS OMISSION — render the footer with an empty corpus and assert the
  joke line is OMITTED (not blank) while the credits + privacy line still render and
  the console stays silent. Capture the pass output as the smoke evidence.
- [x] 6.9 GATED on 6.8 passing AND the `jokes-quality` eval meeting the bar (every
  dimension ≥ 90, `node scripts/check-eval-ratchet.mjs` green): `npx openspec
  archive add-bottom-jokes --yes --skip-specs` (the baseline
  `openspec/specs/bottom-jokes/spec.md` already holds the contract, so the delta is
  NOT re-applied via Option B). Do not archive before the render smoke passes.
