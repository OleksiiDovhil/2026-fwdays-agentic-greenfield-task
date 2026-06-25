# Forecast Specification

## Purpose

This capability turns the active location into a readable weekend-planning view:
a 7-day daily outlook, a 48-hour hourly temperature trend, and today's sunrise and
sunset, all from a single keyless Open-Meteo request that asks for both the daily and
the hourly blocks. It owns the only weather-data fetch in the product, pins the units it
requests (Celsius temperatures, m/s wind) so every rendered value is reproducible and
matches the comfort-score wind input, validates the payload before rendering, caches the
last good response in memory tagged with the location it belongs to (so a stale or
out-of-order response is never shown under the wrong location), and degrades honestly to a
calm visible state when the network or the API fails — never a thrown error, never a noisy
console.

## Requirements

### Requirement: Fetch daily and hourly forecast for the active location in one request

The system SHALL fetch the forecast from the keyless Open-Meteo forecast API once a
location is active, using that location's latitude and longitude, and the **single**
request SHALL ask for both blocks every downstream view needs (FR-FORECAST-01, FR-FORECAST-03):

- a **daily** block covering high/low temperature, a weather code, precipitation
  probability, wind speed, today's sunrise and sunset times, and — so the comfort
  capability has a single defined source for every factor it scores (FR-COMFORT-02) —
  the daily **apparent (feels-like) high/low temperature**
  (`apparent_temperature_max`, `apparent_temperature_min`), the daily **maximum UV
  index** (`uv_index_max`), and a daily **mean cloud cover** (`cloud_cover_mean`),
  requested for 7 days (`forecast_days=7`); and
- an **hourly** block of temperature (`hourly=temperature_2m`) spanning at least the
  next 48 hours so the hourly chart has its data from the same request.

The daily block returned by Open-Meteo SHALL carry, per day, a `daily.time` entry that
is the day's **location-local calendar date** (a `YYYY-MM-DD` date string in the active
location's timezone). The request SHALL pin the API to the location's own timezone
(`timezone=auto`) so each `daily.time` entry is the local date for that location, NOT a
UTC date; this is the single defined source the comfort capability uses to pick the
upcoming weekend by location-local dates (FR-COMFORT-05). Downstream views — including
comfort scoring — SHALL derive a day's date and weekday from its `daily.time` entry and
SHALL NOT recompute the date from `Date.now()`, the visitor's clock, or `toISOString()`.

Units and encodings returned by the API SHALL be pinned on the request so every rendered
value is reproducible and matches the comfort-score inputs (FR-COMFORT-02): temperature
**and the apparent (feels-like) temperature** in degrees Celsius (`temperature_unit=celsius`)
and wind speed in metres per second (`windspeed_unit=ms`). Precipitation probability SHALL
be the Open-Meteo integer **percent in `0..100`**, cloud cover the Open-Meteo integer
**percent in `0..100`**, and the UV index the Open-Meteo dimensionless index (typically
`0..11+`). These are the exact encodings the comfort capability consumes (FR-COMFORT-02).
The request SHALL carry no API key and SHALL pass no credentials, in keeping with the
keyless, privacy-first product (NFR-COST-01, TC-STACK-03). The fetched response SHALL be
parsed and validated with a zod schema — covering **both** the daily and the hourly blocks —
before any value is rendered; a payload that fails schema validation SHALL be treated as a
failed fetch (see "Degrade honestly when the forecast cannot load").

#### Scenario: Active location triggers one fetch carrying daily and hourly blocks

- **GIVEN** no location was previously active
- **WHEN** a location becomes active with latitude 50.45 and longitude 30.52 (Kyiv)
- **THEN** the system makes a single request to the Open-Meteo forecast API for that latitude and longitude, with no API key or credentials
- **AND** that request asks for 7 days of daily data (hi/lo, weather code, precipitation probability, wind speed, sunrise, sunset, apparent/feels-like hi/lo, maximum UV index, and mean cloud cover)
- **AND** the same request asks for hourly `temperature_2m` covering at least the next 48 hours
- **AND** the request pins `temperature_unit=celsius`, `windspeed_unit=ms`, and `timezone=auto`
- **AND** each `daily.time` entry is a `YYYY-MM-DD` local calendar date in the location's timezone (not a UTC date)
- **AND** the response is parsed with a zod schema that validates both the daily block (including apparent temperature, UV index, and cloud cover) and the hourly temperature block before any card or chart renders

#### Scenario: Each day carries its location-local calendar date

- **GIVEN** a location whose timezone is east of UTC so its local date can differ from the UTC date near midnight
- **WHEN** the forecast for that location is fetched and validated
- **THEN** each forecast day exposes a `daily.time` entry that is the day's local calendar date (`YYYY-MM-DD`) in the location's own timezone, produced by `timezone=auto`
- **AND** downstream consumers (the daily cards and comfort scoring) read the date and weekday from that `daily.time` entry rather than recomputing it from the visitor's clock or `toISOString()`

#### Scenario: Missing or malformed hourly block is rejected like any failed fetch

- **GIVEN** a location is active
- **WHEN** the Open-Meteo response is otherwise well-formed but the hourly temperature block is absent, not an array, or contains non-numeric entries
- **THEN** zod validation fails and the response is discarded
- **AND** the system treats it as a failed fetch and shows the degraded state rather than rendering the daily cards against an unvalidated hourly block

#### Scenario: No location active yet

- **GIVEN** the app has loaded and no location has been selected
- **WHEN** the forecast view renders
- **THEN** no request is made to the Open-Meteo forecast API
- **AND** the forecast area shows its calm empty state rather than an error or a spinner that never resolves

#### Scenario: Payload that fails schema validation is rejected

- **GIVEN** a location is active
- **WHEN** the Open-Meteo response is missing required daily fields or has values of the wrong type
- **THEN** zod validation fails and the response is discarded
- **AND** the system treats it as a failed fetch and shows the degraded state instead of rendering partial or malformed data

### Requirement: Render daily forecast cards

When the validated daily forecast contains the full 7 days, the system SHALL render exactly
seven day cards, one per forecast day in chronological order, and each card SHALL show the
weekday name, the high and low temperature in degrees Celsius, a weather icon derived from
the day's weather code, the precipitation probability as a percentage, and the wind speed
(FR-FORECAST-02). Weekday names and any other UI strings SHALL be Ukrainian-first, sourced
from the centralised i18n strings (NFR-I18N-01), with a calm tone and no exclamation marks.
Temperatures SHALL display in Celsius. Where a precipitation probability for a day is absent
in the payload, the card SHALL show a neutral placeholder rather than a blank or a misleading
zero.

A schema-valid response whose daily block carries **fewer than 7 days but at least one** SHALL
render one card per available day rather than fail (mirroring the hourly chart's partial-data
rule). A schema-valid response whose daily block carries **zero days** (an empty `daily.time`
array) SHALL be treated as a failed fetch and SHALL show the degraded state, because there is
no day to render (see "Degrade honestly when the forecast cannot load"); the system SHALL NOT
render an empty grid or fabricate placeholder days.

#### Scenario: Seven cards render with all required fields

- **GIVEN** a validated daily forecast containing the full 7 days
- **WHEN** the daily forecast grid renders
- **THEN** exactly seven day cards are shown, in chronological order
- **AND** each card shows a Ukrainian weekday name, hi and lo in °C, a weather icon for that day's weather code, a precipitation probability percentage, and a wind speed

#### Scenario: Short daily array renders the days it has

- **GIVEN** a schema-valid daily forecast that contains only 4 days
- **WHEN** the daily forecast grid renders
- **THEN** exactly four day cards are shown, in chronological order, each with its required fields
- **AND** no eighth-through-fourth-missing placeholder card is fabricated and no error is shown

#### Scenario: Empty daily array degrades to the failed-fetch state

- **GIVEN** a schema-valid response whose `daily.time` array is empty (zero forecast days)
- **WHEN** the forecast view renders
- **THEN** the daily grid is not rendered and the calm degraded state is shown instead
- **AND** no empty card grid, no fabricated day, and no thrown error is produced, and the console stays clean

#### Scenario: Weekday names are Ukrainian-first

- **GIVEN** a validated daily forecast whose first day falls on a Monday
- **WHEN** the first day card renders
- **THEN** its weekday label reads in Ukrainian (for example "Пн" or "Понеділок")
- **AND** the label comes from the centralised i18n strings, not a raw API string

#### Scenario: Missing precipitation probability shows a neutral placeholder

- **GIVEN** a validated daily forecast where one day has no precipitation probability value
- **WHEN** that day's card renders
- **THEN** the precipitation field shows a neutral placeholder (for example "—")
- **AND** the card does not display a misleading "0%" and does not render blank

### Requirement: Pin numeric formatting and unit labels for forecast values

The system SHALL render forecast numbers with a fixed, reproducible display contract so a
tester can decide pass/fail on the exact text shown (FR-FORECAST-02):

- **Temperature** (daily hi/lo and chart axis/tooltips) SHALL be displayed as a whole
  number rounded to the nearest integer degree using "round half away from zero", with no
  decimal places, suffixed with the degree-Celsius unit (for example `-7°C`, never `-7.0 °C`
  and never a Kelvin value such as `266K`). Negative values SHALL use an ASCII minus or the
  app's standard minus glyph from i18n, not a missing sign.
- **Wind speed** SHALL be displayed as a number rounded to the nearest integer in metres per
  second, with the unit label resolved from the centralised i18n strings (NFR-I18N-01) — the
  app SHALL NOT hardcode the unit text in the card. Because the request pins `windspeed_unit=ms`,
  the displayed unit SHALL match the requested unit (m/s), so the value is reproducible and
  consistent with the comfort-score wind input (FR-COMFORT-02).
- **Precipitation probability** SHALL be displayed as an integer percent in `0..100` with a
  `%` suffix; a present value of `0` SHALL render `0%`, distinct from the missing-value
  placeholder.

The display SHALL stay calm and unbroken for extreme or oversized inputs: a value far outside
ordinary ranges (for example a temperature of `-60°C` or `+60°C`, or a wind speed in the
hundreds) SHALL be rounded and shown by the same rule without overflowing the card, throwing,
or emitting a console warning. All unit labels SHALL come from the centralised i18n strings
(Ukrainian-first), not raw API strings.

#### Scenario: Temperature rounds to whole degrees Celsius

- **GIVEN** a validated forecast where a day's high is `-7.4°C` and its low is `-6.6°C`
- **WHEN** the day card renders the temperatures
- **THEN** the high reads `-7°C` and the low reads `-7°C` (rounded to the nearest integer, no decimals)
- **AND** the unit shown is `°C`, not Kelvin or Fahrenheit, and the negative sign is present

#### Scenario: Wind speed shows an integer in m/s with an i18n unit label

- **GIVEN** a validated forecast where a day's wind speed is `3.6` m/s
- **WHEN** the day card renders the wind speed
- **THEN** the value reads `4` (rounded to the nearest integer)
- **AND** the unit label is the m/s label resolved from the centralised i18n strings, matching the requested `windspeed_unit=ms`

#### Scenario: Precipitation 0% is distinct from a missing value

- **GIVEN** one day whose precipitation probability is exactly `0` and another day whose value is absent
- **WHEN** both cards render
- **THEN** the `0` day shows `0%` and the absent day shows the neutral placeholder (for example "—")

#### Scenario: Extreme or oversized values render calmly without overflow

- **GIVEN** a validated forecast carrying an extreme reading (for example a high of `-58.7°C` and a wind speed of `212.4` m/s)
- **WHEN** the day card renders
- **THEN** the temperature reads `-59°C` and the wind reads `212` (m/s), rounded by the same rule
- **AND** the values stay within the card layout, nothing is thrown, and the console shows no warning or error

### Requirement: Render a 48-hour hourly temperature line chart

The system SHALL render an hourly temperature line chart covering the next 48 hours from
the validated `hourly.temperature_2m` block returned by the single forecast fetch (the same
request described in "Fetch daily and hourly forecast for the active location in one request"),
built with Recharts (FR-FORECAST-03). The chart SHALL plot temperature in degrees Celsius
against time — temperatures shown on the axis and in tooltips SHALL follow the integer-degree
formatting rule in "Pin numeric formatting and unit labels for forecast values" — SHALL be
readable on the smallest supported viewport, and SHALL expose an accessible name so the trend
is not presented as an unlabeled image. When fewer than 48 hourly points are available, the
chart SHALL plot the hours it has rather than fail.

#### Scenario: Chart plots the next 48 hours

- **GIVEN** a validated hourly forecast with at least 48 hourly temperature points from now
- **WHEN** the hourly temperature chart renders
- **THEN** a Recharts line chart shows temperature in °C across the next 48 hours
- **AND** the chart has an accessible name describing it as the hourly temperature trend

#### Scenario: Fewer than 48 hourly points still renders

- **GIVEN** a validated hourly forecast that contains only 30 hourly points ahead of now
- **WHEN** the hourly temperature chart renders
- **THEN** the chart plots the 30 available points without throwing
- **AND** no console warning or error is produced

### Requirement: Show today's sunrise and sunset under the hourly chart

The system SHALL show today's sunrise and sunset times for the active location as small
text positioned under the hourly temperature chart (FR-FORECAST-04). The times SHALL be
taken from the validated daily forecast for today and SHALL be formatted for the
Ukrainian-first UI. When today's sunrise or sunset is unavailable in the payload (for
example at extreme latitudes where the value is null), the system SHALL omit or label the
missing value calmly rather than render an error.

#### Scenario: Sunrise and sunset render beneath the chart

- **GIVEN** a validated daily forecast that includes today's sunrise and sunset
- **WHEN** the forecast view renders
- **THEN** small text under the hourly chart shows today's sunrise and sunset times
- **AND** the times are formatted for the Ukrainian-first UI

#### Scenario: Missing sunrise or sunset degrades calmly

- **GIVEN** a validated daily forecast where today's sunrise is null
- **WHEN** the sunrise/sunset text renders
- **THEN** the missing value is omitted or labeled calmly (for example "—")
- **AND** no error is shown and the console stays clean

### Requirement: Re-fetch on location change and cache last successful response in memory

The system SHALL re-fetch the forecast whenever the active location changes, and SHALL
keep the last successful, schema-valid response cached in memory until the next location
switch (FR-FORECAST-05). The cache SHALL be in-memory only — no cookies, no localStorage,
no server-side persistence — consistent with the stateless, no-database product.

The cached response and every in-flight request SHALL be **tagged with the location they
belong to** (its latitude/longitude, or an equivalent location identity), so the view never
attributes one location's data to another:

- A validated response SHALL be rendered and cached **only if** its location identity still
  equals the currently active location at the moment it resolves. A response that resolves
  for a location that is **no longer active** (because the user has since switched away) SHALL
  be **discarded** — not cached and not rendered — which prevents an out-of-order/late response
  from a quick A→B→A switch from showing the wrong location's data.
- While a re-fetch for a newly selected location is in flight, the system MAY show a calm
  loading state; it SHALL NOT present any previously cached forecast as belonging to the new
  location. Specifically, once the active location has changed away from A, A's cached forecast
  SHALL NOT be shown under location B at any time.
- When a validated response for the active location arrives, any previously cached response for
  a prior location SHALL be superseded by it.

#### Scenario: Changing location triggers a re-fetch

- **GIVEN** a forecast for location A (Kyiv) is currently shown
- **WHEN** the active location changes to location B (Lviv)
- **THEN** the system fetches the forecast for location B
- **AND** once location B's response validates, the view shows location B's forecast, not location A's

#### Scenario: Successful response is cached in memory until the next switch

- **GIVEN** a forecast for location A was fetched successfully and validated
- **WHEN** the forecast view re-renders without the active location changing
- **THEN** the system serves the cached in-memory response for location A without issuing a new network request
- **AND** the cache is not written to cookies, localStorage, or any server-side store

#### Scenario: New successful response supersedes the prior cache

- **GIVEN** location A's forecast is cached in memory
- **WHEN** the active location changes to location B and location B's response validates successfully
- **THEN** the cached response is now location B's forecast
- **AND** location A's cached response is no longer served

#### Scenario: Late out-of-order response for a no-longer-active location is discarded

- **GIVEN** the user switches A → B → A quickly, and location B's slower request resolves **after** location A is active again
- **WHEN** location B's validated response arrives while A is the active location
- **THEN** location B's response is discarded: it is neither cached nor rendered
- **AND** the view continues to show (or finish loading) location A's forecast, never location B's data under A

#### Scenario: Switching to B then B's fetch fails while A is still cached

- **GIVEN** location A's forecast is cached in memory and the active location changes to location B
- **WHEN** location B's re-fetch fails (network error, non-OK status, or zod validation failure)
- **THEN** the forecast area shows the calm degraded state for location B
- **AND** location A's cached forecast is NOT shown under location B (no cross-location stale data), and the console stays clean

### Requirement: Degrade honestly when the forecast cannot load

The system SHALL degrade honestly when the Open-Meteo forecast request fails — whether
from a network error, a non-OK HTTP status, or a payload that fails zod validation — by
showing a calm, visible degraded state in the forecast area instead of throwing an
uncaught error, crashing the view, or rendering a blank panel (NFR-OBS-01). On a healthy
session and on a degraded session alike, the system SHALL keep the browser console silent:
no warnings and no errors at runtime (NFR-OBS-01). If a previously successful response is
still cached in memory for the current active location, the system MAY continue showing
that cached forecast rather than the degraded state.

#### Scenario: Network failure shows a calm degraded state

- **GIVEN** a location is active and no forecast is cached for it
- **WHEN** the Open-Meteo forecast request fails with a network error
- **THEN** the forecast area shows a calm, visible degraded message in Ukrainian (no exclamation marks)
- **AND** no uncaught error is thrown and the rest of the page stays interactive

#### Scenario: Non-OK HTTP status is handled

- **GIVEN** a location is active
- **WHEN** the Open-Meteo forecast API responds with HTTP 500
- **THEN** the system shows the calm degraded state and does not attempt to render the body as a forecast
- **AND** the browser console shows no warning and no error

#### Scenario: Console stays silent on a healthy session

- **GIVEN** a location is active and the forecast loads and validates successfully
- **WHEN** the forecast view renders and the user reads the cards, chart, and sunrise/sunset
- **THEN** the browser console shows no warnings and no errors

#### Scenario: Cached forecast covers a transient failure

- **GIVEN** location A's forecast was previously fetched and is cached in memory
- **WHEN** a subsequent re-render or transient re-fetch for location A fails
- **THEN** the system MAY keep showing location A's cached forecast
- **AND** the user is not shown a blank panel or a raised error

### Requirement: Out-of-scope exclusions for the forecast capability

The forecast capability SHALL be limited to a 7-day daily outlook, a 48-hour hourly
temperature chart, and today's sunrise and sunset for a single active location. The
following are intentionally unsupported in the MVP and SHALL NOT be reported as defects:
forecast windows beyond 7 days; climate or historical weather analysis; marine, aviation,
or agriculture weather variables; background, scheduled, or push-driven forecast refresh
(refresh happens only on location change); persistence of forecasts to disk, cookies,
localStorage, or any server-side database; and per-day comfort scoring or weekend
highlighting, which are owned by the `comfort-score` capability rather than `forecast`.

#### Scenario: Beyond-7-day request is out of scope

- **GIVEN** a tester wants a 14-day outlook
- **WHEN** they inspect the forecast view
- **THEN** only 7 daily cards are present by design
- **AND** the absence of an 8th-day-and-beyond card is not a defect

#### Scenario: Comfort scoring is not owned here

- **GIVEN** a tester looks for the colored comfort badge or the weekend comfort highlight
- **WHEN** they review the forecast capability spec
- **THEN** comfort scoring and weekend highlighting are documented as owned by the `comfort-score` capability
- **AND** their absence from this capability is not a defect

#### Scenario: No background refresh is by design

- **GIVEN** a location has been active and unchanged for several minutes
- **WHEN** the tester waits for an automatic forecast refresh
- **THEN** no background or scheduled re-fetch occurs
- **AND** the forecast refreshing only on location change is not a defect
