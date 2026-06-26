## Why

`add-forecast` is the **Wave 3** slice (capability plan §4.6, §6) on top of the
archived `add-app-shell`, `add-comfort-score`, `add-top-clock`, `add-bottom-jokes`
foundation and the just-validated `add-city-search`. It is the slice on the
**critical path** (`app-shell → city-search → forecast → animated-bg →
weekend-compare`) that turns the active location the search slice writes into a
readable weekend-planning view. It owns FR-FORECAST-01..05 and consumes two locked
upstreams: the **active location** (`useLocation()` from the LocationProvider) and
the pure **comfort-score** capability (`comfortScore`, `bandOf`, `upcomingWeekend`,
the `ComfortBadge` + `WeekendHighlight` components, and the `ComfortInput` shape).

The slice reuses the LOCKED conventions verbatim and writes no new cross-cutting
machinery. It **mirrors the `add-city-search` Route Handler data path** exactly
(TC-DATA-01): all Open-Meteo access goes through a server-side `app/api/forecast`
Route Handler that does the **keyless** server `fetch`, zod-parses via a pure
framework-free `lib/forecast`, and returns a typed `Forecast` (or a typed error) —
the client never sees the Open-Meteo URL or raw shape, and no key is implied in the
bundle (NFR-COST-01, TC-STACK-03). It honors the **ARCHITECTURE LESSON**: because
`app/page.tsx` is statically prerendered, anything depending on the active location
MUST be **client-driven** — `ForecastSection` fetches on the client off
`useLocation()`, never a server component reading `searchParams` baked at build.

The bar is high on the qualities the spec pins. The forecast is **one keyless
request** asking for BOTH the daily and the hourly blocks (FR-FORECAST-01/03). The
request **pins units** (`temperature_unit=celsius`, `windspeed_unit=ms`,
`timezone=auto`) so every rendered value is reproducible and matches the
comfort-score wind input (FR-COMFORT-02), and so each `daily.time` entry is the
location's **local calendar date** (the single defined source comfort-score uses to
pick the weekend, FR-COMFORT-05) — never a UTC date, never `toISOString()`. The
payload is **zod-parsed before render** (both blocks); a malformed payload is
treated as a failed fetch. The view caches the last good response **in memory tagged
with its location** until the location changes (FR-FORECAST-05), so an out-of-order
late response from a quick A→B→A switch never shows the wrong location's data. Every
failure — bad params, non-OK upstream, network throw, malformed 200 — degrades to a
calm visible `<Notice>` in Ukrainian with a silent console (NFR-OBS-01), never a raw
500. Recharts is **dynamically imported, client-only** so it stays out of the
initial bundle (NFR-PERF-03 ≤ 200 KB). All copy is Ukrainian-first with no
exclamation marks (NFR-I18N-01, BC-BRAND-01).

## What Changes

- **Server-side forecast Route Handler (`app/api/forecast/route.ts`, TC-DATA-01):**
  a Next 16 App Router `GET(request)` (read `node_modules/next/dist/docs/01-app/
  01-getting-started/15-route-handlers.md` + `06-fetching-data.md` first) that reads
  `?lat=&lon=`, performs the **keyless server-side fetch** to the Open-Meteo
  **forecast** API asking for both blocks in ONE request —
  `daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset`
  plus `cloud_cover_mean` (daily when available, else derived), `hourly=temperature_2m`,
  `temperature_unit=celsius`, `windspeed_unit=ms`, `timezone=auto`, `forecast_days=7` —
  **parses with zod** via the pure `lib/forecast/validation.ts`, and returns a typed,
  minimal `Forecast { days: DailyForecast[]; hourly: HourlyPoint[] }` (or a typed
  error). The client never sees the Open-Meteo forecast URL, params, or raw shape —
  only this stable internal contract. The handler is **honest under failure**
  (NFR-OBS-01): bad/missing `lat`/`lon`, a non-OK upstream, a network throw, or a
  body that fails the zod schema all return a **typed empty/error result with an OK
  status**, never a raw 500 and never partial data. Not cached (Next 16 default; we
  do NOT set `dynamic = 'force-static'` — a per-location lookup hits the network).
- **Pure framework-free `lib/forecast/` (TC-PURE-01):** `types.ts` (`Forecast`,
  `DailyForecast`, `HourlyPoint`, the comfort mapping), `validation.ts` (the zod
  schema covering BOTH the daily and hourly blocks + a **total** parse that maps a
  malformed/empty payload to a typed empty/again, never throws), `weather-code.ts`
  (map the Open-Meteo `weather_code` → an icon name + a short Ukrainian condition
  label from i18n + a day/night-agnostic category for the later animated background;
  unknown codes degrade to a neutral default), and `hourly.ts` (slice the next 48 h
  from the hourly arrays, pure). Each validated `DailyForecast` maps to a
  `ComfortInput` (the locked `lib/scoring/types.ts` shape) so `comfortScore` has a
  single defined source for every factor (FR-COMFORT-02). No `next/*`, no `react`, no
  DOM — colocated `*.test.ts`.
- **Client `ForecastSection` filling the ShellContent forecast slot
  (`components/forecast/ForecastSection.tsx`, `"use client"`):** reads
  `useLocation()`; when a location is active it fetches **`/api/forecast?lat=&lon=`**
  (NEVER Open-Meteo directly), **caches the last successful response in memory tagged
  with its location** until the location changes (FR-FORECAST-05), and discards a late
  response whose location is no longer active. It renders, in order: the
  **`WeekendHighlight`** at the TOP (fed by `upcomingWeekend(days.map(comfortInput))`
  from comfort-score), then a grid of **7 day cards** (`DayCard.tsx`: weekday name
  from the local `time` date, hi/lo °C, weather icon + Ukrainian condition label,
  precip probability %, wind, and a **`ComfortBadge`** for that day's `comfortScore`),
  then the **48-hour hourly temperature line chart** (Recharts), then **today's
  sunrise + sunset** as small text under the chart. The no-location / loading / error
  states all render the shared `<Notice>` (honest degradation, NFR-OBS-01).
- **Dynamically-imported Recharts chart (NFR-PERF-03):** the hourly chart is a
  SEPARATE component `components/forecast/HourlyChart.tsx` loaded via
  `next/dynamic` with `ssr: false` and a **same-footprint skeleton**, so Recharts
  stays OUT of the initial bundle and off the server (the locked dynamic-import
  pattern, mirrored from the map plan).
- **i18n — a `forecast.*` namespace:** add `forecast.*` to `lib/i18n/uk.ts` +
  `en.ts` (sibling to the others, never reaching into `shell.*`): section + region
  labels, weekday names (or the documented Intl-with-uk-locale decision), the
  weather-code condition labels, the "sunrise"/"sunset" labels, the unit labels (°C,
  m/s, %), the precipitation placeholder, the chart accessible name, and the loading
  / error / no-location copy (graded by the eval). Calm tone, **no exclamation marks**
  (BC-BRAND-01, enforced across both locales by the existing i18n test).

## Capabilities

### New Capabilities

- `forecast`: a keyless, Ukrainian-first 7-day daily outlook + 48-hour hourly
  temperature chart + today's sunrise/sunset for the active location — the
  server-side **forecast Route Handler** (`app/api/forecast/route.ts`) keeping the
  Open-Meteo forecast URL/shape off the client and degrading honestly, the pure
  framework-free `lib/forecast` (zod parse of BOTH blocks → typed `Forecast`, total;
  `weather-code` → icon + UA label + category; `hourly` 48 h slice; daily →
  `ComfortInput` mapping), and the client `ForecastSection` (client-driven fetch off
  `useLocation()`, in-memory location-tagged cache until the location changes, the
  `WeekendHighlight` + 7 `DayCard`s with a `ComfortBadge` each + the
  dynamically-imported 48 h `HourlyChart` + sunrise/sunset, and the calm
  no-location / loading / error Notice states).

### Modified Capabilities

<!-- None. This change introduces the forecast capability; no existing spec
changes. It CONSUMES the locked comfort-score capability (comfortScore / bandOf /
upcomingWeekend / ComfortInput / ComfortBadge / WeekendHighlight) and the locked
active-location state (useLocation), and fills the ShellContent forecast slot
(a slot the shell shipped for exactly this purpose) — it does not edit any other
capability's spec, the comfort-score module, or app/page.tsx (§3a). It adds a
sibling forecast.* i18n namespace. -->

## Impact

- **Specs:** the baseline `openspec/specs/forecast/spec.md` already exists (adopted
  at G2, 8 requirements). The delta under `specs/forecast/spec.md` restates that
  contract as `## ADDED Requirements` for the record and for `openspec validate
  add-forecast --strict`; archive runs with `--skip-specs` because the baseline
  already holds it (OpenSpec Option B is not re-applied).
- **Code (new):** `app/api/forecast/route.ts` (the server-side forecast handler);
  `lib/forecast/{types,validation,weather-code,hourly}.ts`, framework-free, with
  colocated `lib/forecast/*.test.ts`; `components/forecast/ForecastSection.tsx` (the
  client island), `components/forecast/DayCard.tsx`, `components/forecast/HourlyChart.tsx`
  (Recharts, client-only via `next/dynamic`), with colocated jsdom tests; an
  integration test for the route handler over a **mocked** Open-Meteo forecast
  payload; and a browser-free eval case `evals/cases/forecast-copy.eval.ts` grading
  the loading / error / no-location copy.
- **Code (extended):** `components/shell/ShellContent.tsx` — the inert
  `<div data-slot="forecast" aria-hidden="true" />` placeholder is replaced with the
  real `<ForecastSection/>` (filling the slot the shell reserved; the shell's own
  located-state region, **not** an `app/page.tsx` edit, §3a). `lib/i18n/uk.ts` +
  `lib/i18n/en.ts` gain a `forecast.*` namespace (sibling to the others).
- **Dependencies:** none added — `zod` and `recharts` are already installed and
  `next`/`react` ship the Route Handler + `next/dynamic`. **No database, no auth, no
  email** (ADR-0003); the only external call is the **keyless** Open-Meteo forecast
  GET from the server, **zero paid keys** (NFR-COST-01, TC-STACK-03). **No
  Playwright** (TC-STACK-05); verification is **Vitest** only — pure unit tests for
  the zod parse / weather-code / hourly slice / comfort mapping, jsdom component
  tests for `ForecastSection` + `DayCard` + `HourlyChart`, and an integration test
  for the route handler over a mocked `fetch`. The per-slice "smoke" is a
  **service/integration smoke over MOCKED Open-Meteo forecast payloads** (route
  handler → typed `Forecast`; malformed → empty; `ForecastSection` renders the grid +
  a `ComfortBadge`), **not** a DB smoke.
- **Out of scope (see the spec's Exclusions):** forecast windows beyond 7 days;
  climate / historical analysis; marine / aviation / agriculture variables;
  background / scheduled / push-driven refresh (refresh happens only on location
  change); persistence to disk / cookies / localStorage / any server-side database
  (BC-PRIVACY-03); and per-day comfort scoring + weekend highlighting as a
  capability (owned by `comfort-score` — `forecast` only renders comfort-score's
  components against its own data). All intentionally excluded so testers do not
  report them as defects.
