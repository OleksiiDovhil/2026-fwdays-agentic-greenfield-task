# Weekend Compare Specification

## Purpose

Let an anonymous visitor weigh up to three cities side by side for the upcoming
weekend so they can decide where a trip is worth taking. The visitor pins cities
into a small chip row above the forecast, then flips a "Compare weekend" toggle
to see a Saturday/Sunday table — hi/lo, precipitation chance, and comfort score
per city. Comfort numbers reuse the `comfort-score` capability and weekend data
reuses `forecast`; pinned-city state lives only in memory (no database, no
cookies — ADR-0003), so it resets on reload. Everything is keyless, Ukrainian-
first, calm in tone, accessible, and silent in the console.

## Requirements

### Requirement: Pin up to 3 cities into a chip row above the forecast

The system SHALL let the visitor pin cities for comparison, showing each pinned
city as a chip in a small chip row positioned above the forecast (FR-COMPARE-01).
The system SHALL allow at most 3 pinned cities at once. Each chip SHALL display
its city name and SHALL expose a control to unpin (remove) it. When 3 cities are
pinned, the system SHALL prevent pinning a fourth and SHALL communicate the cap
with a calm Ukrainian message (no exclamation marks) sourced from the centralized
Ukrainian strings in `lib/i18n/uk.ts` (NFR-I18N-01), rather than silently
dropping the action. Pinning the same city twice SHALL NOT create a duplicate
chip. The pinned-city list is held in memory only and SHALL reset on reload
(ADR-0003); the chip row SHALL NOT be shown while no city is pinned.

#### Scenario: Pinning the active city adds a chip

- **GIVEN** an active location `Київ` and no cities pinned yet
- **WHEN** the visitor pins `Київ`
- **THEN** a chip labelled `Київ` appears in the chip row above the forecast
- **AND** the chip exposes an accessible control to unpin it

#### Scenario: Pinning is capped at 3 cities

- **GIVEN** three cities are already pinned (`Київ`, `Львів`, `Одеса`)
- **WHEN** the visitor attempts to pin a fourth city (`Харків`)
- **THEN** the fourth city is not added and the chip row still shows exactly the
  three pinned cities
- **AND** a calm Ukrainian message explains that the limit of three is reached
  (no exclamation marks, no error toast)

#### Scenario: Pinning an already-pinned city does not duplicate it

- **GIVEN** `Львів` is already pinned
- **WHEN** the visitor pins `Львів` again
- **THEN** the chip row still shows a single `Львів` chip (no duplicate)
- **AND** the total number of pinned cities is unchanged

#### Scenario: Unpinning a city removes its chip

- **GIVEN** two cities are pinned (`Київ`, `Львів`)
- **WHEN** the visitor unpins `Львів` from its chip
- **THEN** the `Львів` chip is removed and only `Київ` remains in the chip row
- **AND** if comparison is open, the `Львів` column is removed from the table

#### Scenario: Pinned cities do not persist across reload

- **GIVEN** three cities are pinned
- **WHEN** the page is reloaded
- **THEN** no cities are pinned and the chip row is not shown
- **AND** no cookie, local storage entry, or server record was written to restore
  the pins (ADR-0003)

#### Scenario: Chip row is hidden when nothing is pinned

- **GIVEN** the visitor has not pinned any city
- **WHEN** the forecast view is shown
- **THEN** the chip row is not rendered above the forecast
- **AND** the "Compare weekend" toggle does not present an empty comparison

### Requirement: "Compare weekend" toggle shows a Sat/Sun comparison table

The system SHALL provide a "Compare weekend" toggle that switches the view to a
comparison table for the upcoming Saturday and Sunday with one column per pinned
city — up to three columns (FR-COMPARE-02). For each pinned city, the table SHALL
show, for Saturday and for Sunday: the high/low temperature, the precipitation
probability (as a percentage), and the comfort score. Comfort scores SHALL be
sourced from the `comfort-score` capability and weekend hi/lo and precipitation
from the `forecast` capability for each pinned city; this capability SHALL NOT
recompute weather or scoring. Toggling the control off SHALL return the visitor
to the normal forecast view while keeping the pinned cities intact. When a pinned
city's weekend data is still loading, missing, or failed to load, the
corresponding cell(s) SHALL render a calm placeholder (for example, an em dash)
instead of a blank, an error, or a thrown exception.

#### Scenario: Toggling on shows a column per pinned city with Sat/Sun rows

- **GIVEN** three cities are pinned (`Київ`, `Львів`, `Одеса`) with loaded
  weekend forecasts
- **WHEN** the visitor turns the "Compare weekend" toggle on
- **THEN** a comparison table is shown with one column per pinned city (three
  columns)
- **AND** for each city the table shows Saturday and Sunday hi/lo °C,
  precipitation probability as a percentage, and the comfort score from
  `comfort-score`

#### Scenario: Toggling off returns to the forecast and keeps pins

- **GIVEN** the comparison table is shown with cities pinned
- **WHEN** the visitor turns the "Compare weekend" toggle off
- **THEN** the normal forecast view is shown again
- **AND** the chip row and its pinned cities are unchanged

#### Scenario: Comfort score values reuse comfort-score, not a local copy

- **GIVEN** the comparison table is shown for a pinned city
- **WHEN** the comfort score cell is rendered for Saturday and Sunday
- **THEN** the displayed score equals the value produced by the `comfort-score`
  capability for that city and day
- **AND** no separate scoring calculation is performed inside `weekend-compare`

#### Scenario: A single pinned city still renders a one-column table

- **GIVEN** exactly one city is pinned
- **WHEN** the visitor turns "Compare weekend" on
- **THEN** a single-column comparison table is shown for that city with the
  Saturday and Sunday rows
- **AND** the table is not treated as empty or in error

#### Scenario: Missing or failed weekend data renders a calm placeholder

- **GIVEN** a pinned city whose weekend forecast is still loading or failed to
  load (network error, non-OK response, or malformed payload from `forecast`)
- **WHEN** the comparison table is rendered
- **THEN** that city's affected cells show a calm placeholder (for example, an
  em dash) rather than a blank, a raw error, or a 500
- **AND** the other cities' columns continue to render their values normally
- **AND** no error toast is shown and no uncaught exception occurs

### Requirement: Comparison cells render extreme and locale values correctly

The system SHALL format the comparison table's numeric cells so that extreme,
negative, and locale-formatted values render correctly rather than being
truncated, mis-signed, or shown as a misleading default (FR-COMPARE-02). High/low
temperatures SHALL display in degrees Celsius with their sign preserved, so a
Ukrainian-winter reading such as a high of `-12°C` and a low of `-20°C` shows the
minus sign and the `°C` unit and is not rendered as `12`, `20`, a blank, or `0`;
the hi/lo cell SHALL stay within its column without clipping the digits or the
sign. Precipitation probability SHALL display as a percentage in the `0%..100%`
range with the `%` unit; a genuine zero-probability value (`0%`) is a valid value
and SHALL be shown as `0%`, whereas an **absent** precipitation probability SHALL
follow the calm-placeholder rule (a neutral placeholder such as an em dash, never
a misleading `0%`), consistent with the `forecast` capability. Numeric formatting
(decimal/grouping separators, the degree and percent symbols, and the minus sign)
SHALL be consistent with the Ukrainian-first locale of the rest of the UI.

#### Scenario: Negative hi/lo temperatures keep their sign and unit

- **GIVEN** a pinned city whose weekend day has a high of `-12°C` and a low of
  `-20°C`
- **WHEN** that city's Saturday (or Sunday) hi/lo cell renders
- **THEN** the cell shows the negative high and low with the minus sign and the
  `°C` unit (for example `-12°C / -20°C`), not `12 / 20`, not a blank, and not `0`
- **AND** the sign and digits stay within the column without being clipped or
  overlapping the neighbouring column

#### Scenario: Zero precipitation shows 0%, absent precipitation shows a placeholder

- **GIVEN** one pinned city whose weekend day has a precipitation probability of
  exactly `0%` and another whose precipitation probability is absent from the
  `forecast` payload
- **WHEN** the precipitation cells render for both
- **THEN** the genuine zero is shown as `0%` (a real value, not hidden)
- **AND** the absent value shows a neutral placeholder (for example an em dash),
  not a misleading `0%` and not a blank

#### Scenario: Percentage stays within the valid range and locale formatting

- **GIVEN** weekend precipitation probabilities at the edges (`0%` and `100%`)
  across the pinned cities
- **WHEN** the precipitation cells render
- **THEN** each value displays within `0%..100%` with the `%` unit and the
  Ukrainian-first numeric formatting used elsewhere in the UI
- **AND** no value renders out of range, without a unit, or as a raw unformatted
  number

### Requirement: Sticky column headers with city name and "make active" button

The system SHALL give each city column a sticky header that remains visible while
the comparison table scrolls; each header SHALL show the city name and a "make
active" button (FR-COMPARE-03). The header SHALL keep the city name and the "make
active" button readable even when the city name is long (for example a long
Ukrainian city name): the city name SHALL be constrained to its column (truncated
with an ellipsis or wrapped) so it does not overflow the column, overlap the
"make active" button, or break the header layout; a truncated name SHALL remain
fully available to assistive technology and on hover/focus (for example via a
`title`/`aria-label` carrying the full name). Activating a column's "make active"
button SHALL set that city as the active location for the rest of the app
(driving the main forecast and map for that place), without unpinning the city or
losing the other pinned cities. The currently active city's column header SHALL be
distinguished by a signal that does **not** rely on color alone (NFR-A11Y-01,
NFR-A11Y-02): the active column's header SHALL carry `aria-current` (so assistive
technology announces it as current) **and** a visible non-color cue — a textual or
icon marker (for example a "active" label, a checkmark, or a marker glyph) and/or
the active column's "make active" control rendered in a distinct pressed/disabled
state — in addition to any color highlight, so the active column is identifiable
without perceiving color.

#### Scenario: Header stays visible during vertical scroll

- **GIVEN** the comparison table is tall enough that its rows scroll vertically
- **WHEN** the visitor scrolls the table contents downward (the Sat/Sun rows move
  up out of view)
- **THEN** each column's header — showing the city name and the "make active"
  button — stays pinned to the top edge of the table and remains visible rather
  than scrolling away with the rows

#### Scenario: Header stays aligned with its column during horizontal scroll

- **GIVEN** the comparison table (up to three columns) is wide enough that its
  columns scroll horizontally on a narrow viewport
- **WHEN** the visitor scrolls the table horizontally
- **THEN** each header travels horizontally together with its own column so the
  city name and "make active" button stay aligned directly above that city's
  Sat/Sun cells (the header does not detach from or misalign with its column)

#### Scenario: "Make active" sets the active location

- **GIVEN** the comparison table shows columns for `Київ`, `Львів`, and `Одеса`,
  with `Київ` currently active
- **WHEN** the visitor presses "make active" in the `Львів` column header
- **THEN** the active location becomes `Львів` (the main forecast and map follow
  `Львів`)
- **AND** all three cities remain pinned and the comparison table still shows all
  three columns

#### Scenario: Active column is distinguished beyond color

- **GIVEN** the comparison table with `Київ` currently active among the pinned
  columns
- **WHEN** the table is rendered
- **THEN** the `Київ` header carries `aria-current` (announced by assistive
  technology as the current/active column) while the other headers do not
- **AND** the `Київ` header also shows a visible non-color cue (a textual or icon
  marker, and/or its "make active" control shown in a distinct pressed/disabled
  state) so the active column is identifiable without relying on color
- **AND** activating `Львів` moves both `aria-current` and the visible non-color
  cue from the `Київ` header to the `Львів` header

#### Scenario: Making the active city active again is a no-op

- **GIVEN** `Київ` is the active location and is a column in the table
- **WHEN** the visitor presses "make active" in the `Київ` column
- **THEN** `Київ` remains the active location and the view does not error or
  reset the other pinned cities

#### Scenario: A long city name does not break the sticky header

- **GIVEN** a pinned city with a long Ukrainian name (for example
  `Кам'янець-Подільський`) whose untruncated name is wider than its column
- **WHEN** that city's column header renders alongside its "make active" button
- **THEN** the displayed name is constrained to the column (truncated with an
  ellipsis or wrapped) and does not overflow the column, overlap the "make active"
  button, or push the button out of the header
- **AND** the "make active" button stays visible and operable in that header
- **AND** the full city name is still available to assistive technology and on
  hover/focus (for example via `title`/`aria-label`), not lost by truncation

### Requirement: Accessible comparison controls and headers (NFR-A11Y-01)

The system SHALL make every interactive element of this capability — pin/unpin
controls on chips, the "Compare weekend" toggle, and each column's "make active"
button — meet NFR-A11Y-01: every interactive element SHALL have an accessible
name and a visible focus style, and SHALL be operable by keyboard. The comparison
table SHALL be a real, semantically structured table (column headers associated
with their cells) so assistive technology can announce each value with its city
and day. The "Compare weekend" toggle SHALL expose its on/off state to assistive
technology.

#### Scenario: Every control is keyboard-operable, named, and focus-visible

- **GIVEN** the chip row and the comparison table are rendered
- **WHEN** a keyboard user tabs through the chip unpin controls, the "Compare
  weekend" toggle, and the "make active" buttons
- **THEN** each control receives a visible focus style and can be activated by
  keyboard
- **AND** each control exposes an accessible name to assistive technology (for
  example, the toggle and each "make active" button identify their purpose and
  city)

#### Scenario: Table semantics associate values with city and day

- **GIVEN** the comparison table is shown
- **WHEN** assistive technology reads a comfort-score or precipitation cell
- **THEN** the cell is announced together with its city (column header) and its
  day (Saturday or Sunday) context
- **AND** the toggle's current on/off state is conveyed to assistive technology

### Requirement: Centralized Ukrainian copy for the compare UI (NFR-I18N-01)

The system SHALL source all user-visible static strings introduced by this
capability from the centralized Ukrainian strings in `lib/i18n/uk.ts` (with an
`en.ts` fallback), with no runtime i18n library in the MVP (NFR-I18N-01). This
includes, at minimum: the "Compare weekend" toggle label, the chip unpin control
label, the calm pin-cap message from FR-COMPARE-01, the "make active" button
label and the active-column marker text from FR-COMPARE-03, the Saturday/Sunday
and metric (hi/lo, precipitation, comfort) row/column labels, and the
neutral/missing-data placeholder wording from FR-COMPARE-02. The compare copy
SHALL be calm and practical with no exclamation marks (BC-BRAND-01). City names
shown in chips and headers come from the already-resolved location data, not from
`i18n`, and are exempt from this rule; comfort-score `rationale` text remains
owned by `comfort-score` and is likewise not re-defined here.

#### Scenario: Compare UI labels resolve from the i18n module

- **GIVEN** the chip row, the "Compare weekend" toggle, and the comparison table
  (including the column headers and "make active" buttons) render
- **WHEN** their static labels and the pin-cap message are read
- **THEN** every static label and the pin-cap message come from `lib/i18n/uk.ts`
  (Ukrainian-first), not hardcoded in components
- **AND** no rendered compare copy contains an exclamation mark

#### Scenario: Pin-cap and placeholder copy are centralized, not inline literals

- **GIVEN** the visitor hits the 3-city cap and a pinned city has missing weekend
  data
- **WHEN** the calm cap message and the missing-data placeholder/label copy are
  shown
- **THEN** both strings are sourced from `lib/i18n/uk.ts` (with the `en.ts`
  fallback), not authored as inline string literals in the compare components
- **AND** the cap message reads as a calm Ukrainian sentence with no exclamation
  marks

### Requirement: Console is silent during comparison usage (NFR-OBS-01)

The system SHALL keep the browser console free of warnings and errors during a
healthy weekend-compare session — pinning, hitting the 3-city cap, unpinning,
toggling comparison on and off, scrolling the table, and making a column active,
including the handled cases of missing or failed weekend data (NFR-OBS-01).
Expected, handled conditions (the pin cap, a city with no/failed weekend data)
SHALL be surfaced in the UI, never via `console.error` or `console.warn`.

#### Scenario: Healthy comparison session produces no console noise

- **GIVEN** a healthy session with cities pinned
- **WHEN** the visitor pins to the cap, unpins, toggles "Compare weekend" on and
  off, scrolls the table, and makes a column active
- **THEN** no `console.error` or `console.warn` output is produced
- **AND** the pin cap and any missing/failed weekend data are communicated
  through the UI, not the console

## Out of scope (exclusions)

These are intentionally unsupported in the MVP and SHALL NOT be reported as
defects:

- Pinning more than 3 cities, reordering chips, or grouping/saving comparison
  sets — the cap is exactly 3 (FR-COMPARE-01).
- Persisting pinned cities, the toggle state, or the active column across reloads
  or sessions — pinned-city state is in memory only, no database and no cookies
  (ADR-0003, BC-PRIVACY-03).
- Comparing days other than the upcoming Saturday and Sunday (no full 7-day
  side-by-side, no historical or climate comparison) — comparison is weekend-only
  (FR-COMPARE-02; "Out of scope (MVP)" in `docs/requirements.md`).
- Comparison metrics beyond hi/lo, precipitation probability, and comfort score
  (no wind, UV, sunrise/sunset, or hourly chart columns) — those remain in the
  `forecast` capability.
- Computing comfort scores or fetching/caching forecasts inside this capability;
  scores come from `comfort-score` (FR-COMFORT-*) and weekend data from
  `forecast` (FR-FORECAST-*). This capability only pins, lays out, and toggles.
- Selecting or searching cities to pin from scratch; choosing a place is owned by
  `city-search` (FR-SEARCH-*) and `map` (FR-MAP-03). This capability pins from
  already-resolved locations.
- Exporting, printing, or sharing the comparison (no shareable comparison URL).
- This capability is optional in the MVP; its absence is not a defect against the
  other capabilities.
