## ADDED Requirements

<!--
This delta restates the baseline `openspec/specs/comfort-score/spec.md` contract
(adopted at G2) verbatim as ADDED requirements, for the record and so
`openspec validate add-comfort-score --strict` can validate the change against a
delta. Archive runs with `--skip-specs` because the baseline spec already holds
this content (the requirements are not re-applied via Option B). Keep this file
in sync with the baseline if the baseline changes.
-->

### Requirement: Pure total comfort-score function

The system SHALL expose `comfortScore(daily)` in `lib/scoring/comfort.ts` as a
**pure, total** function that returns `{ value: number; rationale: string }`,
where `value` is an integer in the inclusive range `0..100` (FR-COMFORT-01). The
function SHALL be framework-free (no `next/*`, no `react`, no DOM globals, per
TC-PURE-01), deterministic for identical inputs, and free of side effects. It
SHALL be defined for **every** input — including partial objects, `null`,
`undefined`, `NaN`, and missing hours — and SHALL NEVER throw.

#### Scenario: Typical pleasant day scores high

- **GIVEN** a day with feels-like ~22°C, 5% precipitation probability, light
  wind, partial cloud, and a moderate UV index
- **WHEN** `comfortScore(daily)` is called
- **THEN** it returns `{ value, rationale }` with an integer `value` in `0..100`
- **AND** `value` is high (in the green range, `>= 70`)

#### Scenario: Output value is always a clamped integer in range

- **GIVEN** any input whose underlying factors would push the raw score below 0
  or above 100 (for example an extreme cold-and-storm day, or an idealized day)
- **WHEN** `comfortScore(daily)` is called
- **THEN** the returned `value` is an integer (no fractional part)
- **AND** `value` is clamped to the inclusive range `0..100`

#### Scenario: Identical inputs yield identical output (deterministic)

- **GIVEN** two calls with structurally equal `daily` inputs
- **WHEN** `comfortScore(daily)` is called for each
- **THEN** both calls return an equal `value` and an equal `rationale`
- **AND** no global state, clock, or randomness influences the result

#### Scenario: Function performs no side effects

- **GIVEN** a `daily` input object
- **WHEN** `comfortScore(daily)` is called
- **THEN** the input object is not mutated
- **AND** the function reads no DOM, network, environment, or `Date.now()`

### Requirement: Defined inputs, units, and tolerance for missing data

The system SHALL compute the comfort score from these five inputs: feels-like
(apparent) temperature, precipitation probability, wind, cloud cover, and UV
index (FR-COMFORT-02). All five factors SHALL be sourced from the per-day daily
object owned by the `forecast` capability — the single weather fetch in the
product (FR-FORECAST-01) — which supplies, per day, the apparent (feels-like)
high/low temperature, precipitation probability, wind speed, mean cloud cover,
and maximum UV index. This capability does not fetch them itself.

The function SHALL consume each factor in the exact units/encoding that
`forecast` pins on the Open-Meteo request, so "worsen one factor lowers the
value" is decidable independent of any other encoding:

- **Feels-like temperature** in **degrees Celsius** (`temperature_unit=celsius`),
  consistent with the forecast temperature contract.
- **Wind speed** in **metres per second** (`windspeed_unit=ms`), matching the
  forecast wind input — the function reads m/s, never km/h.
- **Precipitation probability** as an **integer percent in `0..100`** (not a
  `0..1` fraction).
- **Cloud cover** as an **integer percent in `0..100`**.
- **UV index** as the **dimensionless Open-Meteo index** (typically `0..11+`).

The function SHALL treat absent or unparseable factors (`null`, `undefined`,
`NaN`, or a missing field) as neutral/unknown rather than failing, so the total
contract (FR-COMFORT-01) holds for real Open-Meteo payloads that omit fields.
"Neutral" means a missing factor neither crashes nor silently counts as the best-
or worst-possible value: it contributes a mid-band, score-neutral influence so a
day with a missing factor is not pushed to `0` or `100` by that absence alone.

#### Scenario: All five factors influence the score, in their pinned units

- **GIVEN** a baseline pleasant day whose factors use the pinned units (feels-like
  ~22 (°C), precipitation probability ~5 (percent, `0..100`), wind ~2 (m/s),
  cloud cover ~30 (percent, `0..100`), UV index ~3 (dimensionless))
- **WHEN** exactly one factor at a time is worsened in those same units — colder
  or hotter feels-like in °C, higher precipitation probability toward `100`,
  stronger wind in m/s, heavier cloud cover toward `100`, harsher UV index — while
  the other four are held at baseline
- **THEN** for each worsened factor the returned `value` is strictly lower than
  the baseline `value`, so each of the five inputs is independently reflected in
  scoring
- **AND** the comparison is reproducible because every input is interpreted in the
  units `forecast` pins (`temperature_unit=celsius`, `windspeed_unit=ms`, percent
  in `0..100` for precipitation and cloud cover, dimensionless UV)

#### Scenario: Null or missing factors are treated as neutral, never throw

- **GIVEN** a `daily` input where some factors are `null`, `undefined`, or
  `NaN` and some hourly entries are missing
- **WHEN** `comfortScore(daily)` is called
- **THEN** it returns a valid `{ value, rationale }` with `value` in `0..100`
- **AND** it does not throw
- **AND** missing factors are treated as neutral/unknown (they neither crash nor
  silently count as the best- or worst-possible value in a way that breaks the
  range)

#### Scenario: Empty or entirely absent input still returns a verdict

- **GIVEN** an empty object `{}`, `null`, or `undefined` passed as `daily`
- **WHEN** `comfortScore(daily)` is called
- **THEN** it returns a valid `{ value, rationale }` with `value` in `0..100`
- **AND** it does not throw

### Requirement: Ukrainian rationale, single sentence, max 80 chars, no emoji

The `rationale` returned by `comfortScore` SHALL be a single sentence in
Ukrainian, at most 80 characters long, containing no emoji (FR-COMFORT-03). To
honor the project's calm tone (BC-BRAND-01) the rationale SHALL contain no
exclamation marks. The rationale SHALL be non-empty for every input, including
missing-data inputs.

The rationale SHALL agree with the `value`'s comfort band (FR-COMFORT-04) so the
sentence explains the number rather than contradicting it (Purpose). The function
SHALL select the rationale's sentiment from the band the `value` falls in — green
(`value >= 70`), yellow (`40 <= value <= 69`), or red (`value < 40`) — so a green
`value` never yields a discouraging "bad day" sentence and a red `value` never
yields a "pleasant day" sentence. To make this objectively verifiable, the
sentiment SHALL be drawn from band-specific, mutually exclusive Ukrainian phrasing
(for example a positive/"comfortable" set for green, a measured/"so-so" set for
yellow, and a cautioning/"poor" set for red, plus a distinct neutral
"not-enough-data" phrasing for the missing-data verdict), so a tester can decide
from the `value` alone which sentiment band the sentence must belong to.

#### Scenario: Rationale is a non-empty Ukrainian sentence within the limit

- **GIVEN** any valid `daily` input
- **WHEN** `comfortScore(daily)` is called
- **THEN** `rationale` is a non-empty string
- **AND** its length is `<= 80` characters
- **AND** it is written in Ukrainian (Cyrillic) and reads as one sentence

#### Scenario: Rationale never contains emoji or exclamation marks

- **GIVEN** any `daily` input across the full factor range
- **WHEN** `comfortScore(daily)` is called
- **THEN** `rationale` contains no emoji / pictographic characters
- **AND** `rationale` contains no `!` (exclamation mark)

#### Scenario: Rationale sentiment matches the value's comfort band

- **GIVEN** three `daily` inputs that produce, respectively, a green `value`
  (`>= 70`), a yellow `value` (`40..69`), and a red `value` (`< 40`)
- **WHEN** `comfortScore(daily)` is called for each
- **THEN** the green-band `rationale` reads as a positive/comfortable Ukrainian
  verdict, the yellow-band `rationale` as a measured/so-so verdict, and the
  red-band `rationale` as a cautioning/poor verdict
- **AND** each `rationale` belongs to the sentiment set for its own band and not
  to another band's set, so a positive "приємний день"-style sentence can never
  accompany a red `value` and a discouraging sentence can never accompany a green
  `value`
- **AND** a tester can decide pass/fail by checking which band the `value` is in
  and confirming the sentence belongs to that band's phrasing

#### Scenario: Rationale is present even for missing-data inputs

- **GIVEN** a `daily` input that is empty, `null`, or has all factors missing
- **WHEN** `comfortScore(daily)` is called
- **THEN** `rationale` is still a non-empty Ukrainian sentence `<= 80` chars
- **AND** it reads as a calm "not enough data" / neutral verdict rather than an
  error string or stack message

### Requirement: Comfort badge color thresholds

Each day's score SHALL be displayed as a colored badge derived from `value`:
green when `value >= 70`, yellow when `40 <= value <= 69`, and red when
`value < 40` (FR-COMFORT-04). The thresholds SHALL be applied at the exact
boundaries (`70` is green; `69` is yellow; `40` is yellow; `39` is red). Badge
label text SHALL come from the centralized Ukrainian strings (NFR-I18N-01) and
SHALL be readable to assistive tech (color is not the only signal).

#### Scenario: Green badge at and above 70

- **GIVEN** a day whose `value` is `70` (and another whose `value` is `85`)
- **WHEN** the day card renders the comfort badge
- **THEN** the badge uses the green variant for both

#### Scenario: Yellow badge across the 40–69 band inclusive

- **GIVEN** days whose `value` is `40`, `55`, and `69`
- **WHEN** the day card renders the comfort badge
- **THEN** the badge uses the yellow variant for each

#### Scenario: Red badge below 40

- **GIVEN** a day whose `value` is `39` (and another whose `value` is `0`)
- **WHEN** the day card renders the comfort badge
- **THEN** the badge uses the red variant for both

#### Scenario: Badge meaning is conveyed beyond color

- **GIVEN** any rendered comfort badge
- **WHEN** the badge is presented
- **THEN** the numeric `value` and/or an accessible Ukrainian label conveys the
  level, so color is not the sole carrier of meaning (supports NFR-A11Y-01)

### Requirement: Upcoming-weekend highlight using local dates

The system SHALL compute and highlight an upcoming-weekend comfort summary at
the top of the forecast grid, defined as the average of the upcoming Saturday
and Sunday scores (FR-COMFORT-05). This logic SHALL rely on a defined positive
source for each day's date: every per-day object supplied by the `forecast`
capability carries that day's **location-local calendar date** as its `daily.time`
entry (a `YYYY-MM-DD` string in the active location's timezone, produced by
`forecast`'s `timezone=auto` request — see the forecast capability's "Fetch daily
and hourly forecast" requirement, FR-FORECAST-01). The upcoming Saturday and
Sunday SHALL be selected by deriving each day's weekday from that local
`daily.time` date.

"Upcoming weekend" SHALL therefore be resolved from the **active location's local
calendar dates**, NOT the visitor's clock and NOT via `toISOString()` /
`Date.prototype.toISOString().slice(0,10)`; day-bound logic SHALL use those
per-day local dates so a Friday-evening visitor in another timezone still sees the
correct weekend. The summary label SHALL come from the centralized Ukrainian
strings (NFR-I18N-01).

#### Scenario: Weekend average highlighted at top of the grid

- **GIVEN** a 7-day forecast for a location whose window includes the next
  Saturday and Sunday
- **WHEN** the forecast grid renders
- **THEN** an upcoming-weekend summary appears at the top of the grid
- **AND** its score equals the average of that Saturday's and Sunday's
  `comfortScore.value`
- **AND** the summary badge color follows the same thresholds (FR-COMFORT-04)

#### Scenario: Weekend is chosen by each day's location-local date, not the viewer's clock

- **GIVEN** a forecast whose per-day objects each carry the active location's
  local calendar date in their `daily.time` entry (supplied by `forecast` via
  `timezone=auto`, FR-FORECAST-01)
- **WHEN** the upcoming Saturday and Sunday are selected
- **THEN** selection derives each day's weekday from that day's own local
  `daily.time` date and picks the days whose weekday is Saturday and Sunday
- **AND** it does not use `toISOString()`-derived dates or the visitor's own
  timezone, so for a location east of UTC the boundary day near midnight is not
  off by one

#### Scenario: Only one weekend day present in the window

- **GIVEN** a forecast window that contains the upcoming Sunday but the Saturday
  falls outside the available 7 days (or vice versa)
- **WHEN** the upcoming-weekend summary is computed
- **THEN** the summary degrades calmly using the single available weekend day's
  score (no crash, no `NaN`)
- **AND** the highlight still renders with a valid badge

#### Scenario: No weekend day in the window degrades calmly

- **GIVEN** a forecast window that contains neither the upcoming Saturday nor
  Sunday
- **WHEN** the upcoming-weekend summary is computed
- **THEN** no `NaN`/throw occurs and the grid still renders its day cards
- **AND** either the highlight is omitted or it shows a calm Ukrainian
  "weekend not in range" state (never an error toast or raw 500)

### Requirement: Centralized Ukrainian copy for comfort UI

The system SHALL source all user-visible strings for this capability — badge
labels, the weekend-summary label, and any neutral/missing-data wording — from
the centralized Ukrainian strings in `lib/i18n/uk.ts` (with an `en.ts`
fallback), with no runtime i18n library in the MVP (NFR-I18N-01). Copy SHALL be
calm and practical with no exclamation marks (BC-BRAND-01). The pure scoring function's
`rationale` is generated in Ukrainian by `lib/scoring/comfort.ts` itself and is
the one comfort string allowed to originate outside `i18n` because it is a
computed sentence, not a static label.

#### Scenario: Comfort UI labels resolve from the i18n module

- **GIVEN** the comfort badge and weekend-summary components render
- **WHEN** their static labels are read
- **THEN** every static label comes from `lib/i18n/uk.ts` (Ukrainian-first)
- **AND** no hardcoded UI label and no exclamation mark appears in the rendered
  comfort copy
