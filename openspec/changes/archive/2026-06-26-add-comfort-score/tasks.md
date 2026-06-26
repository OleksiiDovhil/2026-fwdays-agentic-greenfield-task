## 1. Setup (i18n namespace + daily-input type)

> No database, no migrations, no auth, no email, no network (ADR-0003). No new
> deps — cva, clsx, tailwind-merge, react are installed. This slice fetches
> nothing. Reuse the LOCKED app-shell conventions: `lib/i18n` namespaces,
> `components/ui/Badge.tsx`, the palette tokens, `cn()`.

- [x] 1.1 Add a `comfort` namespace to `lib/i18n/uk.ts` (sibling to `shell.*` —
  never edit `shell.*`): `comfort.band.{green,yellow,red}` (short badge labels,
  e.g. "Комфортно" / "Помірно" / "Некомфортно"), `comfort.a11y.{green,yellow,red}`
  (fuller accessible descriptions, e.g. "Комфортні умови"),
  `comfort.weekend.label` (e.g. "Найближчі вихідні"), `comfort.weekend.outOfRange`
  (calm "weekend not in range", e.g. "Вихідні поза прогнозом"), and an optional
  `comfort.value` accessible pattern. Calm tone, no exclamation marks
  (BC-BRAND-01). Mirror the same keys in `lib/i18n/en.ts` (D6, NFR-I18N-01).
- [x] 1.2 Add `lib/scoring/types.ts` exporting `ComfortInput` — the minimal
  per-day shape `comfortScore`/`upcomingWeekend` consume (D5): optional+nullable
  `time` (`YYYY-MM-DD`), `apparentHigh`, `apparentLow`, `precipProbability`,
  `windSpeed`, `cloudCover`, `uvIndex`. Field names mirror the forecast daily
  contract so `add-forecast` can pass them straight through. Framework-free
  (TC-PURE-01).
- [x] 1.3 Add the three comfort-band color token pairs (green/yellow/red fg+bg,
  for the badge) to `lib/a11y/palette.ts` AND the matching CSS variables to
  `app/globals.css` in lockstep (D6); they will be AA-checked in 5.x via
  `checkPalette()` for both light and dark (NFR-A11Y-02, ADR-0004).

## 2. Pure domain logic (framework-free, TC-PURE-01)

> Every file here imports no `next/*`, no `react`, no DOM globals, no `Date.now()`
> / `Math.random()`. Each has a colocated `*.test.ts` carrying `@trace` ids.
> Write the section 5 unit tests FIRST and confirm they FAIL (red) before
> implementing here (test-first per AGENTS.md).

- [x] 2.1 `lib/scoring/comfort.ts` — `numericOr(raw, fallback)` coercion helper:
  returns `raw` when it is a finite number, else the neutral mid-band `fallback`
  (D3). Each factor's neutral fallback is mid-band, never best/worst: feels-like
  `21`, precip prob `35`, wind `3`, cloud `50`, UV `4`. Track a `dataMissing`
  signal when every factor fell back (drives the neutral rationale set).
- [x] 2.2 `comfortScore(daily)` scoring model (D2, FR-COMFORT-01/02): start at
  `100` and subtract documented per-factor penalties — temperature (comfort peak
  ~20-22°C with a ~1° dead-band, cold weighted slightly harder than heat, scored
  on the apparent high), precipitation probability (linear over `0..100`), wind
  (free up to ~3 m/s then linear), cloud cover (mild, linear over `0..100`), UV
  (free up to ~5 then linear). `value = clamp(Math.round(raw), 0, 100)`. Pure,
  total, deterministic, no mutation; defined for `null`/`undefined`/`NaN`/`{}`/
  partial; NEVER throws.
- [x] 2.3 `bandOf(value)` (D6, FR-COMFORT-04): `>= 70 -> "green"`,
  `40..69 -> "yellow"`, `< 40 -> "red"` at the EXACT boundaries (`70` green, `69`
  yellow, `40` yellow, `39` red). Pure; used by the badge and the weekend summary.
- [x] 2.4 Band-matched Ukrainian `rationale` (D4, FR-COMFORT-03): four disjoint
  phrasing sets — green (positive), yellow (measured), red (cautioning), and a
  distinct neutral "not enough data" set chosen when `dataMissing` is true.
  Selection within a set is a pure function of `value` (e.g. `value % len`), never
  random (determinism). Every candidate sentence is `<= 80` chars, Cyrillic, one
  sentence, no emoji, no `!`. The sets share no sentence and no signature lexeme,
  so the band is decidable from the value alone. `comfortScore` returns
  `{ value, rationale }`.
- [x] 2.5 `lib/scoring/comfort.ts` `upcomingWeekend(days)` (D7, FR-COMFORT-05):
  pure selector over `{ time, value }[]`. Derive each day's weekday from its own
  `time` (`YYYY-MM-DD`) by splitting on `-` and reading `getUTCDay()` from a fixed
  `Date.UTC(y, m-1, d)` — NEVER `toISOString()` on `new Date()` and NEVER the
  viewer's local clock (AGENTS.md "never `toISOString().slice(0,10)`"). Pick the
  first Saturday (`6`) and Sunday (`0`) in the window; return the integer average
  (`Math.round`) with an `available: "both" | "one" | "none"` marker. Degrade to
  the single day, then to `value: null`, with no `NaN` and no throw.

## 3. UI (reuse app-shell primitives)

- [x] 3.1 `components/comfort/ComfortBadge.tsx` (D6, FR-COMFORT-04,
  NFR-A11Y-01/02): reuse `components/ui/Badge.tsx`; map `bandOf(value)` to a
  token-driven green/yellow/red class via `cn()` (the base `badgeVariants` has no
  semantic color variants). Render the numeric `value` PLUS an accessible
  Ukrainian band label (from `comfort.band.*` / `comfort.a11y.*`) so color is not
  the only signal. Calm, no `!`.
- [x] 3.2 `components/comfort/WeekendHighlight.tsx` (D7, FR-COMFORT-05): consume
  the `upcomingWeekend` result; when a value exists render `comfort.weekend.label`
  + a `ComfortBadge` for the averaged value (same thresholds); when
  `available === "none"` render the calm `comfort.weekend.outOfRange` Ukrainian
  state (never an error toast / raw 500). Labels from `lib/i18n` (NFR-I18N-01).
  This slice ships the component + logic only; positioning it at the TOP of the
  forecast grid is wired in `add-forecast`.

## 4. Layout / page composition

> Intentionally empty. This slice owns NO layout or `app/page.tsx` change: the
> `ComfortBadge` and `WeekendHighlight` components are consumed by the forecast
> slice later (it wires `WeekendHighlight` into the top of the grid and a
> `ComfortBadge` into each day card). Per §3a, this slice does not edit the shared
> `app/page.tsx` serialize point.

## 5. Tests (Vitest only — unit + jsdom component + evals; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–3 to
> green. Every test file carries `@trace` ids. Never weaken a test to pass it.

- [x] 5.1 Unit `lib/scoring/comfort.test.ts` — monotonicity (FR-COMFORT-02): from
  a pleasant baseline well inside `(0,100)` (feels ~22, precip ~5, wind ~2, cloud
  ~30, UV ~3), worsen EXACTLY ONE factor at a time by a margin that clears its
  dead-band (colder feels, hotter feels, higher precip, stronger wind, more cloud,
  harsher UV) and assert each yields a STRICTLY lower `value` than baseline.
  `@trace FR-COMFORT-02`.
- [x] 5.2 Unit clamping + integer + determinism (FR-COMFORT-01): an idealized day
  and an extreme cold-storm day both return an integer `value` clamped to `0..100`
  (no fractional part, never `< 0` / `> 100`); two structurally-equal inputs
  return equal `value` AND equal `rationale`; the input object is not mutated.
  `@trace FR-COMFORT-01`.
- [x] 5.3 Unit totality (FR-COMFORT-01): `comfortScore` on `null`, `undefined`,
  `{}`, `NaN`-laden, and partial inputs returns a valid `{ value, rationale }`
  with `value` in `0..100` and does NOT throw; a missing factor is neutral (the
  all-missing value is neither `0` nor `100`). `@trace FR-COMFORT-01, FR-COMFORT-02`.
- [x] 5.4 Unit band thresholds at EXACT boundaries (FR-COMFORT-04): `bandOf(70)`
  green, `bandOf(85)` green, `bandOf(69)` yellow, `bandOf(55)` yellow, `bandOf(40)`
  yellow, `bandOf(39)` red, `bandOf(0)` red. `@trace FR-COMFORT-04`.
- [x] 5.5 Unit rationale invariants (FR-COMFORT-03, BC-BRAND-01): across a sweep of
  inputs spanning all bands, every `rationale` is non-empty, `<= 80` chars,
  Cyrillic, contains no `!` and no emoji (`/\p{Extended_Pictographic}/u`); the
  green/yellow/red/neutral phrasing sets are pairwise disjoint; the sentence's set
  MATCHES the value's band (and the all-missing input uses the neutral set).
  `@trace FR-COMFORT-03`.
  > RESOLVED: the test's `SIGNATURE` table had a fixture bug (Ukrainian «не-» prefix
  > made red stems «неприємно»/«некомфортн» superstrings of green «приємн»/«комфортн»,
  > so the pairwise-disjointness assertion was unsatisfiable). The orchestrator
  > corrected the fixture (dropped the unused negation forms from the red signature);
  > the implementation was not weakened and `rationale.test.ts` passes in full.
- [x] 5.6 Unit `upcomingWeekend` local-date selection + degraded cases
  (FR-COMFORT-05): a fixture whose `daily.time` strings would yield a DIFFERENT
  weekday under the viewer's timezone vs the date string proves selection comes
  from the `YYYY-MM-DD` string (not `toISOString()`/local clock); the Sat+Sun
  average is the integer mean; one-weekend-day degrades to that day's value;
  no-weekend-day returns `value: null` with `available: "none"`, no `NaN`, no
  throw. `@trace FR-COMFORT-05`.
- [x] 5.7 Unit `lib/a11y/contrast` band tokens (NFR-A11Y-02): `checkPalette()`
  passes for the new green/yellow/red badge token pairs in BOTH light and dark.
  `@trace NFR-A11Y-02`.
- [x] 5.8 jsdom component `components/comfort/ComfortBadge.test.tsx`
  (FR-COMFORT-04, NFR-A11Y-01): renders the numeric `value`, the accessible
  Ukrainian label, and the correct green/yellow/red variant class for values at
  `70` / `69` / `40` / `39`; asserts meaning survives without color (value + label
  present, label from `lib/i18n`, no `!`). `@trace FR-COMFORT-04, NFR-A11Y-01`.
- [x] 5.9 jsdom component `components/comfort/WeekendHighlight.test.tsx`
  (FR-COMFORT-05, NFR-OBS-01): with a both-days result it shows the
  `comfort.weekend.label` + a badge for the average; with `available: "none"` it
  shows the calm `comfort.weekend.outOfRange` state — never blank, never a thrown
  500. `@trace FR-COMFORT-05, NFR-OBS-01`.
- [x] 5.10 Eval `evals/cases/comfort-rationale.eval.ts` (FR-COMFORT-03,
  BC-BRAND-01): 1-2 browser-free cases whose `produce()` drives the pure
  `comfortScore` on representative green / yellow / red / missing-data inputs and
  returns the `{ value, rationale }` strings; `rubric` grades natural calm
  Ukrainian, band-appropriate sentiment, `<= 80` chars, no `!`, no emoji (mark
  gating lines `CRITICAL:`), `dimension` grouped (e.g. `comfort-rationale`),
  `@trace` mirroring the footer. Target every dimension >= 90.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red), then
  implement sections 1–3 to green (test-first per AGENTS.md). Never weaken a test
  to pass it; if a test contradicts the spec, change it deliberately.
- [x] 6.2 Run `npm run lint` — zero errors/warnings.
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green.
- [x] 6.4 Run `npm run build` — production build succeeds; console clean.
- [x] 6.5 Run `npx openspec validate add-comfort-score --strict` — zero
  errors/warnings.
- [x] 6.6 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [x] 6.7 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-comfort-score` implemented/validated, and record the comfort conventions
  reused downstream (the `comfort.*` i18n namespace, `ComfortInput`, the
  `comfortScore` / `bandOf` / `upcomingWeekend` exports from `lib/scoring/comfort.ts`,
  the `ComfortBadge` / `WeekendHighlight` components, and the band thresholds) plus
  the exact next step (remaining Wave 1: `add-top-clock` / `add-bottom-jokes`, then
  Wave 2 `add-city-search`).
- [x] 6.8 SERVICE/RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003), step
  by step: (a) call `comfortScore` on a pleasant day (feels 22, precip 5, wind 2,
  cloud 30, UV 3) and assert `value >= 70` (green band) with a positive-set
  rationale `<= 80` chars, no `!`, no emoji; (b) call `comfortScore` on a storm day
  (feels 2, precip 90, wind 12, cloud 95, UV 0) and assert `value < 40` (red band)
  with a cautioning-set rationale; (c) call `comfortScore({})` and assert a
  mid-band integer `value` in `0..100` with the neutral "not enough data" rationale
  (no throw); (d) call `upcomingWeekend` on a 7-day fixture whose `time` strings
  include a Saturday and Sunday and assert the returned value equals the integer
  average of those two days' `comfortScore.value` and `available === "both"`.
  Capture the pass output as the smoke evidence.
- [x] 6.9 GATED on 6.8 passing: `npx openspec archive add-comfort-score --yes
  --skip-specs` (the baseline `openspec/specs/comfort-score/spec.md` already holds
  the contract, so the delta is NOT re-applied via Option B). Do not archive before
  the smoke passes.
