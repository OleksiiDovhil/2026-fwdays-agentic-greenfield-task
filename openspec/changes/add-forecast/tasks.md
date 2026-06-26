## 1. Setup (i18n `forecast.*` namespace)

> No database, no migrations, no auth, no email (ADR-0003). No new deps — `zod`,
> `recharts`, `next`, and `react` are installed. Reuse the LOCKED conventions:
> `lib/i18n` namespaces + `t()`, `useLocation()` (location, not setter), the shared
> `components/ui/Notice.tsx`, the comfort-score `comfortScore`/`bandOf`/
> `upcomingWeekend` + `ComfortBadge`/`WeekendHighlight` + the `ComfortInput` shape,
> and the ShellContent forecast slot. This slice introduces NO new color — cards
> reuse the existing `surface`/`border`/`muted` tokens and comfort badges reuse the
> AA-verified comfort tokens; nothing new for NFR-A11Y-02.

- [ ] 1.1 Add a `forecast` namespace to `lib/i18n/uk.ts` (sibling to the other
  namespaces — never edit `shell.*`), with calm Ukrainian copy, **no exclamation
  marks** (BC-BRAND-01, D6, NFR-I18N-01): `forecast.sectionLabel` (the section's
  accessible region name), `forecast.weekday.*` (7 short Ukrainian weekday labels
  indexed by day-of-week 0=Sun..6=Sat, D6), `forecast.condition.*` (short Ukrainian
  weather-code labels keyed to match `describeWeather`'s label keys, incl. a generic
  fallback for unknown codes), `forecast.sunrise` / `forecast.sunset` labels,
  `forecast.unit.celsius` / `forecast.unit.wind` (m/s) / `forecast.unit.percent`
  labels and `forecast.minus` (the minus glyph), `forecast.precipPlaceholder` ("—"),
  `forecast.chartLabel` (the hourly chart's accessible name), `forecast.loading` (a
  calm busy label), `forecast.error` (the failed-fetch Notice copy), and
  `forecast.noLocation` (the no-location empty-state copy). EVAL-GRADED:
  `forecast.loading` / `forecast.error` / `forecast.noLocation` (≥ 90).
- [ ] 1.2 Mirror the same `forecast.*` keys in `lib/i18n/en.ts` (strict fallback
  subset, identical key shape). Same calm tone, no exclamation marks (D6, NFR-I18N-01).
- [ ] 1.3 Confirm `recharts` is already a dependency (it is, `package.json`); add NO
  new dependency. Note in a code comment (D5) that Recharts is loaded ONLY via the
  dynamically-imported `HourlyChart` (`ssr:false`) so it never enters the initial
  bundle (NFR-PERF-03).

## 2. Pure domain logic (`lib/forecast` — framework-free, TC-PURE-01)

> No `next/*`, no `react`, no DOM globals — 100% unit-testable, total (never throws
> to the UI). Colocated `*.test.ts` with `@trace` ids. Write the section 5 unit
> tests FIRST and confirm they FAIL (red) before implementing (test-first per
> AGENTS.md). Mirror the locked `lib/search`/`lib/location` `.safeParse` discipline
> and the comfort-score fixed-`Date.UTC` date parse (never `toISOString`, never the
> viewer's clock — AGENTS.md, FR-COMFORT-05).

- [ ] 2.1 `lib/forecast/types.ts` (D2) — the internal contract crossing the
  Server↔Client boundary: `HourlyPoint = { time: string; temperature: number | null }`;
  `DailyForecast` carrying EVERYTHING `comfortScore` needs as a `ComfortInput`
  (`time: string` "YYYY-MM-DD"; `apparentHigh`, `apparentLow`, `precipProbability`,
  `windMax`, `cloudCover`, `uvIndex` — all `number | null`) PLUS the display fields
  (`weatherCode: number | null`, `tempMax`, `tempMin`, `sunrise: string | null`,
  `sunset: string | null`); `Forecast = { days: DailyForecast[]; hourly: HourlyPoint[] }`;
  and `ForecastResult` = `{ forecast: Forecast }` (success) | `{ error: "failed" }`
  (typed error). Import `ComfortInput` from the LOCKED `lib/scoring/types.ts` (do NOT
  redefine it). Add `toComfortInput(day: DailyForecast): ComfortInput` — the ONE
  mapping point (`windMax → windSpeed`, the rest pass-through by name).
- [ ] 2.2 `lib/forecast/validation.ts` (D2, FR-FORECAST-01) — a **zod schema for the
  Open-Meteo forecast response** covering BOTH blocks. The upstream `daily` block is
  COLUMN-oriented (parallel arrays keyed by index against `daily.time`): validate
  `daily.time` (string[]) and each of `weather_code`, `temperature_2m_max`,
  `temperature_2m_min`, `apparent_temperature_max`, `apparent_temperature_min`,
  `precipitation_probability_max`, `wind_speed_10m_max`, `uv_index_max`,
  `cloud_cover_mean` (nullable-number arrays), `sunrise`/`sunset` (string[]); the
  `hourly` block is `{ time: string[]; temperature_2m: (number|null)[] }`. Then a
  **total** parser `parseForecast(body: unknown): ForecastResult` that `.safeParse`s
  the body and ZIPS the daily columns per index into `DailyForecast[]` (a missing
  per-day value → `null`, not zero, not dropped) and maps the hourly arrays into
  `HourlyPoint[]`. TOTAL: a malformed / partial / non-object body, a body whose shape
  fails the schema, OR a **missing/non-array/non-numeric hourly block** → `{ error:
  "failed" }` and NEVER throws (the hourly block is validated before the daily cards
  render, per spec). A schema-valid body with an **empty `daily.time`** (zero days)
  → `{ error: "failed" }` (no day to render — degraded; never an empty grid). A
  **short** daily array (1..6) is VALID and yields that many days. `cloud_cover_mean`
  absent → per-day `null` (comfort neutral fallback covers it; never a fabricated
  value). NOTE: the request pins `windspeed_unit=ms` per the baseline spec; the
  daily wind field requested is `wind_speed_10m_max` — confirm the exact Open-Meteo
  field/unit-param spelling against the live API at implementation (Open-Meteo
  accepts `windspeed_unit`/`wind_speed_unit` aliases), but the SCHEMA + the rendered
  m/s unit must match the requested unit (FR-COMFORT-02).
- [ ] 2.3 `lib/forecast/weather-code.ts` (D2, FR-FORECAST-02) — a pure
  `describeWeather(code: number | null): { icon: string; labelKey: string; category:
  WeatherCategory }` mapping the Open-Meteo WMO `weather_code` to (a) a stable icon
  NAME string (a `lucide-react` key the card resolves — the lib stays DOM-free), (b)
  an i18n KEY for the short Ukrainian condition label (the card calls `t()` — the lib
  carries NO copy, NFR-I18N-01), and (c) a day/night-AGNOSTIC `category` (`clear |
  cloudy | fog | drizzle | rain | snow | thunder`) for the later `add-animated-bg`.
  Map the WMO groups (0 clear; 1-3 mainly clear→overcast; 45/48 fog; 51-57 drizzle;
  61-67 rain; 71-77 snow; 80-82 rain showers; 85/86 snow showers; 95-99 thunderstorm).
  TOTAL: an unknown / out-of-range / `null` code → a neutral default (e.g. `cloudy` +
  a generic label key + a generic icon) so no card breaks on an unexpected code.
- [ ] 2.4 `lib/forecast/hourly.ts` (D2, FR-FORECAST-03) — a pure `nextHours(hourly:
  HourlyPoint[], count = 48, now = Date.now()): HourlyPoint[]` slicing the next
  `count` hours FROM NOW out of the parsed hourly arrays. `now` is an INJECTED param
  (default `Date.now()`) so unit tests are deterministic (TC-PURE-01 — tests always
  inject `now`). Fewer than `count` future points → return the ones it has (spec:
  fewer-than-48 still renders). Parse each point's local `time` via a fixed
  `Date.parse` of the ISO-local string (no `toISOString`, no viewer-TZ recompute),
  consistent with the comfort-score date discipline.

## 3. Server (`app/api/forecast` Route Handler — fetch + zod + typed result)

> Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
> + `06-fetching-data.md` BEFORE writing. This is the ONLY place the Open-Meteo
> forecast URL/params and the server `fetch` live (TC-DATA-01) — MIRROR
> `app/api/geocode/route.ts` exactly. Keyless (TC-STACK-03, NFR-COST-01). Honest
> under failure (NFR-OBS-01): never a raw 500.

- [ ] 3.1 `app/api/forecast/route.ts` (D1, TC-DATA-01) — export an async
  `GET(request: Request)`. Read `lat` + `lon` from the request URL's search params;
  parse them as finite numbers IN RANGE (`lat ∈ [-90,90]`, `lon ∈ [-180,180]`).
  Missing / non-numeric / out-of-range `lat`/`lon` → a typed result the client treats
  as degraded WITHOUT calling Open-Meteo (mirroring geocode's empty-`q` short-circuit,
  defence in depth against a tampered URL). The handler is NOT cached (Next 16
  default; do NOT set `dynamic = 'force-static'`).
- [ ] 3.2 Keyless server-side fetch (D1, TC-STACK-03, NFR-COST-01): for valid
  `lat`/`lon`, `fetch` the Open-Meteo forecast API in ONE request asking for BOTH
  blocks (no API key, no auth header) — `daily=weather_code,temperature_2m_max,
  temperature_2m_min,apparent_temperature_max,apparent_temperature_min,
  precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset` plus
  `cloud_cover_mean`, `hourly=temperature_2m`, `temperature_unit=celsius`,
  `windspeed_unit=ms`, `timezone=auto`, `forecast_days=7`. The Open-Meteo URL/params
  live ONLY here.
- [ ] 3.3 Parse + map (D1/D2): parse the upstream body with `lib/forecast`
  (`parseForecast`) and return `Response.json(result)` where `result` is
  `{ forecast } satisfies ForecastResult` on success. The client receives only the
  minimal typed `Forecast`, never the raw Open-Meteo shape (the long param list +
  column arrays stay server-side).
- [ ] 3.4 Honest degradation — never a raw 500 (D1/D4, NFR-OBS-01): wrap the body so
  no exception escapes. Bad/missing `lat`/`lon` → a typed result (no upstream call). A
  **non-OK** Open-Meteo status, a **thrown** fetch (network), a `.json()` that throws,
  a **zod-failed** 200 body, OR a schema-valid **zero-day** forecast → `{ error:
  "failed" } satisfies ForecastResult` with a client-readable status (200, so the
  client `fetch` RESOLVES and reads the body — never an unhandled rejection, never
  partial data). Keep the server console clean on every failure path. Document in a
  comment why a route handler is used over a client-direct fetch (D1), mirroring the
  `app/api/geocode/route.ts` header.

## 4. UI (`ForecastSection` client + `DayCard` + dynamically-imported `HourlyChart`; fill the slot)

> `"use client"` for the section + chart — the ONLY place React/`fetch`/Recharts/
> client cache concerns live. Client-DRIVEN per the ARCHITECTURE LESSON (app/page.tsx
> is statically prerendered; location-dependent work must fetch on the client off
> `useLocation()`). Reuse `useLocation()` (location only), `components/ui/Notice.tsx`,
> the comfort-score `comfortScore`/`upcomingWeekend` + `ComfortBadge`/`WeekendHighlight`.
> Do NOT edit `app/page.tsx` beyond the ShellContent slot file (§3a). All copy from
> `lib/i18n` `forecast.*` (no `!`).

- [ ] 4.1 `components/forecast/ForecastSection.tsx` (`"use client"`, D3) — reads
  `useLocation()` for the LOCATION only (not the setter; the section never re-parses
  the URL). When no location is active, render NO fetch and the calm
  `<Notice>` no-location state (`forecast.noLocation`). Carry an accessible region
  name (`forecast.sectionLabel`).
- [ ] 4.2 Client-driven fetch on location change (D3, FR-FORECAST-05): an effect keyed
  on the active location identity fires a `fetch` to **`/api/forecast?lat=&lon=`** (the
  internal route, NEVER Open-Meteo directly) whenever the location changes. Show a calm
  `loading` state (`forecast.loading`, a Notice or a skeleton) while a fetch for a
  newly selected location is in flight.
- [ ] 4.3 In-memory location-tagged cache + latest-wins (D3, FR-FORECAST-05): hold the
  last SUCCESSFUL, schema-valid `Forecast` in component state TAGGED with the location
  identity it belongs to (`{lat,lon}` → a stable key). In-memory ONLY — no cookies, no
  localStorage, no server store. Each in-flight request captures its location identity;
  on resolve, render/cache the response ONLY IF its identity still equals the currently
  active location — a response for a NO-LONGER-ACTIVE location (a quick A→B→A switch
  where B resolves after A is active again) is DISCARDED (not cached, not rendered).
  While B's re-fetch is in flight, A's cache is NEVER shown under B; a new validated B
  response SUPERSEDES A's cache. If B's fetch FAILS, show B's degraded Notice and do
  NOT show A's cache under B (no cross-location stale data). Guard with an
  `AbortController` (abort the previous in-flight request) AND the captured identity
  compared on resolve (belt-and-braces).
- [ ] 4.4 `components/forecast/DayCard.tsx` (D3, FR-FORECAST-02): render one day —
  weekday name from the local `time` date (index `forecast.weekday[weekdayIndex]`,
  derived via the comfort-score fixed-`Date.UTC` parse, never the viewer's clock),
  hi/lo in °C, the weather icon + UA condition label (from `describeWeather(weatherCode)`
  + `t(labelKey)`; the icon name resolved to a `lucide-react` icon), precip
  probability %, wind in m/s, and a comfort-score **`ComfortBadge value={comfortValue}`**
  for that day. Number formatting is TOTAL (FR-FORECAST-02): temperature rounds to
  whole °C (round half away from zero, no decimals, the i18n minus glyph for
  negatives); wind rounds to whole m/s with the unit label from `forecast.unit.wind`
  (NOT hardcoded); precip shows an integer `%` (a present `0` → "0%"); a `null`/absent
  precip → the neutral `forecast.precipPlaceholder` ("—"), DISTINCT from "0%". An
  EXTREME value (e.g. -59°C, 212 m/s) rounds + renders without overflow, no throw, no
  console warning.
- [ ] 4.5 Render order in `ForecastSection` (D3, FR-FORECAST-02/03/04): compute each
  day's comfort value ONCE (`comfortScore(toComfortInput(d)).value`) and reuse it for
  both the weekend summary and the per-card badge. Render, in order: (1) the
  comfort-score **`WeekendHighlight`** at the TOP, fed `upcomingWeekend(days.map(d =>
  ({ time: d.time, value: comfortValue(d) })))`; (2) the grid of 7 `DayCard`s (one per
  `days[]`, chronological — a short array renders the days it has, never a fabricated
  card); (3) the dynamically-imported `HourlyChart` (4.6); (4) today's sunrise/sunset
  (4.7).
- [ ] 4.6 `components/forecast/HourlyChart.tsx` + dynamic import (D5, FR-FORECAST-03,
  NFR-PERF-03): a SEPARATE component that imports Recharts and renders the 48 h
  temperature `LineChart` (`ResponsiveContainer` + `LineChart` + `Line` + axes +
  tooltip) fed `nextHours(forecast.hourly, 48)`. `ForecastSection` loads it via
  `const HourlyChart = dynamic(() => import("./HourlyChart"), { ssr: false, loading:
  () => <ChartSkeleton/> })` so Recharts stays OUT of the initial bundle and OFF the
  server. The `ChartSkeleton` has the SAME footprint (fixed height/aspect) so there is
  NO layout shift (CLS). The chart plots °C against time, formats axis/tooltip values
  by the integer-degree rule (4.4), is readable on the smallest viewport, and exposes
  an accessible name (`forecast.chartLabel`) so the trend is not an unlabeled image.
  Fewer than 48 points (or an empty/short series) still renders calmly, no console
  warning.
- [ ] 4.7 Sunrise + sunset (D3, FR-FORECAST-04): small text under the chart showing
  today's sunrise/sunset from `days[0].sunrise` / `days[0].sunset`, formatted for the
  UA UI with the `forecast.sunrise` / `forecast.sunset` labels. A `null` value is
  omitted or labelled calmly (`forecast.precipPlaceholder` "—"), never an error, console
  clean (the spec's missing-sunrise scenario).
- [ ] 4.8 States all use the shared `<Notice>` (D4, NFR-OBS-01): no location →
  empty/info Notice (`forecast.noLocation`); loading → a calm busy state
  (`forecast.loading`); error (network / non-OK handler / malformed-or-zero-day
  forecast) → error Notice (`forecast.error`, Ukrainian, no `!`), the rest of the page
  interactive. NO toast, NO raw 500, NO uncaught exception surfaced. Do NOT
  `console.log` caught errors (render the Notice instead); abort the in-flight request
  and ignore a stale resolution on unmount / location change (no "update on unmounted
  component"); keep the console silent on a healthy session.
- [ ] 4.9 Fill the ShellContent forecast slot (D7, §3a): in
  `components/shell/ShellContent.tsx` REPLACE the inert `<div data-slot="forecast"
  aria-hidden="true" />` (inside the LOCATED-state branch) with the real
  `<ForecastSection/>`, preserving the responsive grid region (`grid-cols-1
  md:grid-cols-2 xl:grid-cols-3`) and the sibling `map`/`compare` slot placeholders.
  `ForecastSection` MAY span grid columns for the wider daily grid + chart. This is the
  shell's OWN located-state region — do NOT edit `app/page.tsx`.

## 5. Tests (Vitest only — unit + jsdom component + route-handler integration; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–4 to
> green. Every test file carries `@trace` ids. Never weaken a test to pass it; if a
> test contradicts the spec, change it deliberately. Use a mocked `fetch` for the
> network and inject `now` into `nextHours` for determinism; do NOT hit the real
> Open-Meteo (keyless, but tests are deterministic and offline). ResizeObserver is
> already mocked in `vitest.setup.ts` for Recharts.

- [ ] 5.1 Unit `lib/forecast/validation.test.ts` (FR-FORECAST-01, D2): feed a
  **real-ish** Open-Meteo forecast payload (7-day daily column arrays + a ≥48 h hourly
  block) and assert `parseForecast` returns `{ forecast }` with 7 `DailyForecast`s
  carrying the right comfort factors (`apparentHigh`/`apparentLow`/`precipProbability`/
  `windMax`/`cloudCover`/`uvIndex`) AND display fields (`weatherCode`/`tempMax`/`tempMin`/
  `sunrise`/`sunset`) zipped per index, and the hourly `HourlyPoint[]`. Then feed
  **malformed** bodies (daily columns of wrong type / mismatched length; a non-object;
  `null`), a body with a **missing/non-array/non-numeric hourly** block, and a
  schema-valid **zero-day** body → assert each returns `{ error: "failed" }` and NEVER
  throws. Feed a **short** (4-day) body → assert exactly 4 days. Feed a body with a
  day missing `precipitation_probability_max`/`cloud_cover_mean` → assert that day's
  field is `null` (not zero, not dropped). Assert `toComfortInput(day)` maps `windMax
  → windSpeed` and passes the rest through. `@trace FR-FORECAST-01, FR-COMFORT-02`.
- [ ] 5.2 Unit `lib/forecast/weather-code.test.ts` (FR-FORECAST-02, D2): assert
  `describeWeather` maps representative codes per WMO group (0 clear; 3 overcast/cloudy;
  48 fog; 55 drizzle; 63 rain; 73 snow; 95 thunder) to the expected `category`, a
  non-empty `labelKey`, and a non-empty `icon` name; assert an **unknown** code (e.g.
  `999`), an out-of-range code, and `null` map to the neutral default (no throw, a
  generic label key + icon). `@trace FR-FORECAST-02`.
- [ ] 5.3 Unit `lib/forecast/hourly.test.ts` (FR-FORECAST-03, D2): with an INJECTED
  `now`, assert `nextHours` returns the next 48 future points from a long hourly series
  (skipping past points), returns FEWER when fewer future points exist (e.g. 30) without
  throwing, and returns `[]` for an empty series — all deterministic, no viewer-clock
  read. `@trace FR-FORECAST-03`.
- [ ] 5.4 Integration `app/api/forecast/route.test.ts` (TC-DATA-01, NFR-OBS-01, D1):
  with `global.fetch` MOCKED, call the route's `GET` with `?lat=50.45&lon=30.52` and a
  mocked real-ish Open-Meteo forecast body → assert it returns `{ forecast }` (typed,
  minimal `Forecast`; the raw Open-Meteo column shape never crosses the boundary).
  Assert the upstream URL is the KEYLESS Open-Meteo forecast host with the pinned
  params (`daily=...`, `hourly=temperature_2m`, `temperature_unit=celsius`,
  `windspeed_unit=ms`, `timezone=auto`, `forecast_days=7`) and NO api key / auth header
  (NFR-COST-01). Mock a **non-OK** upstream, a **thrown** fetch, a `.json()` that
  throws, a **zod-failed** 200 body, and a schema-valid **zero-day** body → assert each
  returns `{ error: "failed" }` (NOT a raw 500, NOT partial data) with a client-readable
  status. Assert a **missing/out-of-range** `lat`/`lon` → degraded result WITHOUT
  calling Open-Meteo. Assert the server console stays clean on the failure paths.
  `@trace TC-DATA-01, NFR-OBS-01, FR-FORECAST-01`.
- [ ] 5.5 jsdom `components/forecast/ForecastSection.test.tsx` — renders the view from a
  mocked `/api/forecast` (FR-FORECAST-02/03/04, D3): mock `fetch` to return a typed
  `{ forecast }` and a mocked `useLocation()` with an active location; render and assert
  the `WeekendHighlight` renders at the TOP, exactly 7 `DayCard`s render (weekday + hi/lo
  °C + condition label + precip % + wind), each card shows a comfort `ComfortBadge`, the
  `HourlyChart` renders (import the chart directly / let the dynamic import resolve), and
  today's sunrise/sunset render under the chart. `@trace FR-FORECAST-02, FR-FORECAST-03,
  FR-FORECAST-04`.
- [ ] 5.6 jsdom cache + location change + no-location (FR-FORECAST-05, D3): with a
  mocked `useLocation()` whose location can change between renders, assert (a) a NEW
  location triggers a re-fetch and the view shows the new location's forecast; (b)
  re-rendering WITHOUT a location change serves the cached forecast without a new
  request (cache hit); (c) a quick A→B→A switch where B resolves AFTER A is active again
  → B's response is DISCARDED (A's forecast stands, B's data never shown under A); (d)
  switching to B whose fetch FAILS while A was cached → B's error Notice shows and A's
  cache is NOT shown under B; (e) NO location → no fetch and the calm no-location
  Notice. `@trace FR-FORECAST-05`.
- [ ] 5.7 jsdom honest degradation + console silence (NFR-OBS-01, D4): a mocked network
  error / non-OK / typed-error / malformed-or-zero-day `/api/forecast` → assert the calm
  error Notice renders (Ukrainian, no `!`, no toast, no uncaught exception) and the
  console stays clean; a healthy successful render → assert the console shows no warning
  or error. `@trace NFR-OBS-01`.
- [ ] 5.8 jsdom `components/forecast/DayCard.test.tsx` formatting (FR-FORECAST-02): a
  high `-7.4` / low `-6.6` → both read `-7°C` (rounded, no decimals, minus present); a
  wind `3.6` → `4` with the i18n m/s label; a present precip `0` → "0%" while an absent
  precip → the "—" placeholder (distinct); an EXTREME high `-58.7` → `-59°C` and wind
  `212.4` → `212` without overflow, no throw, console clean; a Ukrainian weekday label
  from i18n (not a raw API string). `@trace FR-FORECAST-02`.
- [ ] 5.9 jsdom `components/forecast/HourlyChart.test.tsx` (FR-FORECAST-03,
  NFR-PERF-03/A11Y-01): import `HourlyChart` directly (bypassing `dynamic`) and assert
  it renders from a 48-point series with an accessible name (`forecast.chartLabel`);
  assert a 30-point series still renders without a console warning (ResizeObserver
  mocked). `@trace FR-FORECAST-03, NFR-A11Y-01`.
- [ ] 5.10 EVAL `evals/cases/forecast-copy.eval.ts` (FR-FORECAST-05, NFR-OBS-01,
  BC-BRAND-01): browser-free cases whose `produce()` imports the pure `lib/i18n`
  dictionary and returns the user-visible copy — one for the failed-fetch message
  (`forecast.error`), one for the no-location empty state (`forecast.noLocation`), and
  one for the loading copy (`forecast.loading`). Rubric (mark gating lines `CRITICAL:`):
  natural fluent Ukrainian; no exclamation marks; the error copy is calm + recoverable
  (the visitor can try again, the rest of the app works), never alarmist or a dead end;
  the no-location copy invites the visitor to pick a city; the loading copy is a quiet
  reassuring busy state; concise, no ALL-CAPS / jargon / error codes. Group by
  `dimension` (e.g. `forecast-error-clarity`, `forecast-empty-clarity`,
  `forecast-loading-clarity`), mirror `@trace`. Fail LOUDLY if any key resolves blank.
  Target every dimension ≥ 90. `@trace FR-FORECAST-05, NFR-OBS-01, BC-BRAND-01`.

## 6. Validation, docs, and archive prep

- [ ] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red) for the right
  reason (missing modules, not weak assertions), then implement sections 1–4 to green
  (test-first per AGENTS.md). Never weaken a test to pass it; if a test contradicts the
  spec, change it deliberately, not silently.
- [ ] 6.2 Run `npm run lint` — zero errors/warnings (incl. the import-boundary check:
  `lib/forecast` has no `next/*`/`react`/DOM imports, TC-PURE-01; no inline UI literals,
  NFR-I18N-01; Recharts imported ONLY in `HourlyChart`).
- [ ] 6.3 Run `npm run test:run` — all unit + jsdom component + route-handler
  integration tests green.
- [ ] 6.4 Run `npm run build` — production build succeeds; console clean. Confirm the
  `app/api/forecast` route compiles as a Route Handler (dynamic, not cached) and the
  client bundle carries NO `api.open-meteo.com` reference and no key (TC-DATA-01,
  NFR-COST-01), AND that **Recharts is in a lazy chunk, not the initial bundle**
  (NFR-PERF-03) — inspect the `next build` output / `.next/static`.
- [ ] 6.5 Run `node scripts/check-eval-ratchet.mjs` (the graded-quality bar) — the new
  `forecast.*` eval dimensions are ≥ 90 and the committed score does not drop. (The
  eval-suite judge workflow, maker≠checker, grades the copy and writes results; the
  maker does not self-grade — record SKIP if `evals/results/latest.json` is absent.)
- [ ] 6.6 Run `npx openspec validate add-forecast --strict` — zero errors/warnings
  ("Change 'add-forecast' is valid").
- [ ] 6.7 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [ ] 6.8 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-forecast` implemented/validated/archived, and record the conventions for
  downstream reuse: the `forecast.*` i18n namespace; the **`app/api/forecast` Route
  Handler** data path (forecast goes server-side, keyless, zod-parses BOTH blocks,
  typed `Forecast` result — the same TC-DATA-01 pattern as geocode); `lib/forecast/
  {types,validation,weather-code,hourly}.ts` as the pure forecast layer (`parseForecast`
  total, `describeWeather` → icon+UA-label+category, `nextHours`, `toComfortInput`);
  the `DailyForecast` shape carrying the `ComfortInput` factors + display fields (the
  shape `add-weekend-compare` will reuse); `components/forecast/{ForecastSection,DayCard,
  HourlyChart}.tsx` (client-driven fetch + in-memory location-tagged cache + the
  dynamically-imported Recharts chart) filling the ShellContent forecast slot; the
  **`weather-code` category** as the contract `add-animated-bg` consumes; plus the exact
  next step (Wave 4: `add-animated-bg`, then Wave 5: `add-weekend-compare`).
- [ ] 6.9 SERVICE/INTEGRATION smoke over MOCKED Open-Meteo forecast payloads (NOT a DB
  smoke — there is no DB, ADR-0003), step by step: (a) with `global.fetch` mocked to a
  real-ish Open-Meteo forecast body, call the `app/api/forecast` `GET` with
  `?lat=50.45&lon=30.52` and assert it returns typed `{ forecast }` (minimal `Forecast`
  with 7 days + the hourly slice, no raw Open-Meteo column shape); (b) mock a malformed
  / zero-day body and assert `{ error: "failed" }` (NOT a raw 500); (c) mock a
  non-OK / thrown upstream and assert `{ error: "failed" }`; (d) under jsdom with a
  mocked `fetch` + a mocked active `useLocation()`, render `<ForecastSection/>` and
  assert the 7-day grid renders, each `DayCard` shows a `ComfortBadge`, the
  `WeekendHighlight` renders at the top, and the `HourlyChart` + sunrise/sunset render;
  (e) render with an error mock and assert the calm `forecast.error` Notice (no toast)
  and a clean console. Capture the pass output as the smoke evidence.
- [ ] 6.10 GATED on 6.9 passing: `npx openspec archive add-forecast --yes --skip-specs`
  (the baseline `openspec/specs/forecast/spec.md` already holds the contract, so the
  delta is NOT re-applied via Option B). Do not archive before the service/integration
  smoke passes.
