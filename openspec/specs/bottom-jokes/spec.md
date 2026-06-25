# Bottom Jokes Specification

## Purpose

The footer area shows a single deterministic, Ukrainian, weather-themed joke
drawn from an in-repo corpus. The feature exists to give the page a calm,
human touch without any external API, network call, cookie, or tracking
(FR-JOKES-01, BC-PRIVACY-01, BC-PRIVACY-03). Selection is deterministic — the
same caller-supplied integer key always yields the same joke — so the
behaviour is demonstrable and unit-testable rather than random or
network-driven. The footer derives that key from the visitor's local calendar
date as a days-since-epoch count, which makes the choice advance by exactly one
position per local calendar day; the pure selector itself is agnostic to how
the key was produced. All copy is Ukrainian-first with an English fallback and
a calm tone with no exclamation marks (NFR-I18N-01, BC-BRAND-01). "Weather-
themed" is a content-authoring quality of the corpus text, not a property the
unit tests assert (see Exclusions).

## Requirements

### Requirement: Deterministic in-repo joke selection

The system SHALL render exactly one joke in the footer, chosen
deterministically from an in-repo corpus by a pure selection function
`pickJoke(corpus, key)` keyed on a caller-supplied non-negative integer, with
no external API call, no network request, and no tracking (FR-JOKES-01). The
selector is total: it returns a defined value for every input, including an
empty corpus. The footer supplies the key as the visitor's local date expressed
as a days-since-epoch integer; the selector does not know or assume that
origin. "Weather-themed" describes the curated corpus copy and is not asserted
by the selector or its unit tests (see Exclusions).

#### Scenario: Same key yields the same joke

- **GIVEN** an in-repo joke corpus with N entries (N greater than 0)
- **AND** a pure selector `pickJoke(corpus, key)` that returns one entry
- **WHEN** the selector is called twice with the same `key`
- **THEN** it returns the identical joke both times
- **AND** no network request is made during selection

#### Scenario: Key is normalised into corpus range

- **GIVEN** a corpus of N entries (N greater than 0) indexed 0..N-1
- **AND** a non-negative integer `key`
- **WHEN** `pickJoke(corpus, key)` is called
- **THEN** the returned joke is `corpus[key mod N]`
- **AND** the index used is always within 0..N-1 regardless of how large `key` is

#### Scenario: Empty corpus returns undefined from the selector

- **GIVEN** an empty corpus `[]` (N equals 0), for which `key mod N` is undefined
- **WHEN** `pickJoke([], key)` is called with any non-negative integer `key`
- **THEN** the selector returns `undefined` and does not throw
- **AND** it performs no array indexing and no division by N
- **AND** the footer treats `undefined` as "no joke" and omits the joke line (see the empty-corpus footer scenario)

#### Scenario: Daily rotation by date-derived key

- **GIVEN** the footer derives `key` from the visitor's local calendar date as a days-since-epoch integer (an integer that increases by exactly 1 each local calendar day)
- **AND** the corpus has N entries (N greater than 0)
- **WHEN** the page is rendered twice on the same local calendar day
- **THEN** the same joke is shown both times because `key` is unchanged
- **AND** WHEN the page is rendered on the next local calendar day
- **THEN** `key` increases by 1, so the selected index `key mod N` advances by exactly one position (wrapping from N-1 back to 0)
- **AND** this exactly-one-step-per-day cadence is guaranteed only for this days-since-epoch key; the selector itself makes no per-day promise for arbitrary keys

#### Scenario: No external API or tracking on the joke path

- **GIVEN** the footer joke feature is active
- **WHEN** a joke is selected and displayed
- **THEN** no `fetch`, XHR, geocoding, or weather-provider call is issued for the joke
- **AND** no cookie is set and no analytics or fingerprinting event is emitted (BC-PRIVACY-01, BC-PRIVACY-03)

### Requirement: Ukrainian-first joke copy with calm tone

The system SHALL source all joke strings from the centralised i18n module
(`lib/i18n/uk.ts` with an `en.ts` fallback, no runtime i18n library), present
the Ukrainian text by default, and ensure every joke is calm in tone and
contains no exclamation marks (NFR-I18N-01, BC-BRAND-01).

#### Scenario: Joke text comes from centralised i18n, Ukrainian default

- **GIVEN** the joke corpus is defined under `lib/i18n/`
- **WHEN** the footer renders with the default Ukrainian locale
- **THEN** the displayed joke is the Ukrainian string for the selected index
- **AND** no joke string is hard-coded inside a component

#### Scenario: English fallback when an entry is missing

- **GIVEN** the selected index resolves to a Ukrainian entry that is missing or empty
- **AND** an English fallback exists for that index in `en.ts`
- **WHEN** the footer renders that index
- **THEN** the English fallback joke is shown instead of an empty footer

#### Scenario: Calm tone enforced — no exclamation marks

- **GIVEN** the full joke corpus (Ukrainian and English)
- **WHEN** every entry is inspected (for example by a unit test over the corpus)
- **THEN** no entry contains an exclamation mark `!`
- **AND** every entry is non-empty after trimming whitespace

### Requirement: Empty or malformed corpus degrades gracefully

The system SHALL never throw, render a raw error, or show a blank footer slot
when the joke corpus is empty or an entry is malformed; it SHALL omit the joke
line cleanly instead (NFR-OBS-01).

#### Scenario: Empty corpus omits the joke line

- **GIVEN** the joke corpus has zero usable entries
- **WHEN** the footer renders
- **THEN** the joke slot is omitted without an error
- **AND** the rest of the footer (credits and links) renders normally
- **AND** the runtime console emits no warning or error (NFR-OBS-01)

#### Scenario: Malformed entry does not crash the selector

- **GIVEN** the selected index resolves to a non-string or empty value with no fallback
- **WHEN** the footer attempts to render that joke
- **THEN** the joke slot is omitted gracefully rather than throwing
- **AND** no raw 500 or uncaught exception surfaces

## Exclusions

The following are intentionally out of scope for the MVP and SHALL NOT be
reported as defects:

- **No randomness or network-driven selection.** Joke choice is deterministic
  by the date-derived days-since-epoch key; there is no random shuffle, no
  "next joke" button, and no remote joke source. The pure selector accepts any
  non-negative integer key, but the only key the app supplies is the local
  date, so per-day rotation is the only cadence shipped.
- **"Weather-themed" is a content-authoring quality, not a unit assertion.**
  The corpus is curated to be weather-themed, but no test mechanically verifies
  theming (no keyword list, no NLP check). Unit tests over the corpus assert
  only calm tone (no `!`) and non-emptiness; an entry that is on-tone but
  off-theme is a content-review concern, not a test failure or a defect.
- **No external joke API.** The corpus lives entirely in the repository; there
  is no third-party humor service, no network fetch, and no API key.
- **No per-visitor personalisation or persistence.** Jokes are not tailored to
  the user, are not stored, and set no cookie or local-storage entry.
- **No weather-condition coupling.** The shown joke is selected by date/index
  only; it is not chosen to match the current forecast, temperature, or sky
  condition.
- **No localisation beyond Ukrainian and English.** Only `uk` (default) and an
  `en` fallback are supported (per "Out of scope (MVP)" in docs/requirements.md).
- **No user-submitted jokes or moderation flow.** The corpus is curated in-repo
  and changes only via code, not at runtime.
