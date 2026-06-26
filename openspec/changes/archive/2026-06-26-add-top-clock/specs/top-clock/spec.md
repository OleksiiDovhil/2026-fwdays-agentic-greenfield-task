## ADDED Requirements

<!--
This delta restates the baseline `openspec/specs/top-clock/spec.md` contract
(adopted at G2) verbatim as ADDED requirements, for the record and so
`openspec validate add-top-clock --strict` can validate the change against a
delta. Archive runs with `--skip-specs` because the baseline spec already holds
this content (the requirements are not re-applied via Option B). Keep this file
in sync with the baseline if the baseline changes.
-->

### Requirement: Live local-time display

The header SHALL render a compact clock that shows the visitor's device-local
time and updates live at least once per second while the page is open, per
FR-CLOCK-01. The clock SHALL reflect the visitor's own system clock and time
zone, not the active weather location and not a server clock.

The rendered format is pinned and SHALL NOT vary by visitor locale: the clock
SHALL display 24-hour time as `HH:MM:SS` (two zero-padded digits for hours,
minutes, and seconds) using a literal `:` separator and ASCII (Western Arabic)
digits 0-9. There SHALL be no AM/PM marker, no locale-specific separators, and
no locale digit shaping. This canonical `HH:MM:SS` format is the single width
contract that the width and pre-hydration-footprint scenarios below are sized
against.

The "updates live" guarantee of FR-CLOCK-01 covers interruption and clock
changes, not only steady-state ticking: when the tab returns to the foreground
after being backgrounded or timer-throttled, and when the device system clock
or time zone changes (including a DST transition) while the page stays open, the
clock SHALL resync to read the current device-local time on its next update
rather than continue displaying a drifted, paused, or stale value.

#### Scenario: Clock shows current local time on first paint

- **GIVEN** a visitor opens the homepage on a device whose local time is 14:05:30
- **WHEN** the header finishes mounting on the client
- **THEN** the clock displays `14:05:30` in the canonical 24-hour `HH:MM:SS` format
- **AND** the displayed value matches the device system clock, not a server time
- **AND** the rendering is unchanged regardless of the visitor's browser locale (no AM/PM, no locale separators, no localized digits)

#### Scenario: Clock advances live while the page stays open

- **GIVEN** the clock is mounted and showing 14:05:30
- **WHEN** one second of wall-clock time elapses with the page open
- **THEN** the displayed time advances to 14:05:31 without a manual refresh
- **AND** the update happens at least once per second

#### Scenario: Clock reflects the visitor device, not the weather location

- **GIVEN** the active weather location is a city in a different time zone
- **WHEN** the visitor reads the header clock
- **THEN** the clock shows the visitor's own device-local time
- **AND** the clock value is unaffected by selecting a different weather location

#### Scenario: Clock resyncs after the tab was backgrounded or throttled

- **GIVEN** the clock is mounted and the tab is backgrounded, so the browser pauses or throttles the per-second timer and the displayed time drifts behind the real device clock
- **WHEN** the visitor brings the tab back to the foreground
- **THEN** the clock resyncs to the current device-local time within one update interval (no longer than one second)
- **AND** it does not keep showing the drifted or paused value, and it does not need a manual page refresh

#### Scenario: Clock resyncs after a system clock or time-zone change

- **GIVEN** the clock is mounted and showing the current local time
- **WHEN** the device system clock is changed or the device time zone changes while the page stays open (for example a DST transition or the user setting a new time zone)
- **THEN** the clock's next update reflects the new current device-local time in the canonical `HH:MM:SS` format
- **AND** the displayed value matches the updated device clock, not the pre-change time

### Requirement: Accessible name and screen-reader behavior

The clock SHALL expose an accessible name so assistive technology announces it
as a clock or local time rather than as bare unlabeled digits, satisfying the
accessible-name obligation of NFR-A11Y-01. Per-second visual ticking SHALL NOT
spam screen-reader announcements.

#### Scenario: Screen reader announces an accessible name

- **GIVEN** a visitor using a screen reader focuses or reaches the header clock
- **WHEN** the assistive technology reads the element
- **THEN** it announces a meaningful accessible name (for example "Поточний місцевий час" / current local time)
- **AND** the announced name is in Ukrainian to match the Ukrainian-first UI

#### Scenario: Per-second ticking does not flood announcements

- **GIVEN** a screen-reader user is on the page with the clock ticking
- **WHEN** the displayed seconds change every second
- **THEN** the changes are not announced as live-region updates every second
- **AND** the user is not interrupted by repeated time announcements

### Requirement: No layout shift while ticking

The clock SHALL occupy a stable footprint so that changing digits do not move,
resize, or reflow the header or surrounding content. Because a live-updating
header widget is a recurring Cumulative Layout Shift (CLS) source, this is a
derived Core Web Vitals constraint supporting the Lighthouse Performance bar
(NFR-PERF-02) rather than an accessibility obligation; its zero-CLS contribution
SHALL hold. Separately, visible focus styling SHALL be preserved for any
interactive affordance the clock exposes, per the visible-focus obligation of
NFR-A11Y-01.

#### Scenario: Header does not reflow as digits change

- **GIVEN** the clock is rendered in the header with the time 11:09:08
- **WHEN** the time advances through values with different glyph widths (for example 11:10:11 to 12:22:22)
- **THEN** the header layout and adjacent elements do not move or resize
- **AND** the measured cumulative layout shift contribution from the clock is zero

#### Scenario: Stable width across single- and double-digit values

- **GIVEN** the clock transitions from 09:09:09 to 10:10:10 in the canonical `HH:MM:SS` format
- **WHEN** the per-glyph widths differ between the two values
- **THEN** the clock container keeps the same width (for example via tabular numerals or a fixed-width slot sized to the eight-character `HH:MM:SS` string)
- **AND** no horizontal jump is visible in the header

### Requirement: Client-only resilient rendering

The clock SHALL be a client-only widget that renders without hydration
mismatch and without runtime console errors or warnings on a healthy session.
Because the server has no access to the visitor's local clock, the
pre-hydration markup SHALL reserve the clock's footprint rather than render a
server time that would differ from the client.

#### Scenario: No hydration mismatch between server and client

- **GIVEN** the page is server-rendered and then hydrated on the client
- **WHEN** the clock mounts and begins ticking
- **THEN** there is no React hydration mismatch warning for the clock
- **AND** the runtime console stays silent (no warnings, no errors)

#### Scenario: Pre-hydration footprint is reserved

- **GIVEN** the server cannot read the visitor's local time
- **WHEN** the header HTML is sent before client hydration
- **THEN** the clock slot reserves its final footprint, sized to the canonical eight-character `HH:MM:SS` string (placeholder or empty fixed-width slot)
- **AND** when the client time appears, it fills the reserved slot without shifting the header

#### Scenario: Timer is cleaned up on unmount

- **GIVEN** the clock has mounted and started its per-second timer
- **WHEN** the clock component unmounts (for example on client navigation away)
- **THEN** the interval or animation timer is cleared
- **AND** no further timer callbacks run and no console warning about updating an unmounted component appears
