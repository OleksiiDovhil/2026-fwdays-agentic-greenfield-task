## ADDED Requirements

<!--
This delta restates the baseline `openspec/specs/city-search/spec.md` contract
(adopted at G2) verbatim as ADDED requirements, for the record and so
`openspec validate add-city-search --strict` can validate the change against a
delta. Archive runs with `--skip-specs` because the baseline spec already holds
this content (OpenSpec Option B is not re-applied via the archive). Keep this
file in sync with the baseline if the baseline changes.

The baseline `## Purpose` and `### Pinned constants and conventions` preamble
(the 300 ms debounce, the 120-character cap, the coordinate contract, the
geocoding payload zod contract, latest-wins ordering, the FR-SEARCH-05 literal
reconciliation) live in the baseline spec and govern the requirements below;
they are summarised inline where a scenario depends on them so each scenario
stays objectively pass/fail.
-->

### Requirement: Debounced free-form city search

The system SHALL provide a single free-form text input that, per FR-SEARCH-01,
issues debounced queries to the Open-Meteo geocoding API and renders the
returned places as a suggestion list. Queries SHALL be debounced with a fixed
`300 ms` idle interval (no request per keystroke): a request fires only after
the input has been idle for at least 300 ms since the last keystroke, and SHALL
NOT fire for an empty or whitespace-only input.

#### Scenario: Typing a city name yields debounced suggestions

- GIVEN the search input is focused and empty
- WHEN the visitor types "Київ" with each keystroke under 300 ms apart and then leaves the input idle for at least 300 ms
- THEN exactly one geocoding request is issued, for the final value "Київ" (not one per keystroke)
- AND the matching places are rendered as a suggestion list below the input.

#### Scenario: Keystrokes within the debounce window coalesce into one request

- GIVEN the search input is focused and empty
- WHEN the visitor types five characters with fewer than 300 ms between each and then stops
- THEN no geocoding request is issued until 300 ms after the fifth keystroke
- AND then exactly one request is issued for the five-character value.

#### Scenario: Empty or whitespace input issues no request

- GIVEN the search input contains text and suggestions are shown
- WHEN the visitor clears the input to empty or whitespace only
- THEN no geocoding request is issued
- AND the suggestion list is dismissed.

### Requirement: Latest-wins handling of overlapping geocoding responses

The system SHALL render suggestions (or the zero-results state) from the most
recently issued query only, because debounced typing can still leave more than
one geocoding request in flight. A superseded earlier request that resolves
after a newer one — whether by cancellation/abort of the stale request or by
discarding its late result — SHALL NOT replace the newer query's suggestions,
empty state, or inline error. This guarantees the visitor never sees suggestions
that belong to a stale query.

#### Scenario: A slow earlier response does not overwrite the newer query

- GIVEN the visitor types "Ki", a request R1 is issued for it, then quickly types "Kyiv", issuing a newer request R2
- WHEN R1 (the earlier request) resolves after R2 has already resolved and rendered suggestions for "Kyiv"
- THEN the suggestion list continues to reflect "Kyiv" (R2)
- AND R1's stale results are discarded and never rendered.

#### Scenario: A stale in-flight request does not resurrect a dismissed list

- GIVEN a request R1 for "Lvi" is in flight and the visitor then clears the input to empty
- WHEN R1 resolves after the input was cleared
- THEN the suggestion list stays dismissed
- AND R1's late results are not shown.

### Requirement: Oversized and odd query input is bounded, not crashed

The free-form input SHALL hard-cap the query at `120` characters before issuing
a geocoding request, so an oversized or pasted free-form value cannot produce an
unbounded request or crash the UI. Input beyond 120 characters SHALL be
truncated to 120 and only the truncated value SHALL be sent. Punctuation,
emoji, mixed scripts, and locale-formatted numbers typed into the query are
treated as ordinary search text — they are URL-encoded into the geocoding
request and never interpreted as code, markup, or coordinates.

#### Scenario: Oversized query is truncated to 120 characters

- GIVEN the search input is focused
- WHEN the visitor pastes a 5,000-character string and pauses past the 300 ms debounce
- THEN at most one geocoding request is issued
- AND the query value sent is truncated to 120 characters
- AND no uncaught exception occurs and the input stays editable.

#### Scenario: Odd free-form characters are sent as encoded search text

- GIVEN the search input is focused
- WHEN the visitor types a query containing punctuation, an emoji, and the locale-formatted number "50,45"
- THEN the value is URL-encoded into a single geocoding request as plain search text
- AND it is not interpreted as coordinates, markup, or executable input
- AND whatever the API returns (matches or zero results) is surfaced inline without an error toast.

### Requirement: Suggestion content

Each suggestion in the list SHALL display, per FR-SEARCH-02, the city name, the
administrative region, and the country. A flag emoji SHALL be shown when the
country code is available and SHALL be omitted gracefully when it is not, with
no broken glyph or placeholder box.

#### Scenario: Suggestion shows name, region, country, and flag

- GIVEN the geocoding API returns a place with name, admin region, and country code
- WHEN the suggestion is rendered
- THEN the city name, admin region, and country are visible in the row
- AND the country flag emoji is shown.

#### Scenario: Missing region or flag degrades cleanly

- GIVEN a returned place has no admin region and no resolvable country code
- WHEN the suggestion is rendered
- THEN the city name and country are still shown
- AND no empty separator, broken flag glyph, or placeholder box appears.

### Requirement: Selecting a suggestion sets the active location and updates the URL

Selecting a suggestion SHALL set the active location and, per FR-SEARCH-03,
reflect it in the URL as `?lat=&lon=&name=` so the result is shareable. Loading
the app with those query parameters present SHALL restore that active location
without requiring a new search.

Because `lat`, `lon`, and `name` arrive from outside the app (a shared or
hand-edited URL), the load-time read SHALL validate them against the coordinate
contract: `lat` and `lon` must each parse as a finite JSON number (period
decimal separator) with `lat` in `[-90, 90]` and `lon` in `[-180, 180]`, and
`name` SHALL be treated as untrusted display text capped at `120` characters and
rendered as text (never as markup). If `lat` or `lon` is missing, non-numeric,
out of range, oversized, or a locale-variant comma decimal (for example
`50,45`), the app SHALL ignore the malformed parameters, SHALL NOT set an active
location from them, SHALL NOT throw or show a 500, and SHALL fall back to the
calm empty/search state.

#### Scenario: Selecting a suggestion writes shareable URL params

- GIVEN a suggestion list is shown for a query
- WHEN the visitor clicks a suggestion for a place at a known latitude and longitude
- THEN the active location is set to that place
- AND the URL is updated to include `lat`, `lon`, and `name` query parameters reflecting the selection
- AND the suggestion list is dismissed.

#### Scenario: Opening a shared URL restores the active location

- GIVEN the app is opened at a URL whose query string contains valid `lat`, `lon`, and `name` (for example `?lat=50.45&lon=30.52&name=Київ`)
- WHEN the page loads
- THEN the active location is set from those parameters
- AND no geolocation prompt and no geocoding search are triggered by the load.

#### Scenario: Non-numeric or comma-decimal coordinates are ignored

- GIVEN the app is opened at `?lat=abc&lon=50,45&name=Test`
- WHEN the page loads
- THEN neither parameter parses as a valid finite number, so no active location is set from them
- AND the app shows its calm empty/search state with no thrown error and no 500.

#### Scenario: Out-of-range coordinates are ignored

- GIVEN the app is opened at `?lat=999&lon=30.52&name=Test` (latitude outside `[-90, 90]`)
- WHEN the page loads
- THEN the out-of-range coordinate is rejected and no active location is set from the parameters
- AND the app shows its calm empty/search state with no thrown error and no 500.

#### Scenario: Oversized name parameter is bounded and rendered as text

- GIVEN the app is opened with valid `lat` and `lon` and a `name` of 5,000 characters that includes angle brackets
- WHEN the page loads and the location label renders
- THEN the `name` is capped at 120 characters and rendered as plain text, not as markup or executable input
- AND no uncaught exception occurs.

### Requirement: Enter auto-selects a single suggestion

The system SHALL auto-select the sole suggestion when the visitor presses Enter
in the input and the suggestion list contains exactly one suggestion, per
FR-SEARCH-04, applying the same active-location and URL behavior as a click.

#### Scenario: Enter with exactly one suggestion selects it

- GIVEN the suggestion list shows exactly one suggestion
- WHEN the visitor presses Enter in the input
- THEN that single suggestion is selected as the active location
- AND the URL is updated with `lat`, `lon`, and `name` as for a click.

#### Scenario: Enter with multiple suggestions and no active descendant does not guess

- GIVEN the suggestion list shows two or more suggestions and no option is the active descendant (the visitor has not used Arrow keys, so `aria-activedescendant` is unset)
- WHEN the visitor presses Enter in the input
- THEN no suggestion is auto-selected
- AND the active location is unchanged.

### Requirement: Zero results show an inline message, never a toast

The system SHALL show the inline Ukrainian message "Нічого не знайдено" in
place of the suggestion list when the geocoding API returns zero results for a
non-empty query, per FR-SEARCH-05, and SHALL NOT show an error toast or treat
an empty result set as a failure.

#### Scenario: No matches shows the inline empty message

- GIVEN the visitor types a query that the geocoding API resolves to zero results
- WHEN the (empty) response is received
- THEN the inline message "Нічого не знайдено" is shown in place of the suggestion list
- AND no error toast is displayed
- AND the search input remains focused and editable.

### Requirement: Opt-in "Use my location" via explicit click only

The system SHALL provide a "Use my location" button that reads browser
geolocation ONLY on an explicit click, per FR-SEARCH-06 and BC-PRIVACY-02, and
never on page load. On a successful read it SHALL set the active location from
the returned coordinates (updating the URL as for a selection). If permission
is denied or geolocation is unavailable, it SHALL show a calm inline message in
Ukrainian (no exclamation marks, sourced from the centralised i18n strings) and
SHALL NOT show an error toast.

#### Scenario: Geolocation is never read on page load

- GIVEN a fresh page load with no query parameters
- WHEN the page finishes loading and is idle
- THEN the browser geolocation API has not been called
- AND no permission prompt has been triggered.

#### Scenario: Explicit click sets the active location

- GIVEN the visitor clicks "Use my location" and grants permission
- WHEN coordinates are returned by the browser
- THEN the active location is set from those coordinates
- AND the URL is updated with `lat`, `lon`, and `name` reflecting the location.

#### Scenario: Denied permission shows a calm inline message

- GIVEN the visitor clicks "Use my location"
- WHEN the browser reports permission denied
- THEN a calm inline message in Ukrainian (no exclamation marks) is shown explaining location is unavailable
- AND no error toast is displayed
- AND the active location is unchanged.

#### Scenario: Geolocation unsupported shows a calm inline message

- GIVEN the browser does not expose a geolocation API
- WHEN the visitor clicks "Use my location"
- THEN a calm inline message in Ukrainian (no exclamation marks) is shown that location is unavailable
- AND no error toast is displayed.

### Requirement: Failures and malformed payloads degrade calmly

The system SHALL surface every error path of search and geolocation — network
failure, a non-OK geocoding response, or a malformed/unparseable geocoding
payload — as a calm inline state in Ukrainian (no exclamation marks, sourced
from the centralised i18n strings), and SHALL NOT produce an error toast, an
uncaught exception, or a 500. The geocoding response SHALL be parsed and
validated against the geocoding payload contract (the zod schema named in
"Pinned constants and conventions") before any suggestion renders; a `200`
response whose body fails that schema SHALL be treated exactly like a failed
fetch, not rendered as partial data.

#### Scenario: Network failure during search is shown inline

- GIVEN the visitor has typed a query
- WHEN the geocoding request fails due to a network error
- THEN a calm inline message in Ukrainian (no exclamation marks) is shown that suggestions could not be loaded
- AND no error toast and no uncaught exception occur
- AND the input remains editable so the visitor can retry.

#### Scenario: Non-OK status is treated as a failed fetch

- GIVEN the visitor has typed a query
- WHEN the geocoding endpoint responds with a non-OK HTTP status (for example 500)
- THEN the body is not rendered as suggestions and a calm inline message in Ukrainian (no exclamation marks) is shown
- AND no error toast, no uncaught exception, and no 500 surfaced to the visitor occur.

#### Scenario: Payload that fails the zod schema is handled, not crashed

- GIVEN the geocoding endpoint returns HTTP 200 with a body that fails the geocoding payload zod schema (for example `results` is a string, or a result is missing `latitude`)
- WHEN the response is parsed and validated
- THEN zod validation fails, the body is discarded, and it is treated as a failed fetch
- AND a calm inline message in Ukrainian (no exclamation marks) is shown rather than partial or malformed suggestions
- AND no error toast, no uncaught exception, and no 500 occur.

### Requirement: Accessible combobox search interaction

The search input and its suggestion list SHALL implement the WAI-ARIA
combobox/listbox pattern per NFR-A11Y-01, so the suggestion list is operable and
announced via the keyboard without relying on Tab to step through each option:

- The text input SHALL have an accessible name and `role="combobox"` with
  `aria-expanded` reflecting whether the suggestion list is open and
  `aria-controls` referencing the list.
- The suggestion list SHALL be a single element with `role="listbox"` and an
  accessible name, and each suggestion SHALL be an element with `role="option"`.
- Keyboard focus stays in the input; the visitor moves between options with the
  Arrow Down / Arrow Up keys, which set exactly one option as the active
  (highlighted) descendant. The active option SHALL be the target of
  `aria-activedescendant` on the input and SHALL carry `aria-selected="true"`,
  giving the highlighted state a concrete, reachable, testable definition.
- Tab SHALL NOT step through individual options; it moves focus past the
  combobox to the next control (the "Use my location" button).
- Pressing Enter while an option is the active descendant SHALL select that
  option (active-location and URL behavior as for a click); Escape SHALL close
  the list and clear the active descendant.

The "Use my location" button SHALL have an accessible name and a visible focus
style. A healthy search or geolocation session SHALL keep the browser console
silent per NFR-OBS-01: no warnings and no errors.

#### Scenario: Input and list expose combobox/listbox semantics

- GIVEN the visitor has typed a query and suggestions are shown
- WHEN assistive technology inspects the search UI
- THEN the input has an accessible name, `role="combobox"`, `aria-expanded="true"`, and `aria-controls` pointing at the list
- AND the list has `role="listbox"` with an accessible name and each suggestion has `role="option"`.

#### Scenario: Arrow keys move the active descendant and announce it

- GIVEN the suggestion list shows two or more options and none is yet active
- WHEN the visitor presses Arrow Down
- THEN exactly one option becomes the active (highlighted) descendant, referenced by `aria-activedescendant` on the input and carrying `aria-selected="true"`
- AND keyboard focus remains in the input so the option change is announced to assistive technology.

#### Scenario: Enter selects the active descendant

- GIVEN the suggestion list is open and one option is the active descendant via Arrow keys
- WHEN the visitor presses Enter
- THEN that active option is selected as the active location with `lat`, `lon`, and `name` written to the URL as for a click
- AND the list closes and the active descendant is cleared.

#### Scenario: Tab moves past the combobox, not through options

- GIVEN the suggestion list is open with several options
- WHEN the visitor presses Tab from the input
- THEN focus moves to the "Use my location" button, not to an individual option
- AND the button exposes an accessible name and shows a visible focus style.

#### Scenario: Console stays silent on a healthy session

- GIVEN a healthy session with a successful search and a successful geolocation read
- WHEN the visitor searches, selects a suggestion, and uses "Use my location"
- THEN no warnings and no errors are emitted to the browser console.

### Requirement: Out-of-scope exclusions for the city-search capability

The city-search capability SHALL be limited to free-form name search,
"Use my location" geolocation, setting the active location, and reflecting it in
the URL. The following are intentionally unsupported in this capability and SHALL
NOT be reported as defects: reverse-geocoding a map click into a place (owned by
the `map` capability, FR-MAP-03); fetching or rendering any forecast for the
selected location (owned by the `forecast` capability, FR-FORECAST-*; this
capability only sets the active location); persisting search history, recent
cities, or favorites (no database and no cookies — BC-PRIVACY-03); pinning or
comparing multiple cities (owned by the `weekend-compare` capability,
FR-COMPARE-*); and localisation of place names beyond what Open-Meteo returns or
of UI strings beyond Ukrainian and English labels (NFR-I18N-01). These
exclusions are recorded as pass/fail scenarios so testers do not file scope as
bugs.

#### Scenario: Reverse-geocoding a map click is not owned here

- GIVEN a tester clicks the map expecting city-search to reverse-geocode the point
- WHEN they review the city-search capability spec
- THEN reverse-geocoding a map click is documented as owned by the `map` capability (FR-MAP-03)
- AND its absence from city-search is not a defect.

#### Scenario: Forecast fetching is not owned here

- GIVEN a tester selects a location and looks for a forecast to appear from city-search
- WHEN they review the city-search capability spec
- THEN forecast fetching and rendering are documented as owned by the `forecast` capability (FR-FORECAST-*)
- AND city-search only setting the active location, without rendering a forecast, is not a defect.

#### Scenario: Search history and favorites are out of scope

- GIVEN a tester searches several cities and looks for a saved history, recents, or favorites list
- WHEN they review the city-search capability spec
- THEN no history, recents, or favorites are persisted by design (no database, no cookies — BC-PRIVACY-03)
- AND the absence of a saved-search list is not a defect.

#### Scenario: Multi-city pinning and comparison are not owned here

- GIVEN a tester looks for a way to pin or compare multiple cities from city-search
- WHEN they review the city-search capability spec
- THEN pinning and weekend comparison are documented as owned by the `weekend-compare` capability (FR-COMPARE-*)
- AND their absence from city-search is not a defect.

#### Scenario: Place-name localisation is out of scope

- GIVEN a tester expects suggestion place names translated or localised beyond what Open-Meteo returns
- WHEN they review the city-search capability spec
- THEN place names are shown as returned by Open-Meteo, with UI strings limited to Ukrainian and English labels (NFR-I18N-01)
- AND untranslated place names are not a defect.
