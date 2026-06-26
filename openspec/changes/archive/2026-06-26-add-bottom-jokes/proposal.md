## Why

`add-bottom-jokes` is a Wave 1 leaf slice on top of the now-archived
`add-app-shell` foundation (capability plan §4.4, §6). It fills the inert
**jokes slot** the shell reserved in `components/shell/AppFooter.tsx`
(`data-slot="jokes"`, "owned by the bottom-jokes slice later") with a single,
calm, Ukrainian, weather-themed joke drawn from an **in-repo** corpus
(FR-JOKES-01). The joke gives the page a small human touch without any external
API, network call, cookie, or tracking (BC-PRIVACY-01, BC-PRIVACY-03). It is a
self-contained widget: it owns no weather data, makes no network call, persists
nothing, and depends only on the shell's locked conventions (the `t()` i18n
accessor, the centralised `lib/i18n` dictionary, the AppFooter jokes slot).

The slice is deliberately narrow, but the bar is high on the qualities the spec
pins. Selection is **deterministic, not random**: a pure selector
`pickJoke(corpus, key)` keyed on a caller-supplied integer always returns the
same joke for the same key, so the behaviour is demonstrable and unit-testable
rather than network-driven (FR-JOKES-01). The footer supplies that key as the
visitor's **local calendar date** expressed as a days-since-epoch integer, so the
shown joke advances by exactly one position per local day — never with
`toISOString()` viewer-UTC drift (the locked day-bound rule from AGENTS.md: use
local Y-M-D, never `toISOString().slice(0,10)`). All copy is Ukrainian-first with
an English fallback, calm in tone, with **no exclamation marks** anywhere
(NFR-I18N-01, BC-BRAND-01). The whole path must degrade honestly: an empty corpus
omits the joke line and a malformed entry never crashes the selector or the
footer (NFR-OBS-01).

## What Changes

- **Pure framework-free selector (`lib/jokes/jokes.ts`, TC-PURE-01):**
  `pickJoke(corpus, key)` selects one entry from an in-repo corpus by a
  caller-supplied integer `key`, with no `next/*`, no `react`, no DOM, and no
  network. It is **total**: the same integer `key` always yields the same joke
  (deterministic); `key` is normalised into corpus range via a **non-negative
  modulo** so it handles negative and out-of-range keys (the index used is always
  within `0..N-1`); an **empty corpus returns `undefined`** (no division by N, no
  indexing) rather than throwing; and a malformed entry (non-string / empty) is
  tolerated — the selector never throws on a bad entry.
- **Pure daily-rotation key (`dailyKey(date)`):** a pure helper that returns a
  days-since-epoch integer derived from the **local calendar date** (local
  `getFullYear()`/`getMonth()`/`getDate()`, NOT `toISOString()` / viewer-UTC), so
  the key increases by exactly 1 each local calendar day and the selected index
  `key mod N` advances by exactly one position per local day (wrapping `N-1 → 0`).
  The selector is agnostic to how the key was produced; `dailyKey` is the only key
  the app supplies.
- **Corpus in centralised i18n (`lib/i18n/uk.ts` + `en.ts`):** the joke strings
  live under a `jokes.*` namespace (sibling to `shell.*`, never reaching into it)
  as an **array of strings** — `jokes.items: readonly string[]` — accessed
  **directly from the exported `uk` / `en` dictionary objects** (not via `t()`,
  which resolves a single string). Ukrainian is the default; the English `items`
  array is the per-index fallback when a Ukrainian entry is missing or empty. Tone
  is calm and gently humorous, weather-themed, with no exclamation marks
  (BC-BRAND-01). Because the existing i18n test flattens nested values into dotted
  leaves (arrays included: `jokes.items.0`, `jokes.items.1`, …), every joke string
  is automatically covered by the project's existing exclamation-mark sweep across
  both locales.
- **Degradation (NFR-OBS-01):** an empty corpus → the footer **omits the joke
  line** (no crash, no blank error, no console noise); a malformed entry does not
  crash the selector (it is treated as "no joke" and the line is omitted). The rest
  of the footer (Open-Meteo / OpenStreetMap credits and the privacy line) renders
  normally.
- **UI — fill the AppFooter jokes slot:** replace the inert placeholder
  (`{t("shell.jokes.placeholder")}`) in `components/shell/AppFooter.tsx` with the
  selected joke `pickJoke(corpus, dailyKey(new Date()))`, keeping the slot's
  accessible label (`shell.jokes.label`) and footer structure from i18n. This is
  the shell's **own** slot file — **not** an `app/page.tsx` edit (§3a serialize
  point). When the corpus is empty (or the entry malformed), the joke `<p>` is not
  rendered at all.

## Capabilities

### New Capabilities

- `bottom-jokes`: a deterministic, in-repo, Ukrainian-first weather-joke line in
  the footer — the pure `pickJoke(corpus, key)` selector (same-key-same-joke
  determinism, non-negative-modulo range normalisation incl. negative/out-of-range
  keys, empty-corpus → `undefined`, malformed-entry tolerance), the pure
  `dailyKey(date)` local-calendar-date days-since-epoch rotation (advances exactly
  one per local day, never `toISOString`-derived), the `jokes.*` i18n corpus
  (Ukrainian default + English per-index fallback, no exclamation marks), and the
  honest-degradation footer rendering that omits the joke line on an empty or
  malformed corpus.

### Modified Capabilities

<!-- None. This change introduces the bottom-jokes capability; no existing spec
changes. The app-shell spec is untouched: this slice only fills the AppFooter
jokes slot (a slot the shell shipped for exactly this purpose) and adds a sibling
jokes.* i18n namespace — it does not edit shell.* copy semantics or app/page.tsx
(§3a). The inert shell.jokes.placeholder copy is superseded but left in place. -->

## Impact

- **Specs:** the baseline `openspec/specs/bottom-jokes/spec.md` already exists
  (adopted at G2). The delta under `specs/bottom-jokes/spec.md` restates that
  contract as `## ADDED Requirements` for the record and for
  `openspec validate add-bottom-jokes --strict`; archive runs with `--skip-specs`
  because the baseline already holds it (OpenSpec Option B is not re-applied).
- **Code (new):** `lib/jokes/jokes.ts` (`pickJoke` + `dailyKey`, framework-free)
  with a colocated `lib/jokes/jokes.test.ts`; a `"use client"` footer joke
  component `components/jokes/FooterJoke.tsx` that computes
  `pickJoke(corpus, dailyKey(new Date()))` on the CLIENT after mount (so the
  rotation follows the visitor's local day, not the static-build host), with a
  colocated jsdom test `components/jokes/FooterJoke.test.tsx` (populated render,
  the client-side mount gate, the per-index English fallback, empty-corpus
  omission); the FOOTER-structure assertions (credits/privacy render, joke line
  omitted on an empty corpus) live in `components/shell/AppFooter.test.tsx`; one
  browser-free eval case `evals/cases/jokes-quality.eval.ts` grading the Ukrainian
  joke quality.
- **Code (extended):** `components/shell/AppFooter.tsx` — the inert jokes slot is
  replaced with the real footer joke (filling the slot the shell reserved; the
  shell's own slot, not an `app/page.tsx` edit). `lib/i18n/uk.ts` + `lib/i18n/en.ts`
  gain a `jokes.*` namespace with the `jokes.items` corpus array (sibling to
  `shell.*`; the inert `shell.jokes.placeholder` is superseded but left in place).
- **Dependencies:** none added — react is already installed. **No database, no
  auth, no email, no network** (ADR-0003); the corpus is in-repo and the selector
  fetches nothing. **No Playwright** (TC-STACK-05); verification is Vitest (pure
  unit tests for the selector + jsdom component test for the footer), and the
  per-slice "smoke" is a **service/render smoke** (drive `pickJoke` for determinism
  + render the footer + assert the empty-corpus omission), not a DB smoke.
- **Out of scope (see the spec's Exclusions):** randomness or a "next joke" button;
  any external joke API or network fetch; per-visitor personalisation or
  persistence (no cookie/storage); coupling the joke to the current weather
  condition/temperature; mechanical "weather-themed" verification (theming is a
  content-authoring quality, not a unit assertion); localisation beyond Ukrainian +
  English; user-submitted jokes or a runtime moderation flow — all intentionally
  excluded so testers do not report them as defects.
