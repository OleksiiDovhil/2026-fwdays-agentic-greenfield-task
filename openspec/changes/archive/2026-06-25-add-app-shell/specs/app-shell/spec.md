## ADDED Requirements

### Requirement: Single-page shell layout

The shell SHALL render a single-page application consisting of a persistent top
bar (logo and a theme indicator) above a main content area, with no full-page
navigation between routes (FR-SHELL-01). The active location and view state
SHALL live only in the URL query string and in-memory state; the shell SHALL NOT
read or write server-side session storage and SHALL NOT set any application
cookie (BC-PRIVACY-01, BC-PRIVACY-03). The shell SHALL own decoding and
validating the location query parameters (`lat`, `lon`, `name`) from the URL
into the in-memory active-location state on load; downstream capabilities
(including `city-search`, per FR-SEARCH-03) SHALL consume that already-validated
in-memory state rather than re-parse the raw URL. The shell SHALL treat the URL
query string as untrusted external input and SHALL accept it as a valid active
location only when `lat` parses to a finite number within `[-90, 90]`, `lon`
parses to a finite number within `[-180, 180]`, and `name` is a non-empty string
within a bounded length; otherwise it SHALL fall back to the first-load empty
state (see "First-load empty state"). All visible chrome text SHALL come from
the centralized string layer (NFR-I18N-01) and SHALL use a calm tone with no
exclamation marks (BC-BRAND-01).

#### Scenario: Top bar and main content render on load

- **GIVEN** a visitor opens the application root URL
- **WHEN** the page finishes its first render
- **THEN** a top bar showing the product logo and a theme indicator is visible
- **AND** a main content area is rendered directly below the top bar
- **AND** the page does not trigger a separate route navigation to display this frame

#### Scenario: Theme indicator reflects the active theme

- **GIVEN** the shell has rendered with a known active theme (light or dark)
- **WHEN** the visitor reads the top bar
- **THEN** the theme indicator visibly communicates the currently active theme
- **AND** the indicator has an accessible name describing the current theme (NFR-A11Y-01)

#### Scenario: No application cookie or server-side session is created

- **GIVEN** a visitor loads the shell and interacts with it
- **WHEN** the browser cookie store and network requests are inspected
- **THEN** no cookie is set by the application code (BC-PRIVACY-03)
- **AND** no request writes location or view state to a server-side session (BC-PRIVACY-01)

#### Scenario: Active location is held in the URL and in memory

- **GIVEN** a location has been selected so the URL carries well-formed `lat`, `lon`, and `name` query parameters
- **WHEN** the visitor reloads or shares that URL
- **THEN** the shell decodes and validates those parameters and restores the same active location into in-memory state from the URL query string
- **AND** downstream capabilities read that in-memory active location rather than re-parsing the raw URL
- **AND** no server-side persistence is consulted to recover the location

#### Scenario: Malformed, out-of-range, or partial location query string degrades to the empty state

- **GIVEN** a visitor opens or shares a URL whose location query string is malformed, out of range, or incomplete — for example `?lat=abc&lon=10` (non-numeric), `?lat=200&lon=999` (outside `[-90, 90]` / `[-180, 180]`), `?lat=50` with no `lon` or `name` (partial), or a `name` value far longer than the bounded limit
- **WHEN** the shell decodes and validates the query string on load
- **THEN** the invalid parameters are rejected and the shell renders the first-load empty state (or the shared inline pattern) calmly instead of treating them as an active location
- **AND** no crash, uncaught exception, NaN map center, or silently blank screen results (NFR-OBS-01)
- **AND** the browser console emits no warning or error for this handled case (NFR-OBS-01)

### Requirement: Responsive breakpoint layout

The main content area SHALL adapt its column count at the 768 px and 1280 px
breakpoints (FR-SHELL-02): a single column below 768 px, two columns from 768 px
up to but not including 1280 px, and three columns at 1280 px and above. Reflow
SHALL preserve reading order and SHALL keep every interactive element reachable
and operable at each width (NFR-A11Y-01).

#### Scenario: Mobile single-column layout below 768 px

- **GIVEN** the viewport width is less than 768 px
- **WHEN** the shell lays out the main content area
- **THEN** content is arranged in a single column
- **AND** all interactive controls remain reachable by scrolling and keyboard

#### Scenario: Tablet two-column layout from 768 px

- **GIVEN** the viewport width is at least 768 px and less than 1280 px
- **WHEN** the shell lays out the main content area
- **THEN** content is arranged in two columns
- **AND** reading order is preserved when columns reflow

#### Scenario: Desktop three-column layout from 1280 px

- **GIVEN** the viewport width is at least 1280 px
- **WHEN** the shell lays out the main content area
- **THEN** content is arranged in three columns
- **AND** no content is clipped or rendered off-screen

#### Scenario: Layout transitions cleanly across a breakpoint

- **GIVEN** the shell is displayed at a width just below 1280 px
- **WHEN** the viewport is resized to cross the 1280 px boundary
- **THEN** the layout switches between the two-column and three-column arrangement
- **AND** no console warning or error is emitted during the transition (NFR-OBS-01)

#### Scenario: Long chrome and hero text remain readable at the narrowest width

- **GIVEN** the viewport width is less than 768 px and the shell must render a long string — a long Ukrainian or English hero copy line, or a restored active-location `name` at an edge-length value in the top bar
- **WHEN** the shell lays out its chrome and hero copy in the single column
- **THEN** the text wraps or otherwise stays within its container and remains readable
- **AND** no content is clipped, truncated without indication, or overflows off-screen (FR-SHELL-02)

### Requirement: First-load empty state

On first load with no active location selected, the shell SHALL present an empty
state consisting of hero copy and a prominently centered city search as the
primary focal point (FR-SHELL-03). The hero copy SHALL be drawn from the
centralized Ukrainian-first string layer with a calm tone and no exclamation
marks (NFR-I18N-01, BC-BRAND-01). The empty state SHALL be a deliberate,
explained state — never a blank screen (NFR-OBS-01).

#### Scenario: Empty state shows hero copy and centered search

- **GIVEN** a visitor opens the application with no location query parameters in the URL
- **WHEN** the first-load empty state renders
- **THEN** hero copy is displayed
- **AND** a city search input is prominently centered as the primary focal point
- **AND** the screen is never left visually blank

#### Scenario: Selecting a location dismisses the empty state

- **GIVEN** the first-load empty state is displayed
- **WHEN** the visitor selects a location and the URL gains the location query parameters
- **THEN** the empty state is replaced by the located content layout
- **AND** the centered first-load hero copy is no longer shown

#### Scenario: Empty-state copy comes from the centralized strings

- **GIVEN** the first-load empty state is rendered
- **WHEN** the displayed hero text is inspected
- **THEN** the text resolves from the centralized string layer rather than a hardcoded literal
- **AND** the text contains no exclamation marks (BC-BRAND-01)

### Requirement: Shared inline error and empty-state pattern

The shell SHALL own and export a single reusable inline error/empty-state
presentation pattern that every other capability uses to surface failures and
empty results (NFR-OBS-01). The pattern SHALL render a calm message inline
within the affected region, SHALL NOT show a generic 500 page, and SHALL NOT
leave a silently blank area. All pattern copy SHALL come from the centralized
string layer (NFR-I18N-01) with a calm tone and no exclamation marks
(BC-BRAND-01), and the message container SHALL be announced to assistive
technology with an accessible name (NFR-A11Y-01).

#### Scenario: A capability failure renders a calm inline message

- **GIVEN** a capability rendered inside the shell reports a failed data fetch
- **WHEN** that capability uses the shared error pattern
- **THEN** a calm message is rendered inline within that capability's region
- **AND** the rest of the shell remains usable
- **AND** no generic 500 page is shown (NFR-OBS-01)

#### Scenario: An empty result renders an explained state, not a blank

- **GIVEN** a capability rendered inside the shell has no results to show
- **WHEN** that capability uses the shared empty-state pattern
- **THEN** an explanatory inline message occupies the region
- **AND** the region is never left silently blank (NFR-OBS-01)

#### Scenario: Inline message is accessible and calm

- **GIVEN** the shared inline error or empty-state message is displayed
- **WHEN** the message is read by assistive technology and inspected for tone
- **THEN** the message container exposes an accessible name (NFR-A11Y-01)
- **AND** the message text contains no exclamation marks (BC-BRAND-01)

#### Scenario: A runtime fault degrades to the inline pattern silently in the console

- **GIVEN** a capability inside the shell throws during data loading on an otherwise healthy session
- **WHEN** the shell's error boundary catches it and shows the shared inline pattern
- **THEN** the visitor sees a calm inline message instead of a crashed page
- **AND** the browser console emits no warning or error for this handled case (NFR-OBS-01)

### Requirement: Centralized Ukrainian-first UI strings

The shell SHALL source all of its own UI strings from a centralized layer with
Ukrainian as the primary locale in `lib/i18n/uk.ts` and an English fallback in
`lib/i18n/en.ts`, with no runtime i18n library in the MVP (NFR-I18N-01). When a
key is missing from the Ukrainian set, the shell SHALL fall back to the English
value for that key. The string module SHALL remain framework-free so it is fully
unit-testable, and all strings SHALL use a calm tone with no exclamation marks
(BC-BRAND-01).

#### Scenario: Shell renders Ukrainian strings by default

- **GIVEN** the centralized Ukrainian string set defines the shell's chrome text
- **WHEN** the shell renders the top bar and empty state
- **THEN** the displayed text matches the Ukrainian values from `lib/i18n/uk.ts`

#### Scenario: Missing Ukrainian key falls back to English

- **GIVEN** a UI string key is absent from `lib/i18n/uk.ts` but present in `lib/i18n/en.ts`
- **WHEN** the shell resolves that key
- **THEN** the English fallback value is returned
- **AND** no missing-key placeholder or console error is produced (NFR-OBS-01)

#### Scenario: No string contains an exclamation mark

- **GIVEN** the centralized Ukrainian and English string sets used by the shell
- **WHEN** every shell string value is inspected
- **THEN** none of the values contains an exclamation mark (BC-BRAND-01)

### Requirement: Accessibility and contrast across themes

Every interactive element the shell renders SHALL expose a visible focus style
and an accessible name (NFR-A11Y-01), and the shell's color palette SHALL meet
the WCAG AA contrast ratio in both the light and dark themes (NFR-A11Y-02).
These guarantees SHALL hold at all three responsive layouts.

#### Scenario: Interactive elements are focusable with visible focus

- **GIVEN** the shell is rendered with its top bar and content controls
- **WHEN** a keyboard user tabs through the interactive elements
- **THEN** each focused element shows a visible focus style
- **AND** each interactive element exposes an accessible name (NFR-A11Y-01)

#### Scenario: Text and controls meet AA contrast in light theme

- **GIVEN** the shell is displayed in the light theme
- **WHEN** foreground and background colors of text and controls are measured
- **THEN** the contrast ratios meet the WCAG AA threshold (NFR-A11Y-02)

#### Scenario: Text and controls meet AA contrast in dark theme

- **GIVEN** the shell is displayed in the dark theme
- **WHEN** foreground and background colors of text and controls are measured
- **THEN** the contrast ratios meet the WCAG AA threshold (NFR-A11Y-02)

### Requirement: Out-of-scope shell exclusions

The shell SHALL NOT implement features outside its foundational frame, so that
their absence is understood as intended scope rather than a defect. The shell
SHALL NOT provide accounts, authentication, sign-in, or any server-side
persistence of user state (BC-PRIVACY-01, BC-PRIVACY-03). The shell SHALL NOT
own the contents of the city search, forecast, map, jokes, clock, comfort score,
animated background, or weekend-compare capabilities; it only provides the frame
and the shared inline pattern they render into. The shell DOES own decoding and
validating the location query parameters from the URL into the in-memory
active-location state; capabilities consume that validated state and SHALL NOT
re-parse the raw URL for the active location.

#### Scenario: No account or sign-in affordance exists

- **GIVEN** the shell is rendered for an anonymous visitor
- **WHEN** the top bar and content area are inspected
- **THEN** no sign-in, account, or profile control is present
- **AND** this absence is treated as intended scope, not a missing feature

#### Scenario: Shell defers domain content to owning capabilities

- **GIVEN** the shell frame is rendered
- **WHEN** domain content such as forecast, map, or search results is required
- **THEN** the shell only hosts the region and shared inline pattern for that content
- **AND** the shell does not itself fetch or compute that domain data
