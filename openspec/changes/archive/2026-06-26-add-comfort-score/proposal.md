## Why

`add-comfort-score` is the first Wave 1 slice on top of the now-archived
`add-app-shell` foundation. It turns one day's weather into a calm, glanceable
verdict — a `0..100` comfort number plus one short Ukrainian sentence — so the
forecast and weekend-compare slices can show "is this a good day to travel"
without re-deriving the math. It owns the scoring rules and their presentation
contract (FR-COMFORT-01..05); it deliberately does **not** fetch weather data or
own the forecast layout — `add-forecast` owns the single Open-Meteo request
(FR-FORECAST-01) and consumes the pure function and components this slice ships.

Because the rationale sentence is eval-graded (the project's delivery bar is
every eval dimension >= 90), the Ukrainian copy quality is a first-class concern
of this slice, not an afterthought.

## What Changes

- **Pure total scoring (framework-free, TC-PURE-01):** `lib/scoring/comfort.ts`
  exports `comfortScore(daily) -> { value: number; rationale: string }` — a pure,
  total, deterministic function defined for **every** input (including `null`,
  `undefined`, `NaN`, `{}`, and missing fields) that NEVER throws, never mutates,
  and reads no clock/network/DOM. `value` is an integer clamped to `0..100`
  (FR-COMFORT-01). It consumes the five factors in the exact units `add-forecast`
  pins (FR-COMFORT-02): feels-like °C, wind m/s, precipitation probability integer
  `0..100`, cloud cover integer `0..100`, dimensionless UV. A missing factor
  contributes a neutral mid-band influence (never best/worst).
- **Band-matched Ukrainian rationale (FR-COMFORT-03):** a single Ukrainian
  sentence, `<= 80` chars, no emoji, no exclamation mark, generated inside
  `comfort.ts` from band-specific, mutually-exclusive phrasing sets — green
  (`value >= 70`, positive), yellow (`40..69`, measured), red (`< 40`,
  cautioning), plus a distinct neutral "not enough data" set for missing-data
  inputs — so a tester can decide from the value's band which set the sentence
  belongs to.
- **Bands + accessible badge (FR-COMFORT-04, NFR-A11Y-01/02):** `bandOf(value)`
  applies thresholds at the exact boundaries (`70` green, `69` yellow, `40`
  yellow, `39` red); a `ComfortBadge` component (reusing the app-shell
  `components/ui/Badge.tsx` cva primitive) renders the numeric value **plus** an
  accessible Ukrainian label so color is not the only signal.
- **Weekend highlight (FR-COMFORT-05):** `upcomingWeekend(days)` — a pure helper
  that averages the upcoming Saturday and Sunday comfort values, selecting those
  days by each day's location-local `daily.time` (`YYYY-MM-DD`) weekday, NEVER
  `toISOString()` and never the viewer's clock; it degrades calmly (no `NaN`, no
  throw) when only one or neither weekend day is in the 7-day window. A
  `WeekendHighlight` component renders the summary; wiring it into the forecast
  grid happens in `add-forecast`.
- **i18n:** a new `comfort.*` namespace in `lib/i18n/uk.ts` + `en.ts` (badge
  band labels, weekend-summary label, weekend-not-in-range label, band a11y
  labels). No exclamation marks; `shell.*` is untouched.
- **Daily-input type:** a minimal per-day TS shape in `lib/scoring/` describing
  exactly the fields this slice consumes, so `add-forecast` can produce it.

## Capabilities

### New Capabilities

- `comfort-score`: the pure comfort-scoring math (`0..100` + `<= 80`-char
  Ukrainian rationale), the green/yellow/red band thresholds and accessible
  badge, and the local-date upcoming-weekend selector/summary.

### Modified Capabilities

<!-- None. This change introduces the comfort-score capability; no existing spec changes. The app-shell spec is untouched (this slice only extends lib/i18n with a new comfort.* namespace and reuses the Badge primitive). -->

## Impact

- **Specs:** the baseline `openspec/specs/comfort-score/spec.md` already exists
  (adopted at G2). The delta under `specs/comfort-score/spec.md` restates that
  contract as `## ADDED Requirements` for the record and for
  `openspec validate add-comfort-score --strict`; archive runs with
  `--skip-specs` because the baseline already holds it (Option B is not re-applied).
- **Code (new):** `lib/scoring/comfort.ts`, `lib/scoring/types.ts`,
  `components/comfort/ComfortBadge.tsx`,
  `components/comfort/WeekendHighlight.tsx`, plus colocated `*.test.ts(x)` and an
  eval case `evals/cases/comfort-rationale.eval.ts`.
- **Code (extended):** `lib/i18n/uk.ts` + `lib/i18n/en.ts` gain a `comfort.*`
  namespace (sibling to `shell.*`; no `shell.*` edits).
- **Dependencies:** none added — cva, clsx, tailwind-merge, react are already
  installed. No database, no auth, no email, no network (ADR-0003); this slice
  fetches nothing.
- **Out of scope:** the Open-Meteo fetch and the forecast grid composition
  (`add-forecast`), per-hour comfort, multi-weekend/arbitrary-date comfort,
  persistence, user-tunable weights — all intentionally excluded (see the spec's
  Exclusions).
