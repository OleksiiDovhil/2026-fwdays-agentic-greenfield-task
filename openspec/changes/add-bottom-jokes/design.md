## Context

`add-bottom-jokes` is a Wave 1 leaf slice (capability plan §4.4, §6) off the
archived `add-app-shell` foundation. The shell already shipped the file this slice
fills: `components/shell/AppFooter.tsx` renders an **inert jokes slot**
(`data-slot="jokes"`) explicitly "owned by the bottom-jokes slice later", currently
showing `{t("shell.jokes.placeholder")}`. This slice replaces that placeholder with
a real, selected joke and adds a sibling `jokes.*` i18n namespace — it touches no
other shell file and does **not** edit the shared `app/page.tsx` serialize point
(§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email, no network**. The joke corpus is **deterministic, in-repo content**
— there is no remote joke source. Tests are **Vitest** (pure unit tests for the
selector, jsdom component test for the footer) — **no Playwright** (TC-STACK-05).
The per-slice "smoke" is a **service/render smoke** (drive the pure selector +
render the footer + assert the empty-corpus omission), not a DB smoke.

The locked conventions reused verbatim: the centralised `lib/i18n` dictionary with
per-domain namespaces (add `jokes.*`, never reach into `shell.*`), the AppFooter
jokes slot, and the framework-free `lib/<domain>/` rule (TC-PURE-01). The joke
feature introduces **no color**, so NFR-A11Y-02 (contrast) has nothing new to
verify here.

## Goals / Non-Goals

**Goals:**

- Fill the AppFooter jokes slot with a single Ukrainian, weather-themed joke chosen
  **deterministically** from an in-repo corpus by a **pure** selector
  `pickJoke(corpus, key)` (FR-JOKES-01) — no network, no cookie, no tracking
  (BC-PRIVACY-01, BC-PRIVACY-03).
- Make the joke rotate by exactly one position per **local calendar day** via a
  pure `dailyKey(date)` (days-since-epoch from the LOCAL date), with no
  `toISOString()` / viewer-UTC drift (the locked day-bound rule).
- Source every joke string from the centralised `lib/i18n` (`jokes.*`), Ukrainian
  default + English per-index fallback, calm tone, no exclamation marks
  (NFR-I18N-01, BC-BRAND-01).
- Degrade honestly (NFR-OBS-01): an empty corpus omits the joke line; a malformed
  entry never crashes the selector or the footer; console stays silent.
- Keep the selection + rotation logic framework-free and unit-testable (TC-PURE-01);
  the React/DOM concern is only the thin footer component.

**Non-Goals (see the spec Exclusions):**

- Randomness, a shuffle, or a "next joke" button — the only cadence shipped is the
  daily one.
- Any external joke API / network fetch / API key; the corpus is entirely in-repo.
- Per-visitor personalisation or persistence (no cookie/storage, BC-PRIVACY-03).
- Coupling the joke to the current forecast / temperature / sky condition.
- Mechanical "weather-themed" verification (no keyword list, no NLP) — theming is a
  content-authoring quality reviewed by humans + the eval, not a unit assertion.
- Localisation beyond Ukrainian (default) and English (fallback).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom component tests.

## Decisions

### D1 — A pure framework-free selector `pickJoke(corpus, key)` (FR-JOKES-01, TC-PURE-01)

- **`lib/jokes/jokes.ts`** exports `pickJoke(corpus, key)` and is
  **framework-free** (no `next/*`, no `react`, no DOM globals, no clock/network read
  of its own — TC-PURE-01). Signature:
  `pickJoke(corpus: readonly string[], key: number): string | undefined`.
- **Total and deterministic.** It returns a defined value for **every** input,
  including an empty corpus, and the **same integer `key` always yields the same
  joke** (no randomness, no `Date.now()`, no global state). This is what makes the
  feature demonstrable and unit-testable rather than network-driven (spec: "Same key
  yields the same joke").
- **Non-negative modulo range normalisation.** The index is
  `((key % N) + N) % N` (the JS-`%`-keeps-sign correction), so the index used is
  **always within `0..N-1`** regardless of how large `key` is **and for negative
  keys** — a plain `key % N` would yield a negative index for negative keys and
  index out of bounds. `key` is also coerced toward an integer
  (`Math.trunc`/`Math.floor` on the input) so a non-integer never produces a
  fractional index (spec: "Key is normalised into corpus range"). Returns
  `corpus[index]`.
- **Empty corpus → `undefined`, never throws.** When `N === 0`, the function
  returns `undefined` **before** any indexing or `% N` (no division by N, no array
  access), so it does not throw and the footer treats `undefined` as "no joke"
  (spec: "Empty corpus returns undefined from the selector"). Guard the length first.
- **Malformed-entry tolerance.** If the resolved entry is not a usable string
  (non-string, or empty/whitespace-only after trim), the selector treats it as
  absent and returns `undefined` rather than throwing on it (spec: "Malformed entry
  does not crash the selector"). The selector never assumes the corpus is clean.
- **Trade-off:** `((key % N) + N) % N` (vs a bare `key % N` or `Math.abs(key) % N`)
  is the only formula that is correct for **negative** keys without mirroring the
  sequence (`Math.abs` would map `-1` and `+1` to the same index, breaking the
  exactly-one-step-per-day cadence near the epoch / across a wrap). The double-mod
  is two cheap operations and is the standard non-negative-modulo idiom; it costs
  nothing and is the only choice that keeps the daily cadence monotonic. Returning
  `string | undefined` (vs throwing on empty, or returning `""`) pushes the
  "no joke" decision to the caller cleanly and keeps the selector total — the footer
  branches on `undefined` to omit the line, which is exactly the honest-degradation
  requirement.

### D2 — Daily rotation: a pure `dailyKey(date)` from the LOCAL calendar date

- **`dailyKey(date: Date): number`** in the same module returns a **days-since-epoch
  integer** computed from the date's **local calendar fields** —
  `getFullYear()` / `getMonth()` / `getDate()` (the device-local Y-M-D), e.g. via
  `Math.floor(Date.UTC(y, m, d) / 86_400_000)` where `y/m/d` come from the **local**
  getters. The result increases by **exactly 1** for each successive local calendar
  day, so `pickJoke(corpus, dailyKey(today))` advances the selected index by exactly
  one position per local day, wrapping `N-1 → 0` (spec: "Daily rotation by
  date-derived key").
- **Local date, NOT `toISOString()` / viewer-UTC.** This is the locked day-bound
  rule (AGENTS.md: use local calendar dates for day-bound logic, **never**
  `toISOString().slice(0,10)`). `toISOString()` formats in UTC, so for a visitor west
  of UTC the evening would already roll to "tomorrow"'s joke (and east of UTC the
  morning would still show "yesterday"'s) — a visible off-by-one drift against the
  visitor's actual calendar day. Reading the **local** Y-M-D and converting those
  exact integers to a day count (the `Date.UTC(localY, localM, localD)` trick uses
  UTC only as a stable arithmetic base for already-local fields, introducing no
  zone) makes the rollover happen at the visitor's local midnight. **ADR-worthy?**
  No — this is the application of an already-accepted cross-cutting rule, not a new
  architectural decision; it is recorded here for the record but needs no ADR.
- **Selector stays agnostic.** `pickJoke` makes **no per-day promise** for arbitrary
  keys; the exactly-one-step-per-day cadence is a property of `dailyKey`'s output,
  not of the selector. `dailyKey` is the only key the app supplies (spec Exclusion:
  "the only key the app supplies is the local date"). Keeping them separate lets the
  selector be tested purely on integers and `dailyKey` be tested purely on dates.
- **Trade-off:** deriving the key from `Date.UTC(localY, localM, localD)` (vs
  `Math.floor(date.getTime() / 86_400_000)`) deliberately **discards the
  time-of-day and the zone offset** so the count is a pure function of the local
  calendar date — two renders on the same local day map to the identical key
  (stable joke that day), and only a local-midnight rollover changes it. Using
  `getTime()` directly would fold in the UTC offset and the time-of-day, reintroducing
  exactly the viewer-UTC drift the rule forbids. The chosen form is slightly more
  code than a one-liner but is the only one that satisfies both "same joke all day"
  and "advances at local midnight".

### D3 — Corpus + i18n: a `jokes.items` ARRAY accessed directly from the dictionary (NFR-I18N-01)

- **Shape decision (the load-bearing i18n design).** The joke strings live under a
  **`jokes.*`** namespace in `lib/i18n/uk.ts` (Ukrainian default) and `en.ts`
  (English fallback) as an **array of strings**: `jokes.items: readonly string[]`
  (sibling to `shell.*`, never reaching into it). The corpus is accessed **directly
  from the exported `uk` / `en` dictionary objects** — `uk.jokes.items` (with
  `en.jokes.items` as the per-index fallback) — **not** through the `t()` accessor.
  Reason: `t(key)` resolves a **single string leaf** (its `lookup` returns the string
  leaf or `null`), so it cannot return an array; the dotted-leaf `MessageKey` type
  would only expose individual elements like `"jokes.items.0"`, which is the wrong
  granularity for "give me the whole corpus". So the footer reads the array directly
  from the dictionary and hands it to `pickJoke`; the `t()` path is still used for the
  slot's accessible label (`shell.jokes.label`). Both `uk` and `en` are already
  exported from `lib/i18n` (`export const uk`/`en` + re-export in `index.ts`), so no
  new export plumbing is needed.
  - **Why an array, not numbered keys** (e.g. `jokes.item0`, `jokes.item1`): an array
    is the natural list shape, indexes cleanly with `corpus[index]`, and keeps the
    count = `corpus.length` without a manual key list. It is documented here so a
    later reader knows the corpus is `dictionary.jokes.items`, accessed off the
    dictionary object, not assembled from scattered numbered keys.
- **Existing exclamation-sweep coverage is automatic.** The project's i18n test
  (`lib/i18n/i18n.test.ts`) flattens nested dictionary values into dotted leaves and
  recurses into **objects, arrays included** (`Object.entries(["a","b"])` →
  `[["0","a"],["1","b"]]`), so every joke string surfaces as a leaf (`jokes.items.0`,
  `jokes.items.1`, …) and is **already** covered by the existing "no `!` in any
  Ukrainian/English value" sweep across both locales (BC-BRAND-01). The slice's own
  corpus test (D-tests) additionally asserts no `!` and non-emptiness over
  `jokes.items` directly, for a focused failure message.
- **Per-index English fallback.** When a Ukrainian entry at index *i* is missing or
  empty, the footer falls back to `en.jokes.items[i]` for that index (spec: "English
  fallback when an entry is missing"). This is a per-index mirror of the global
  `t()` UK→EN policy, applied to the array.
- **Content quality (eval-graded, not unit-asserted).** The Ukrainian `items` are
  curated to be **calm, gently humorous, genuinely weather-themed, natural
  Ukrainian, with no exclamation marks** (BC-BRAND-01). "Weather-themed" is a
  content-authoring quality — **no test mechanically verifies theming** (spec
  Exclusion); it is graded by the eval case (D-tests, target ≥ 90) and reviewed by a
  human (maker ≠ checker).
- **Trade-off:** keeping the corpus in i18n (vs a standalone `lib/jokes/corpus.ts`)
  costs the array-vs-string-leaf shape awkwardness above, but it honors NFR-I18N-01
  ("all joke strings from the centralised i18n module", restated in the spec
  requirement "Ukrainian-first joke copy") and gets the bilingual fallback + the
  existing `!`-sweep for free. The selector itself stays content-agnostic — it takes
  any `readonly string[]`, so it is decoupled from where the corpus lives and is
  tested on synthetic corpora.

### D4 — Honest degradation: empty corpus omits the line, malformed entry never crashes (NFR-OBS-01)

- **Empty corpus → omit the joke line.** When `pickJoke` returns `undefined` (empty
  corpus, or a malformed selected entry with no fallback), the footer **does not
  render the joke `<p>` at all** — no crash, no raw error, no blank-but-present slot
  with empty text (spec: "Empty corpus omits the joke line", "Malformed entry does
  not crash the selector"). The rest of the footer (the Open-Meteo / OpenStreetMap
  credits and the privacy line) renders normally, and the runtime **console emits no
  warning or error** on a healthy session (NFR-OBS-01).
- **Selector + footer share the contract.** `pickJoke` is total (D1), so the footer's
  only branch is `joke ? <p>…</p> : null` (after applying the per-index EN fallback).
  There is no try/catch needed because the selector never throws; the footer's
  omission is the calm degraded state.
- **Trade-off:** omitting the element entirely (vs rendering an empty `<p>` or a
  fallback "—" placeholder) keeps the degraded footer visually clean and avoids an
  empty labelled region that a screen reader might still announce; the cost is that
  the jokes slot simply disappears when the corpus is empty, which is the intended
  calm behaviour, not a defect (spec Exclusion + NFR-OBS-01).

### D5 — UI: fill the AppFooter jokes slot (§3a, not an app/page.tsx edit)

- A thin component (e.g. **`components/jokes/FooterJoke.tsx`**) computes
  `const joke = pickJoke(corpus, dailyKey(new Date()))` — applying the per-index EN
  fallback (D3) — and renders the joke `<p>` (with the slot's accessible label
  `t("shell.jokes.label")`) or `null` when there is no joke (D4). It reads the corpus
  array directly from the dictionary (`uk.jokes.items` / `en.jokes.items`).
- **Wire into the slot:** in `components/shell/AppFooter.tsx`, **replace** the inert
  block — the `<p data-slot="jokes" aria-label={t("shell.jokes.label")}>
  {t("shell.jokes.placeholder")}</p>` — with `<FooterJoke/>` (or fold the logic
  inline), **preserving** the surrounding footer layout (the `flex` row, the credits
  `<p>`, the privacy line). This is the shell's **own** slot file, shipped for
  exactly this purpose — **not** an edit to the shared `app/page.tsx` serialize point
  (§3a). The inert `shell.jokes.placeholder` copy is **superseded** but **left in
  place** (removing it is a `shell.*` edit, §3a); `FooterJoke` does not consume it.
- **Server vs client:** the footer renders on the server today (it imports only `t`).
  `dailyKey(new Date())` reads the clock at render. Reading the date during a server
  render is fine for a once-per-day rotation (the joke is the same all local day);
  this is **not** the per-second hydration problem the clock had (no live ticking, no
  per-render churn). If the AppFooter must stay a pure server component and a
  client/server date-source split is desired, the simplest correct option is to keep
  `FooterJoke` server-rendered too (no `"use client"`), since it needs no
  interactivity — it computes a stable daily value and renders text. (Decide at
  implementation per the Next 16 server/client guide; the spec requires only
  determinism-per-day + console silence, both of which a server render satisfies.)
- **Trade-off:** editing `AppFooter.tsx` (vs a brand-new top-level slot) is the
  intended design — the shell created the inert jokes slot specifically so this slice
  fills it with a small swap; the footer is not a multi-slice serialize point the way
  `app/page.tsx` is.

## Data model

No persistent data, no DB, no schema (ADR-0003). The "data" is the **in-repo corpus**
— `jokes.items: readonly string[]` in `lib/i18n/uk.ts` (+ `en.ts` fallback) — and the
ephemeral selection is computed at render with no state. The pure surface is two
functions in `lib/jokes/jokes.ts`:

- `pickJoke(corpus: readonly string[], key: number): string | undefined` — total,
  deterministic, non-negative-modulo index, empty → `undefined`, malformed entry →
  `undefined`, never throws (D1).
- `dailyKey(date: Date): number` — days-since-epoch from the **local** calendar date;
  increases by exactly 1 per local day; never `toISOString`-derived (D2).

The corpus is read **directly from the dictionary** (`uk.jokes.items`, with
`en.jokes.items` as the per-index fallback), not via `t()` (D3).

## Error handling strategy

- There is **no user input and no external call**, so there is no fetch/parse error
  path to surface — the joke path cannot 500 or blank (NFR-OBS-01 is satisfied by
  construction, BC-PRIVACY-01/03).
- `pickJoke` is **total**: empty corpus returns `undefined` (guarded before any
  indexing or `% N`), and a malformed entry is treated as absent rather than thrown
  on, so it cannot throw for the values an in-repo corpus yields (D1).
- `dailyKey` reads only numeric local date fields and does integer arithmetic, so it
  is total for any `Date` and cannot throw (D2).
- The honest-under-failure obligation therefore reduces to: the footer **omits the
  joke line** when there is no usable joke (D4) and the **console stays silent** on a
  healthy session. A jsdom test asserts the footer renders a joke on a populated
  corpus and omits the line (with no `console.error`/`console.warn`) on an empty one.

## Risks / Trade-offs

- **Off-by-one daily drift (highest):** deriving the key from `toISOString()` (UTC)
  would roll the joke at UTC midnight, not the visitor's local midnight — a visible
  wrong-day joke for off-UTC visitors (the exact failure the locked rule forbids).
  Mitigation — `dailyKey` reads the **local** Y-M-D and converts those integers to a
  day count (D2); a unit test asserts (a) two `Date`s on the same local day map to the
  same key, (b) the next local day's key is exactly `+1`, and (c) the value is **not**
  `toISOString().slice(0,10)`-derived (e.g. a late-evening local time whose UTC date is
  already the next day still maps to today's key).
- **Negative / out-of-range key indexing:** a bare `key % N` yields a negative index
  for negative keys (out of bounds), and a huge key must still land in range.
  Mitigation — the non-negative `((key % N) + N) % N` (D1); unit tests cover a large
  key, a negative key, and `key` exactly at `N` / `2N` (wrap to 0).
- **Empty / malformed corpus crash:** indexing `corpus[key % 0]` or rendering a
  non-string would throw / blank the footer (NFR-OBS-01). Mitigation — `pickJoke`
  guards `N === 0` before any `% N` and treats a malformed entry as absent (D1, D4);
  unit tests assert `pickJoke([], k) === undefined` and that a malformed entry yields
  `undefined` (no throw), and a jsdom test asserts the footer omits the line with a
  silent console.
- **Exclamation marks / off-tone copy:** a joke with `!` or an alarming tone violates
  BC-BRAND-01. Mitigation — the corpus is swept for `!` by both the existing
  `lib/i18n/i18n.test.ts` (arrays flattened) and the slice's own corpus test, and the
  Ukrainian quality (calm, gentle, weather-themed, natural Ukrainian) is **eval-graded
  to ≥ 90** (maker ≠ checker).
- **i18n-shape confusion:** a future contributor might try `t("jokes.items")` and get
  `""` (it is not a string leaf). Mitigation — documented in D3 and in `lib/i18n/uk.ts`
  comments: the corpus is an **array accessed off the dictionary object**, the `t()`
  accessor is for single-string labels only.
- **Scope creep:** the temptation to add randomness, a "next joke" button, or
  weather-condition coupling is resisted — all are explicit Exclusions; the only
  cadence shipped is the local-daily rotation, the only key is `dailyKey`.
