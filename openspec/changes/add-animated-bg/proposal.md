## Why

`add-animated-bg` is the **Wave 4** slice (capability plan §4.8, §6) on the
**critical path** (`app-shell → city-search → forecast → animated-bg →
weekend-compare`), on top of the archived `add-app-shell` foundation and the
implemented-and-validated `add-forecast`. It owns FR-ANIM-01..04 and turns the
sky behind the app into a calm, ambient reflection of the weather at the place
being explored — a day-or-night gradient with optional rain, snow, or
cloud-drift motion — without ever getting in the way of reading or clicking the
UI in front of it.

It is a **pure consumer** of two LOCKED upstreams and writes no new cross-cutting
machinery: the **active location** (`useLocation()` from the LocationProvider) and
the **forecast** capability's already-fetched, schema-validated daily payload — it
issues **no weather request of its own** (spec "Data dependency and inputs";
TC-DATA-01 keeps the only weather fetch in `forecast`, NFR-COST-01). Specifically it
needs, for the active location, **today's daily weather category** (from the locked
`lib/forecast/weather-code.ts` `category` contract — `clear | cloudy | fog | drizzle
| rain | snow | thunder`) and **today's sunrise / sunset** (to decide day vs night by
the LOCATION's own local times, FR-ANIM-02 — never the visitor's clock).

The forecast slice **already fetches exactly these values** for the active location
(`ForecastSection` → `/api/forecast` → `days[0].weatherCode` + `days[0].sunrise` /
`days[0].sunset`). To avoid a DUPLICATE Open-Meteo fetch, this slice introduces a
small shared **`WeatherContext`** (a `"use client"` provider): `ForecastSection`
**publishes** `{ todayCategory, sunrise, sunset, isLoaded }` into it when its forecast
loads (a minimal additive edit to `ForecastSection` — its existing tests stay green),
and `WeatherBackground` **consumes** it via a `useWeather()` hook. This is a
deliberate cross-slice integration (animated-bg additively touches the forecast
component) and it is **flagged as ADR-worthy** in `design.md` (D1), with the
documented alternative — `WeatherBackground` fetching `/api/forecast` itself, a
documented duplicate request — and the recommendation to use the shared context.

The bar is high on the qualities the spec pins. The background is **honest under
failure** (NFR-OBS-01): when no forecast / no location is available yet — because the
fetch failed, the payload failed validation, or nothing is selected — it falls back
deterministically to a **calm neutral day gradient**, never throwing and never
logging. It **respects `prefers-reduced-motion`** (FR-ANIM-03): under
`prefers-reduced-motion: reduce` it renders a STATIC gradient only, with no particles
and no animation (read via `matchMedia`, mockable in `vitest.setup.ts`). It **never
intercepts clicks** (`pointer-events: none`, FR-ANIM-04, asserted in a test) and is
**decorative** for assistive technology (`aria-hidden`, NFR-A11Y-01). Day-vs-night
(FR-ANIM-02) is decided by a pure, framework-free helper from the active location's
sun times, never the visitor's clock. It stays **light** (NFR-PERF-03): CSS gradients
plus a small number of CSS/SVG-animated particles — no canvas/WebGL library and **no
new dependency**. All copy (only an accessible label, if any) is Ukrainian-first with
**no exclamation marks** (NFR-I18N-01, BC-BRAND-01).

## What Changes

- **Shared `WeatherContext` provider + `useWeather()` hook
  (`components/providers/WeatherProvider.tsx`, `"use client"`, D1):** a tiny in-memory
  context exposing the **active location's** today-weather summary — `{ todayCategory:
  WeatherCategory | null; sunrise: string | null; sunset: string | null; isLoaded:
  boolean }` — plus a `publish(next)` setter. It mounts once (in `app/layout.tsx`,
  inside the existing `LocationProvider`, so it spans BOTH the `WeatherBackground` and
  the `ShellContent`/`ForecastSection` subtrees, which are **siblings** in
  `app/page.tsx` — see D1) and holds no weather fetch of its own (ADR-0003,
  in-memory only). `useWeather()` returns a safe **default** (`{ todayCategory: null,
  sunrise: null, sunset: null, isLoaded: false }`) outside a provider, so a stray
  consumer never crashes (honest empty state).
- **`ForecastSection` additively PUBLISHES into `WeatherContext` (D1):** when its
  validated forecast for the active location loads, `ForecastSection` calls
  `publish({ todayCategory: describeWeather(days[0].weatherCode).category,
  sunrise: days[0].sunrise, sunset: days[0].sunset, isLoaded: true })`; when there
  is no location, no forecast, or a failed/invalid fetch, it publishes the
  not-loaded default. This is a **minimal additive** edit — it adds a publish
  side-effect and changes none of the forecast render/cache logic, and **all existing
  `ForecastSection` tests stay green** (a new test asserts the publish behaviour).
- **Pure framework-free `lib/animated-bg/` (TC-PURE-01, D3/D4):**
  `day-night.ts` — `isDaytime(nowLocal, sunrise, sunset): boolean`, a **total** pure
  helper deciding day vs night from the active location's local sunrise / sunset (the
  current instant evaluated in the LOCATION's local frame using the offset those
  timestamps carry, FR-ANIM-02); a missing / null / malformed sun time → a
  deterministic **day** fallback. `scene.ts` — `conditionToScene(category):
  { gradient: GradientKind; particle: ParticleKind }`, a **total** pure mapping from a
  `WeatherCategory` to a base-gradient kind and exactly one particle family (`rain |
  snow | clouds | none`); an unknown / absent category → the calm `none` default. No
  `next/*`, no `react`, no DOM — colocated `*.test.ts`.
- **Client `WeatherBackground` fills the bg slot
  (`components/shell/WeatherBackground.tsx`, `"use client"`, D2):** replaces the inert
  stub with a real **fixed, full-viewport, behind-content** layer (`pointer-events:
  none`, `aria-hidden`, `-z-10`) that CONSUMES `useWeather()` + the location's day/night
  via `isDaytime` and renders: (a) a **day or night base gradient** (chosen by
  `isDaytime(nowLocal, sunrise, sunset)` against the location's local time, FR-ANIM-02);
  (b) when motion is permitted and today's category maps to an effect, exactly one
  **particle layer** — rain, snow, or drifting clouds — from `conditionToScene`
  (FR-ANIM-01). Under `prefers-reduced-motion: reduce` (read via `matchMedia`) it
  renders the **static gradient only**, no particles, no animation (FR-ANIM-03). With
  no forecast / no location (`isLoaded: false`) it renders the calm **neutral day
  gradient** with no effect (the deterministic fallback, NFR-OBS-01).
- **i18n — a small `animatedBg.*` namespace (or reuse `shell.background.label`):** the
  layer renders **no readable data** (spec Exclusions), so it carries no user-facing
  strings beyond an optional accessible label. If a label is needed it is the existing
  `shell.background.label` ("Тло з погодою") reused, or a sibling `animatedBg.label`
  added to `lib/i18n/{uk,en}.ts` (never reaching into `shell.*`), calm, **no
  exclamation marks** (BC-BRAND-01, enforced across both locales by the existing i18n
  test). Decorative (`aria-hidden`) means the label is not announced; it exists only as
  a non-essential descriptor.

## Capabilities

### New Capabilities

- `animated-bg`: a keyless, calm, decorative full-bleed background that reflects
  today's weather and sky for the **active location** — a day-or-night base gradient
  chosen by the location's own sunrise / sunset (FR-ANIM-02) plus, when motion is
  permitted, one rain / snow / cloud-drift effect selected from today's weather
  **category** (FR-ANIM-01). It fetches **no weather of its own** (pure consumer of the
  `forecast` capability's validated daily payload via a shared `WeatherContext`),
  honours `prefers-reduced-motion` (a static gradient only, FR-ANIM-03), **never
  intercepts interaction** (`pointer-events: none`, decorative for AT, FR-ANIM-04,
  NFR-A11Y-01), stays light (CSS gradients + a few CSS/SVG particles, no new dep,
  NFR-PERF-03), and degrades to a calm neutral day gradient with no location/forecast
  (NFR-OBS-01). Pure framework-free `lib/animated-bg` (`isDaytime`, `conditionToScene`,
  total) carries the day/night + condition→scene logic; the client `WeatherBackground`
  consumes `useWeather()` and fills the shell's bg slot.

### Modified Capabilities

<!-- None at the spec level. This change introduces the animated-bg capability; it
CONSUMES the locked `forecast` capability (the `lib/forecast/weather-code` `category`
contract + `days[0].sunrise`/`days[0].sunset`) and the locked active-location state
(useLocation), and fills the shell's WeatherBackground bg slot. It does NOT change any
other capability's spec. It additively touches `components/forecast/ForecastSection.tsx`
(a publish side-effect into the new shared WeatherContext — all forecast tests stay
green) and mounts the WeatherProvider once in `app/layout.tsx` (the providers' home,
inside LocationProvider). It does NOT edit `app/page.tsx` (§3a serialize point). -->

## Impact

- **Specs:** the baseline `openspec/specs/animated-bg/spec.md` already exists (adopted
  at G2, 4 requirements). The delta under `specs/animated-bg/spec.md` restates that
  contract as `## ADDED Requirements` for the record and for `openspec validate
  add-animated-bg --strict`; archive runs with `--skip-specs` because the baseline
  already holds it (OpenSpec Option B is not re-applied).
- **Code (new):** `components/providers/WeatherProvider.tsx` (the shared
  `WeatherContext` + `useWeather()` hook, client); `lib/animated-bg/{day-night,scene}.ts`
  (framework-free) with colocated `lib/animated-bg/*.test.ts`; jsdom tests for
  `WeatherBackground`; a test asserting `ForecastSection` publishes correctly. Optional
  particle subcomponents live inside `components/shell/WeatherBackground.tsx` (or a
  small colocated module) — no separate slot file.
- **Code (extended):** `components/shell/WeatherBackground.tsx` — the inert stub is
  replaced with the real gradient + particle layer consuming `useWeather()` (filling
  the slot the shell reserved, §3a). `components/forecast/ForecastSection.tsx` — gains a
  **single additive** `publish(...)` side-effect into `WeatherContext` when its
  forecast loads / clears (no change to its fetch / cache / render logic; all its tests
  stay green). `app/layout.tsx` — mounts `<WeatherProvider>` once inside the existing
  `<LocationProvider>` (the providers' home, NOT the `app/page.tsx` composition
  serialize point). `lib/i18n/{uk,en}.ts` — at most a small `animatedBg.*` label, or no
  change if `shell.background.label` is reused.
- **Dependencies:** **none added** (NFR-PERF-03, NFR-DX-01) — gradients are CSS, the
  few particles are CSS/SVG-animated; **no canvas / WebGL / animation library**. **No
  database, no auth, no email** (ADR-0003). **No weather fetch of its own** — the
  background consumes the `forecast` capability's single validated daily payload via
  `WeatherContext`, so **zero** new external calls and **zero paid keys** (NFR-COST-01,
  TC-STACK-03). **No Playwright** (TC-STACK-05); verification is **Vitest** only — pure
  unit tests for `isDaytime` (sunrise/sunset boundaries + the location-not-viewer-clock
  proof) and `conditionToScene` (each category incl. unknown), and jsdom component
  tests for `WeatherBackground` (gradient render, particle-by-category, reduced-motion
  static, `pointer-events: none` + `aria-hidden`, calm default with no data) and the
  `ForecastSection` publish. The per-slice "smoke" is a **render smoke** (a
  `WeatherBackground` render: day vs night gradient + the reduced-motion static branch +
  `pointer-events: none`), **not** a DB smoke.
- **Out of scope (see the spec's Exclusions):** any readable data in the background
  (temperature / precip / wind / comfort — owned by `forecast` / `comfort-score`);
  locale or oversized-value handling (the layer renders no user-facing value);
  interactive or clickable background elements; a **second weather fetch** or any
  `current_weather` / `is_day` / hourly-condition input; per-frame weather realism,
  physics, lightning, fog-density modelling, or audio; user controls to toggle / theme /
  customise the background; twilight / golden-hour / multi-stage sky transitions (the
  base is a binary day-or-night choice); marine / aviation / agriculture conditions. All
  intentionally excluded so testers do not report them as defects.
