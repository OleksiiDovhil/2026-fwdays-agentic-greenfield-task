# Animated Background Specification

## Purpose

The animated background paints a calm, full-bleed visual layer behind the app
that reflects today's weather and sky for the active location: a day or night
gradient with optional rain, snow, or cloud-drift motion. It is purely
decorative and ambient — it conveys mood, never data the user must read, and it
must never interfere with reading, focusing, or clicking the UI in front of it.
Day-vs-night is decided by the active location's own sunrise and sunset, so the
sky on screen matches the sky at the place being explored rather than the
visitor's local clock.

This layer fetches no weather data of its own. It is a pure consumer of the
already-fetched, schema-validated daily forecast owned by the `forecast`
capability (FR-FORECAST-01), which owns the only weather-data fetch in the
product. Specifically it reads, for the active location, **today's daily weather
code** and **today's sunrise and sunset** from that single validated daily
payload (FR-FORECAST-01, FR-FORECAST-04). There is no `current_weather`,
`is_day`, or hourly-condition input and no second weather fetch — "today's"
everywhere below means the daily-aggregate value for the current calendar day at
the active location, not a real-time observation.

## Data dependency and inputs

The animated background SHALL derive its appearance solely from inputs the
`forecast` capability already produces for the active location; it SHALL NOT
issue any weather request of its own:

- **Today's daily weather code** — the weather code for the current forecast day,
  taken from the validated daily forecast (FR-FORECAST-01). This is the same
  per-day weather code the forecast cards render (FR-FORECAST-02); the background
  reuses today's value and maps it to one effect family (rain, snow, clouds) or
  to no effect.
- **Today's sunrise and sunset** for the active location — taken from the same
  validated daily forecast (FR-FORECAST-04). These are the location's **local**
  sun times: Open-Meteo returns them already expressed in the active location's
  own time zone, so the offset needed to place "now" against them is the offset
  carried by those very timestamps. The day/night decision is therefore made
  entirely in the active location's local time frame (see the day/night
  requirement), and no separate timezone lookup or visitor-clock conversion is
  performed.

If the validated daily forecast is not available for the active location —
because the upstream fetch failed, the payload failed validation, or no location
is active yet — the background SHALL NOT have a weather code or sun times to read
and SHALL fall back deterministically as defined below (a day-or-night gradient
with no effect), never throwing and never logging.

## Requirements

### Requirement: Condition-driven background layer

The system SHALL render a background layer behind the app whose appearance
reflects today's weather condition for the active location (FR-ANIM-01): a
day-or-night base gradient plus, when motion is permitted and the condition maps
to one, exactly one animated weather effect — rain particles, snow particles, or
drifting clouds — selected from **today's daily Open-Meteo weather code** for the
active location, read from the validated daily forecast owned by the `forecast`
capability (FR-FORECAST-01). When the visitor has not requested reduced motion
and today's weather code maps to a known effect family, that effect SHALL render
over the base gradient (it is required, not optional, in that case). The layer
SHALL update whenever the active location changes or its validated daily forecast
(and thus today's weather code) changes, and it SHALL degrade to the plain base
gradient with no effect for any weather code that is clear, unrecognised, or
absent, so an unknown or missing weather code never produces a blank or broken
render.

#### Scenario: Rain code shows rain particles

- **GIVEN** an active location whose today's daily weather code maps to rain
- **AND** the visitor has not requested reduced motion
- **WHEN** the background layer renders
- **THEN** the day-or-night base gradient is shown
- **AND** animated rain particles drift over the gradient

#### Scenario: Snow code shows snow particles

- **GIVEN** an active location whose today's daily weather code maps to snow
- **AND** the visitor has not requested reduced motion
- **WHEN** the background layer renders
- **THEN** the day-or-night base gradient is shown
- **AND** animated snow particles drift over the gradient

#### Scenario: Cloudy code shows drifting clouds

- **GIVEN** an active location whose today's daily weather code maps to clouds
- **AND** the visitor has not requested reduced motion
- **WHEN** the background layer renders
- **THEN** the day-or-night base gradient is shown
- **AND** slow cloud-drift motion is shown over the gradient

#### Scenario: Clear code shows gradient only

- **GIVEN** an active location whose today's daily weather code maps to clear sky
- **WHEN** the background layer renders
- **THEN** only the day-or-night base gradient is shown
- **AND** no rain, snow, or cloud effect is rendered

#### Scenario: Condition updates when active location changes

- **GIVEN** the background is showing the effect for the previous location
- **WHEN** the visitor selects a new active location whose validated daily
  forecast carries a different today's weather code
- **THEN** the background switches to the new location's gradient and effect
- **AND** no effect from the previous location remains on screen

#### Scenario: Unknown or missing weather code degrades to gradient

- **GIVEN** an active location whose today's daily weather code is unrecognised or
  absent from the validated daily forecast
- **WHEN** the background layer renders
- **THEN** the day-or-night base gradient is shown with no animated effect
- **AND** no error is surfaced and the console stays silent

#### Scenario: Failed or invalid upstream forecast fetch still renders a gradient

- **GIVEN** an active location for which the `forecast` capability's upstream
  Open-Meteo request has failed entirely (network error or non-OK status) or
  returned a payload that failed validation, so no validated daily forecast — and
  thus no today's weather code — is available to the background
- **WHEN** the background layer renders
- **THEN** the background still renders a deterministic day-or-night base gradient
  with no animated effect
- **AND** no error is thrown and the console stays silent (no warning, no error)

### Requirement: Day/night driven by active location's sun times

The system SHALL choose between the day gradient and the night gradient using
today's sunrise and sunset for the ACTIVE LOCATION, not the visitor's own clock
or timezone (FR-ANIM-02). The sunrise and sunset values SHALL be read from the
validated daily forecast owned by the `forecast` capability (FR-FORECAST-04) and
are the active location's **local** times: Open-Meteo returns today's sunrise and
sunset already expressed in the active location's own time zone, so they carry
the location's offset and no separate timezone lookup is needed. The day/night
decision SHALL be made entirely in that local frame — the current instant is
converted to the active location's local time using the same offset that those
sunrise/sunset timestamps carry, and is then compared against them. When the
active location's current local time falls at or after today's sunrise and
before today's sunset, the day gradient SHALL be used; otherwise the night
gradient SHALL be used. If today's sunrise/sunset for the active location are
unavailable — because the value is null in the payload (e.g. polar day/night), a
sun field is missing, or no validated daily forecast exists for the active
location at all — the system SHALL fall back to a deterministic day gradient
rather than failing to render.

#### Scenario: Daytime at the active location uses the day gradient

- **GIVEN** an active location whose current local time is at or after today's
  sunrise and before today's sunset, both read from the validated daily forecast
  as the location's local times
- **WHEN** the background layer renders
- **THEN** the day base gradient is used

#### Scenario: Nighttime at the active location uses the night gradient

- **GIVEN** an active location whose current local time is before today's sunrise
  or at/after today's sunset, both read from the validated daily forecast as the
  location's local times
- **WHEN** the background layer renders
- **THEN** the night base gradient is used

#### Scenario: Visitor's local clock does not override the location's sun times

- **GIVEN** the visitor's own device clock currently reads a nighttime hour
- **AND** the active location's sunrise and sunset for today (from the validated
  daily forecast, in the location's local time) place the current instant —
  evaluated in the location's local frame using those timestamps' offset —
  between sunrise and sunset
- **WHEN** the background layer renders
- **THEN** the day base gradient is used
- **AND** the decision uses only the active location's local sun times; the
  visitor's own timezone and device clock are not consulted

#### Scenario: Missing sun times fall back to the day gradient

- **GIVEN** an active location whose today's sunrise or sunset is null or missing
  in the validated daily forecast, or for which no validated daily forecast is
  available at all
- **WHEN** the background layer renders
- **THEN** the day base gradient is used as a deterministic fallback
- **AND** no error is surfaced and the console stays silent

### Requirement: Respect prefers-reduced-motion

The system SHALL honour the `prefers-reduced-motion: reduce` user setting: when
it is active, the background SHALL render a static base gradient only, with no
rain, snow, cloud-drift, or any other animation (FR-ANIM-03). The day-vs-night
gradient selection from the active location's sun times SHALL still apply. When
the visitor has NOT requested reduced motion and today's weather code maps to a
known effect family, that mapped effect (rain, snow, or cloud drift) SHALL render
over the base gradient — animation is required in that case, not optional — as
defined by the condition-driven requirement.

#### Scenario: Reduced motion renders a static gradient only

- **GIVEN** the visitor's system requests reduced motion
- **AND** the active location's today's weather code maps to rain
- **WHEN** the background layer renders
- **THEN** only the static day-or-night base gradient is shown
- **AND** no rain, snow, or cloud animation is rendered

#### Scenario: Reduced motion still respects day vs night

- **GIVEN** the visitor's system requests reduced motion
- **AND** the active location's current local time is nighttime by today's
  sunrise/sunset
- **WHEN** the background layer renders
- **THEN** the static night base gradient is shown

#### Scenario: No reduced-motion preference renders the mapped effect

- **GIVEN** the visitor's system does not request reduced motion
- **AND** the active location's today's weather code maps to snow
- **WHEN** the background layer renders
- **THEN** the static base gradient plus animated snow particles are shown
- **AND** the snow effect is rendered, not suppressed to a gradient-only state

### Requirement: Background never blocks interaction

The background layer SHALL never intercept pointer or keyboard interaction with
the UI in front of it (FR-ANIM-04). It SHALL be rendered with pointer events
disabled and positioned behind interactive content so that clicks, taps,
hovers, scrolls, and focus all reach the controls above it. The background
SHALL contain no focusable elements and SHALL be exposed to assistive
technology as decorative (NFR-A11Y-01), so it neither receives keyboard focus
nor adds noise to the accessibility tree.

#### Scenario: Clicks pass through the background to the UI

- **GIVEN** the animated background is rendered behind the app content
- **WHEN** the visitor clicks a control that visually overlaps the background
- **THEN** the click reaches the control beneath the pointer
- **AND** the background does not consume the event

#### Scenario: Background is not keyboard-focusable

- **GIVEN** the animated background is rendered
- **WHEN** the visitor tabs through the page's interactive elements
- **THEN** focus moves only between real interactive controls
- **AND** the background layer never receives focus

#### Scenario: Background is decorative for assistive technology

- **GIVEN** the animated background is rendered
- **WHEN** a screen reader traverses the page
- **THEN** the background is treated as decorative and announced as no content

## Exclusions

The following are intentionally out of scope for this capability so that testers
do not file them as defects:

- The background conveys NO readable data: temperature, precipitation chance,
  wind, comfort score, and forecast detail belong to the `forecast` and
  `comfort-score` capabilities, not here.
- **Locale and oversized-value handling are not applicable to this layer.** The
  background renders no user-facing strings and displays no numeric or text
  value the user reads, so there is nothing to localise, truncate, or guard
  against locale-formatted or oversized input here. Formatting and bounding of
  readable weather values (temperatures, percentages, sunrise/sunset text) live
  in the `forecast` and `comfort-score` capabilities. This omission is
  deliberate, not an oversight.
- No interactive or clickable background elements; the layer is purely
  decorative (FR-ANIM-04).
- No weather fetch of its own: the background never calls Open-Meteo and never
  triggers a second request. It is a pure consumer of the `forecast`
  capability's single validated daily payload (FR-FORECAST-01); there is no
  `current_weather`, `is_day`, or hourly-condition input.
- No per-frame weather realism, physics simulation, lightning, fog density
  modelling, or audio — only the three calm effect families (rain, snow,
  cloud drift) plus the base gradient.
- No user-facing controls to toggle, theme, or customise the background;
  behaviour is driven solely by today's daily weather code for the active
  location, its today sunrise/sunset, and the `prefers-reduced-motion` system
  setting.
- Twilight, golden-hour, or multi-stage sky transitions are not modelled — the
  base gradient is a binary day-or-night choice (FR-ANIM-02).
- Marine, aviation, and agriculture conditions are out of scope app-wide and
  are never reflected in the background.
