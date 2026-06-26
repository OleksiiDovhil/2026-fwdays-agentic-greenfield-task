## Context

This is the first Wave 1 slice, built on the now-archived `add-app-shell`
foundation (capability plan §4.2). It reuses app-shell's **LOCKED** conventions:
the `lib/i18n` typed dictionary with per-domain namespaces (add `comfort.*`,
never touch `shell.*`), the `components/ui/Badge.tsx` cva primitive, the palette
tokens (AA-verified by `lib/a11y/contrast.ts`), and `cn()` from `lib/utils.ts`.

Stack reality (ADR-0003/0004): **no database, no auth, no email, no network** —
this slice fetches nothing; it consumes a per-day shape that `add-forecast` will
later produce from the single Open-Meteo request (FR-FORECAST-01). Tests are
**Vitest** only (unit + jsdom component) with **no Playwright**. `lib/` is
**framework-free** (TC-PURE-01): no `next/*`, no `react`, no DOM, no `Date.now()`
inside scoring. The per-slice "smoke" is a **service/render smoke** over fixture
inputs, not a DB smoke.

The capability boundary is deliberate: comfort-score owns the **math and the
presentation contract** (the pure function, the bands, the badge, the weekend
selector + summary component); `add-forecast` owns the **fetch and the grid**,
and wires `WeekendHighlight` in at the top of the grid. Keeping these separate
lets the scoring be 100% unit-testable and the rationale eval-graded without a
browser.

## Goals / Non-Goals

**Goals:**

- A pure, total, deterministic `comfortScore(daily)` that is defined for every
  input and never throws (FR-COMFORT-01), consuming the five factors in the
  exact units `forecast` pins (FR-COMFORT-02).
- A concrete, documented, explainable scoring model where worsening **any single
  factor** strictly lowers the value (the spec's monotonicity scenario), with
  the value an integer clamped to `0..100`.
- A band-matched, ship-quality Ukrainian rationale: one sentence, `<= 80` chars,
  no emoji, no `!`, drawn from mutually-exclusive per-band phrasing sets so the
  band is decidable from the value alone (FR-COMFORT-03). This is **eval-graded**
  (target every dimension >= 90).
- Green/yellow/red bands at the exact boundaries and an accessible `ComfortBadge`
  where color is not the only signal (FR-COMFORT-04, NFR-A11Y-01/02).
- An `upcomingWeekend(days)` selector + `WeekendHighlight` component that pick the
  weekend by each day's **location-local `daily.time`**, never `toISOString()` or
  the viewer's clock, and degrade calmly to one / zero weekend days
  (FR-COMFORT-05).
- A `comfort.*` i18n namespace and a minimal daily-input TS type so `forecast`
  can produce the shape this slice consumes.

**Non-Goals:**

- Fetching weather data or composing the forecast grid (`add-forecast`).
- Per-hour comfort, multi-weekend / arbitrary-date comfort, persistence,
  alternative models, or user-tunable weights (see the spec's Exclusions).
- Emoji anywhere in comfort output (intentionally excluded, FR-COMFORT-03).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004.

## Decisions

### D1 — `comfortScore(daily)` is a pure, total function in `lib/scoring/comfort.ts` (FR-COMFORT-01, TC-PURE-01)

- Signature: `comfortScore(daily: ComfortInput | null | undefined): { value: number; rationale: string }`.
- **Framework-free:** no `next/*`, no `react`, no DOM globals, no `Date.now()`,
  no `Math.random()` — deterministic for identical inputs and side-effect-free.
  It does not mutate the input object (reads fields into locals only).
- **Total:** defined for `null`, `undefined`, `NaN`, `{}`, partial objects, and
  missing fields; it NEVER throws. Every field is read through a single
  `numericOr(value, fallback)` coercion helper that maps non-finite / missing /
  non-number values to a neutral fallback (D3).
- **Output:** `value` is the raw model score (D2) rounded with `Math.round` then
  clamped to the inclusive integer range `0..100`; `rationale` is generated in
  Ukrainian by `comfort.ts` itself (D4) and is non-empty for every input.
- **Trade-off:** generating the rationale inside the pure function (rather than in
  the UI from i18n) is deliberate — it is a *computed* sentence keyed off the
  factors, not a static label, and the spec explicitly allows this one comfort
  string to originate outside `i18n`. Static labels (badge text, weekend label)
  still come from `lib/i18n` (D6).

### D2 — Scoring model: a comfort peak that decays per factor, fully documented (FR-COMFORT-02)

The model is a **start-at-100, subtract per factor** penalty model. It is simple,
explainable, and monotone: worsening exactly one factor (in its pinned units)
while holding the others can only *increase* a penalty, so the value strictly
decreases — satisfying the spec's "worsen one factor lowers the value" scenario
for each of the five factors. All factors are read in the pinned units
(`temperature_unit=celsius`, `windspeed_unit=ms`, percent `0..100` for
precipitation and cloud, dimensionless UV), so the comparison is reproducible.

Concrete penalties (documented as constants in `comfort.ts`):

- **Feels-like temperature — comfort peak ~20-22 (°C).** Define a comfort centre
  `T_IDEAL = 21`. Penalty grows with absolute deviation from the band, and cold is
  penalised slightly harder than heat for trip comfort:
  `dev = max(0, |feels - 21| - 1)` (a flat ~1° dead-band around the ideal), then
  `tempPenalty = dev * (feels < 21 ? 1.6 : 1.4)`. This makes ~20-22°C the high
  point and pushes both a cold day and a hot day strictly lower than baseline.
  When both a daytime high and a night low are supplied, the function scores the
  **representative feels-like** = the daily apparent high (the trip-relevant
  daytime value) and uses the low only to widen the dead-band penalty if the night
  is harsh; the input type carries both (D5).
- **Precipitation probability — linear, `0..100` percent.**
  `precipPenalty = prob * 0.45` (so 100% wet subtracts ~45). Higher probability →
  strictly lower value.
- **Wind — m/s, gentle below a comfort threshold then linear.**
  `windPenalty = max(0, wind - 3) * 3.5` (a light breeze up to ~3 m/s is free;
  beyond that each m/s subtracts). Stronger wind → strictly lower value.
- **Cloud cover — `0..100` percent, mild.** `cloudPenalty = cloud * 0.12` (full
  overcast subtracts ~12). More cloud → strictly lower value. Cloud is weighted
  lighter than precipitation/temperature because overcast alone is only mildly
  uncomfortable.
- **UV — dimensionless, harsh only above a safe band.**
  `uvPenalty = max(0, uv - 5) * 4` (UV up to ~5 is comfortable; "very high"/
  "extreme" UV subtracts). Harsher UV → strictly lower value.

`raw = 100 - (tempPenalty + precipPenalty + windPenalty + cloudPenalty + uvPenalty)`;
`value = clamp(Math.round(raw), 0, 100)`.

- **Strict-monotonicity guarantee:** every penalty term is a non-decreasing
  function of "how bad" its factor is and depends on no other factor, so
  worsening one factor (enough to move past any dead-band) strictly raises that
  term and strictly lowers `raw` (hence `value`, away from the clamp edges). Tests
  pick a pleasant baseline well inside `(0,100)` and worsen each factor by a margin
  that clears its dead-band, asserting a strict decrease per factor.
- **Calibration intent:** the pleasant baseline in the spec (feels ~22, precip
  ~5%, wind ~2, cloud ~30, UV ~3) lands comfortably in the green band (`>= 70`);
  a cold storm (e.g. feels 2, precip 90, wind 12, cloud 95, UV 0) clamps to the
  red band (`< 40`). A unit test pins these calibration anchors so the model can
  be tuned but not silently drift across a band.
- **ADR-worthy?** No — this is a fixed, documented MVP heuristic, not a
  cross-cutting architecture decision; the spec's Exclusions already pin "no
  alternative models or user-tunable weights in MVP". The constants live in one
  place in `comfort.ts` so they are tunable without API change. If product later
  wants a different model, that is a new slice + possible ADR, not a silent edit.

### D3 — Missing / unparseable factors are neutral, never best or worst (FR-COMFORT-02)

- A single `numericOr(raw, fallback)` helper returns `raw` only when it is a
  finite number, else `fallback`. Each factor has a **mid-band neutral fallback**,
  not a best- or worst-case value:
  - feels-like → `21` (the ideal centre: a missing temperature contributes **no**
    temperature penalty, i.e. neutral, never the coldest/hottest);
  - precipitation probability → `35` (a middling chance, not `0` and not `100`);
  - wind → `3` (the comfort threshold edge: no wind penalty but not "dead calm as
    a bonus");
  - cloud cover → `50` (half cover);
  - UV → `4` (just inside the safe band).
- **Consequence:** an all-missing input (`{}` / `null`) is scored entirely from
  neutrals → a mid-band `value` that is neither `0` nor `100`, and the rationale
  uses the distinct **neutral "not enough data"** set (D4), so a missing-data day
  is never mislabelled as great or terrible. A *partial* input penalises only the
  factors it actually provides.
- **Trade-off:** choosing mid-band neutrals (rather than dropping missing factors
  and renormalising weights) keeps the model trivially total and keeps each
  factor's contribution independent — which is exactly what the monotonicity
  scenario needs. The cost is that a partial day's absolute value is approximate;
  acceptable because comfort is a glanceable heuristic, not a measurement.

### D4 — Band-matched Ukrainian rationale, mutually-exclusive phrasing sets (FR-COMFORT-03, BC-BRAND-01)

The rationale is **eval-graded** (target >= 90), so the copy must read as calm,
natural, ship-quality Ukrainian. `comfort.ts` selects a sentence from one of
**four** disjoint phrasing sets, chosen by the value's band — and, for the
all-missing case, by a `dataMissing` flag the scorer sets when every factor fell
back to its neutral. A tester can decide pass/fail by checking the band the value
is in and confirming the sentence belongs to that band's set (the sets share no
sentence and no signature lexeme):

- **Green (`value >= 70`) — positive / comfortable.** Signature words:
  *приємний / комфортно / гарна погода / варто*. Shipped examples (each `<= 80`
  chars, no `!`, no emoji):
  - `Приємний день для поїздки, погода комфортна.`
  - `Гарна погода надворі, чудово підходить для прогулянки.`
  - `Комфортно й затишно, цілком вдалий день для подорожі.`
- **Yellow (`40..69`) — measured / so-so.** Signature words:
  *прийнятно / помірно / загалом непогано / можна, але*. Shipped examples:
  - `Погода прийнятна, але без особливого комфорту.`
  - `Помірні умови, на поїздку згодиться, переваг небагато.`
  - `Загалом непогано, проте є дрібні незручності.`
- **Red (`value < 40`) — cautioning / poor.** Signature words:
  *погані умови / несприятлива / непривітна / краще перенести / невдалий*. The
  negation forms *некомфортно* / *неприємно* are deliberately EXCLUDED: Ukrainian's
  «не-» prefix makes them superstrings of the green stems *комфортн* / *приємн*, so
  a substring-based band check would mis-classify them as green; the red set uses
  distinct cautioning words instead. Shipped examples:
  - `Погані умови надворі, поїздку краще перенести.`
  - `Несприятлива погода, час для прогулянки невдалий.`
  - `Непривітна погода, краще перенести поїздку на потім.`
- **Neutral missing-data (`dataMissing` true, regardless of the mid-band value)
  — calm "not enough data".** Signature words: *бракує даних / недостатньо
  даних / складно оцінити*. Shipped examples:
  - `Поки бракує даних, щоб оцінити погоду для поїздки.`
  - `Недостатньо даних про погоду, щоб дати пораду.`
  - `Складно оцінити погоду, даних поки замало.`

Each set holds a few interchangeable sentences. **Determinism (FR-COMFORT-01):**
selection within a set is by a pure index derived from the value
(e.g. `value % set.length`), never `Math.random()` — identical inputs yield an
identical rationale. A build-time/unit invariant asserts every candidate is
`<= 80` chars, Cyrillic, contains no `!` and no emoji
(`/\p{Extended_Pictographic}/u`), and that the green/yellow/red/neutral sets are
pairwise disjoint by signature lexeme.

- **Trade-off:** hand-authored phrasing sets (vs a templated "<adjective> day"
  generator) read far more naturally in Ukrainian — which the eval rewards — at
  the cost of a small fixed corpus to maintain. The corpus is the right size for
  an MVP and is fully unit-pinned so it cannot drift below the length / no-`!` /
  band-disjointness invariants.

### D5 — Minimal daily-input type in `lib/scoring/types.ts` (FR-COMFORT-02)

`comfort.ts` consumes only the fields it needs; `lib/scoring/types.ts` defines
that shape so `add-forecast` can produce it from its zod-validated daily block.
The field names mirror the forecast contract's Open-Meteo daily fields so the
mapping in `forecast` is a straight pass-through:

```ts
export type ComfortInput = {
  // location-local calendar date, "YYYY-MM-DD" (from forecast's timezone=auto)
  time?: string | null;
  // apparent (feels-like) high/low in °C (apparent_temperature_max/min)
  apparentHigh?: number | null;
  apparentLow?: number | null;
  // precipitation probability, integer percent 0..100 (precipitation_probability_max)
  precipProbability?: number | null;
  // wind speed in m/s (wind_speed_*_max, windspeed_unit=ms)
  windSpeed?: number | null;
  // mean cloud cover, integer percent 0..100 (cloud_cover_mean)
  cloudCover?: number | null;
  // maximum UV index, dimensionless (uv_index_max)
  uvIndex?: number | null;
};
```

All fields are optional and nullable on purpose — the type itself encodes that
any factor may be absent in a real Open-Meteo payload, and `comfortScore` is
total over all of them. `upcomingWeekend` reads `time` plus the computed value.

- **Trade-off:** owning a small input type here (vs importing forecast's larger
  daily type) keeps `lib/scoring` independent of the forecast module and keeps the
  dependency arrow pointing the documented way (forecast → comfort, plan §3). The
  cost is a tiny mapping in forecast, which is trivial because the names align.

### D6 — Bands, accessible `ComfortBadge`, and `comfort.*` i18n (FR-COMFORT-04, NFR-A11Y-01/02, NFR-I18N-01)

- `bandOf(value): "green" | "yellow" | "red"` applies the thresholds at the
  **exact** boundaries: `value >= 70 -> green`; `40 <= value <= 69 -> yellow`;
  `value < 40 -> red` (so `70` green, `69` yellow, `40` yellow, `39` red). It is
  pure and lives in `comfort.ts` (used by both the badge and the weekend summary).
- `ComfortBadge` (in `components/comfort/`) **reuses** `components/ui/Badge.tsx`.
  The base `badgeVariants` has no semantic green/yellow/red variants, so the
  badge maps each band to a token-driven class via `cn()` keyed off the palette
  (a small `bandClass` lookup), keeping AA contrast in light + dark. It renders
  the **numeric value** and an **accessible Ukrainian label** (e.g. an
  `aria-label`/visually-paired text like "Комфортно" / "Помірно" /
  "Некомфортно") so **color is not the only signal** (NFR-A11Y-01). A jsdom test
  asserts the value text, the label, the variant class, and that meaning survives
  without color.
- New `comfort.*` i18n namespace in `uk.ts` + `en.ts` (sibling to `shell.*`,
  never editing `shell.*`):
  - `comfort.band.green` / `comfort.band.yellow` / `comfort.band.red` — short
    badge labels (e.g. "Комфортно" / "Помірно" / "Некомфортно");
  - `comfort.a11y.green` / `.yellow` / `.red` — fuller accessible descriptions
    (e.g. "Комфортні умови");
  - `comfort.weekend.label` — the upcoming-weekend summary label
    (e.g. "Найближчі вихідні");
  - `comfort.weekend.outOfRange` — the calm "weekend not in range" wording
    (e.g. "Вихідні поза прогнозом");
  - `comfort.value` (optional) — an accessible "оцінка X зі 100" pattern if the
    badge needs a fuller name.
  All values are calm, no `!`; the existing i18n no-`!` unit test (both locales)
  covers them automatically.
- **NFR-A11Y-02:** the three band colors are new color introductions, so their
  fg/bg token pairs are added to `lib/a11y/palette.ts` (and `app/globals.css` in
  lockstep) and asserted by `checkPalette()` for both light and dark — the same
  computational AA gate app-shell established (ADR-0004), no browser needed.

### D7 — `upcomingWeekend(days)` + `WeekendHighlight` use location-local dates (FR-COMFORT-05)

- `upcomingWeekend(days: { time?: string | null; value: number }[]): { value: number | null; saturday?: number; sunday?: number; available: "both" | "one" | "none" }`
  is pure. It derives each day's weekday from its own `time` (`YYYY-MM-DD`) by
  parsing the date **as a plain calendar date** (split on `-` and use
  `Date.UTC(y, m-1, d)` purely to read `getUTCDay()` — a fixed, clock-independent
  weekday read, NOT `toISOString()` on `new Date()` and NOT the viewer's local
  `Date`). It selects the first Saturday (`day === 6`) and the first Sunday
  (`day === 0`) present in the window and averages their `value`s.
- **Degraded cases:** if only one weekend day is present it returns that day's
  value with `available: "one"`; if neither is present it returns
  `{ value: null, available: "none" }` — no `NaN`, no throw. The average rounds
  with `Math.round` so the summary value stays an integer in `0..100`.
- `WeekendHighlight` (in `components/comfort/`) renders the summary: when a value
  exists it shows `comfort.weekend.label` + a `ComfortBadge` for the averaged
  value (same thresholds); when `available === "none"` it shows the calm
  `comfort.weekend.outOfRange` Ukrainian state (never an error toast / 500). The
  forecast slice positions it at the **top of the grid** (this slice ships the
  component + logic only; the grid is forecast's).
- **Why a fixed UTC read of a date-only string is correct:** the string is
  already the location's local calendar date (forecast pins `timezone=auto`), so
  its weekday is independent of any timezone — reading it via `Date.UTC` avoids
  the local-timezone shift that `new Date("2026-06-27")` + `getDay()` would
  introduce near midnight. A test feeds dates whose UTC vs local weekday would
  differ for an east-of-UTC viewer and asserts the weekday comes from the string.
- **Trade-off:** parsing the date string ourselves (vs trusting `new Date(str)`)
  is the whole point — it makes the selection viewer-clock-independent and
  testable without faking timezones, honoring the spec's explicit
  "NOT `toISOString()` / not the visitor's clock" requirement and AGENTS.md's
  "never `toISOString().slice(0,10)`" rule.

## Data model

This slice introduces **no persisted data** (keyless, stateless — ADR-0003).
The only data shapes are the in-memory `ComfortInput` (D5) consumed by
`comfortScore`, the `{ value, rationale }` result, the `bandOf` union, and the
`upcomingWeekend` result. All are produced on the fly and stored nowhere.

## Error handling strategy

- **Totality over throwing (NFR-OBS-01):** `comfortScore` and `upcomingWeekend`
  never throw and never emit console noise — bad / missing / `NaN` inputs degrade
  to neutral mid-band scores and the neutral rationale (D3/D4), and the weekend
  selector degrades to one/none with a calm Ukrainian state (D7). There is no
  network call here to fail (the fetch is forecast's), so there is no error
  Notice to render in this slice; the calm degraded states are the badge label
  and the `comfort.weekend.outOfRange` copy.
- **No raw 500 / silent blank:** every component path renders something legible —
  a badge with a value+label, or the out-of-range summary — never an empty node
  or an exception bubbling to `app/error.tsx`.

## Risks / Trade-offs

- **Rationale quality is eval-graded (highest):** the bar is every dimension
  >= 90. Mitigation — hand-authored, native-quality per-band sets (D4), pinned by
  unit invariants (length / no-`!` / no-emoji / band-disjointness) and graded by
  1-2 eval cases across bands before archive.
- **Monotonicity at the clamp edges:** if a baseline is chosen too close to `0`
  or `100`, worsening a factor could hit the clamp and *not* strictly decrease.
  Mitigation — tests use a baseline well inside `(0,100)` and worsen by a margin
  that clears each factor's dead-band (D2).
- **Local-date correctness (D7):** the classic bug is `new Date("YYYY-MM-DD")`
  shifting the weekday by the viewer's timezone. Mitigation — parse the date
  string ourselves and read the weekday via a fixed UTC construction; a test
  proves an east-of-UTC viewer still gets the right weekend.
- **Palette/token drift (D6):** the three band colors must stay in lockstep
  between `lib/a11y/palette.ts` and `app/globals.css`. Mitigation — add both in
  the same task and let `checkPalette()` gate AA for light + dark (the app-shell
  pattern).
- **Scope creep into forecast:** the temptation to fetch data or render the grid
  here is resisted — this slice ships pure logic + components only; `add-forecast`
  owns the fetch and the grid wiring (plan §5, each FR owned once).
