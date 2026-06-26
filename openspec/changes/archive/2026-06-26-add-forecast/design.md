## Context

`add-forecast` is the **Wave 3** slice (capability plan §4.6, §6) off the archived
`add-app-shell` / `add-comfort-score` / `add-top-clock` / `add-bottom-jokes`
foundation and the just-validated `add-city-search`. It is on the **critical path**
(`app-shell → city-search → forecast → animated-bg → weekend-compare`). The shell
shipped the region this slice fills: `components/shell/ShellContent.tsx` renders an
inert `<div data-slot="forecast" aria-hidden="true" />` inside its **located-state**
branch (shown only when a location is active). This slice replaces that placeholder
with a real `<ForecastSection/>` and adds a sibling `forecast.*` i18n namespace — it
touches no other shell file and does **not** edit the shared `app/page.tsx`
serialize point (§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email**. The only external dependency is the **keyless** Open-Meteo
forecast API (TC-STACK-03, NFR-COST-01) — no API key anywhere in the repo or the
bundle. Tests are **Vitest** only — pure unit tests, jsdom component tests, and a
route-handler integration test over a **mocked** `fetch` — **no Playwright**
(TC-STACK-05, ADR-0004). The per-slice "smoke" is a **service/integration smoke over
MOCKED Open-Meteo forecast payloads**, not a DB smoke. The Next.js 16 App Router
**Route Handler** boundary and the Server↔Client data path apply: read
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and
`06-fetching-data.md` before writing any handler / client-fetch code.

The locked conventions reused **verbatim**, not re-built:

- **The `add-city-search` Route Handler data path (THE Wave-3 reuse pattern,
  TC-DATA-01)** — `app/api/geocode/route.ts` is the template: a Next 16 `GET` doing
  the keyless server `fetch`, with the Open-Meteo URL/params living ONLY in the
  handler, zod-parsing via the pure `lib/<domain>`, and returning a typed minimal
  result that degrades honestly (never a raw 500). `add-forecast` mirrors this
  exactly with `app/api/forecast/route.ts` + `lib/forecast`.
- **The active-location state** — `lib/location/{types,validation,url}.ts` (pure,
  total, `Location = {lat, lon, name}`) and `components/providers/LocationProvider.tsx`,
  whose `useLocation() → {location, setLocation}` syncs `?lat=&lon=&name=`.
  City-search **writes** it; forecast **reads** it (the setter is not used here).
- **The comfort-score capability** — `comfortScore(daily): {value, rationale}`,
  `bandOf(value)`, `upcomingWeekend(days): UpcomingWeekend`, the `ComfortInput` shape
  (`lib/scoring/types.ts`), and the `ComfortBadge` + `WeekendHighlight` components.
  Forecast produces a `ComfortInput` per day and **renders comfort-score's
  components**, never re-implementing the scoring or the badge.
- **The shared inline error/empty primitive** — `components/ui/Notice.tsx`
  (`error` → `role="alert"`; `empty`/`info` → `role="status"`; calm i18n copy; no
  exclamation marks). Every forecast failure and the no-location state render a
  `<Notice>`, never a toast or 500.
- **i18n** — the `t("namespace.key")` dotted accessor (UK default → EN fallback →
  ""); add a `forecast.*` namespace, never reaching into `shell.*`. No runtime i18n
  library (NFR-I18N-01).
- **The dynamic-import pattern** — client-only widgets that pull heavy deps load via
  `dynamic(() => import(...), { ssr: false })` with a same-footprint skeleton
  (AGENTS.md module conventions, mirrored by the map plan for Leaflet).

## Goals / Non-Goals

**Goals:**

- Fetch the forecast in **one keyless request** asking for BOTH the daily and the
  hourly blocks once a location is active, pinning units + `timezone=auto`
  (FR-FORECAST-01, FR-FORECAST-03).
- Keep the **Open-Meteo forecast URL and response shape server-side** behind a Route
  Handler so the client bundle carries only the stable internal `Forecast` contract
  and no key is implied (TC-DATA-01, NFR-COST-01).
- **zod-parse both blocks before render**; a malformed payload is treated as a failed
  fetch, never rendered as partial data (FR-FORECAST-01).
- Render the **7 day cards** (weekday, hi/lo °C, weather icon + UA condition label,
  precip %, wind) each with a comfort-score **`ComfortBadge`**, the **`WeekendHighlight`**
  at the TOP, the **48 h Recharts hourly chart**, and **today's sunrise/sunset**
  (FR-FORECAST-02/03/04).
- **Re-fetch on location change** and **cache the last good response in memory tagged
  with its location** until the next switch; discard a late out-of-order response for
  a no-longer-active location (FR-FORECAST-05).
- Keep Recharts **out of the initial bundle** via a `next/dynamic` `ssr:false` import
  with a same-footprint skeleton (NFR-PERF-03).
- Degrade **every** failure (bad params, non-OK, network, malformed) to a calm inline
  Notice with a **silent console** on a healthy session (NFR-OBS-01); the handler
  never returns a raw 500.
- Produce a `ComfortInput` per day so comfort-score has a **single defined source**
  for every factor it scores (FR-COMFORT-02), and expose each `daily.time` as the
  location-local calendar date comfort-score uses to pick the weekend (FR-COMFORT-05).
- Keep the pure layer (`lib/forecast`) framework-free and 100% unit-testable
  (TC-PURE-01); React / DOM / `fetch` / Recharts concerns live only in the client
  components and the route handler.

**Non-Goals (explicit Exclusions — see the spec):**

- Forecast windows **beyond 7 days**, climate / historical analysis, marine /
  aviation / agriculture variables.
- **Background / scheduled / push-driven refresh** — refresh happens **only** on
  location change.
- **Persistence** to disk / cookies / localStorage / any server-side store — the
  cache is in-memory only (BC-PRIVACY-03, ADR-0003).
- Owning **comfort scoring or weekend highlighting** as logic — that is the
  `comfort-score` capability; this slice only feeds it data and renders its
  components.
- The **animated background** (owned by `add-animated-bg`, which CONSUMES the
  weather-code category this slice exposes — but renders nothing here).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom component tests.

## Decisions

### D1 — Data path: a server-side forecast Route Handler mirroring `app/api/geocode` (TC-DATA-01)

- **`app/api/forecast/route.ts`** is a Next 16 App Router **Route Handler** exporting
  an async `GET(request: Request)`. It reads `?lat=&lon=` from the request URL,
  performs the **keyless server-side** `fetch` to the Open-Meteo **forecast** API, and
  asks for BOTH blocks the downstream views need in **one** request:
  - `daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset`
    plus `cloud_cover_mean` (requested as a daily field when Open-Meteo serves it;
    where the daily mean is unavailable the parser derives it as `null` and
    comfort-score's neutral fallback covers it — never a fabricated value);
  - `hourly=temperature_2m` (spanning ≥ the next 48 h);
  - `temperature_unit=celsius`, `windspeed_unit=ms`, `timezone=auto`,
    `forecast_days=7`.
  It parses the upstream body with the pure `lib/forecast` zod schema, maps it to the
  typed `Forecast`, and returns `Response.json(result)`. The client
  `ForecastSection` calls **`/api/forecast?lat=<lat>&lon=<lon>`** — the internal,
  stable contract — and never sees the Open-Meteo forecast URL, params, or raw shape.
- **Why a Route Handler over a client-direct `fetch` to Open-Meteo (the core data
  decision, the SAME rationale `add-city-search` D1 established and this slice
  reuses):**
  1. **The upstream contract stays server-side (TC-DATA-01).** The Open-Meteo
     forecast endpoint, its (long) `daily`/`hourly` param lists, the unit pins, and
     its verbose response shape live in one server file behind the minimal internal
     `Forecast` DTO. The client bundle carries only `/api/forecast` + the `Forecast`/
     `DailyForecast`/`HourlyPoint` types — tuning the variable list later never
     touches the client.
  2. **No key implied in the bundle (NFR-COST-01).** Open-Meteo is genuinely keyless,
     but routing through the server keeps the established "external calls live
     server-side, parsed by zod before the UI" convention and leaves one auditable
     place where any header/key would ever be added — a review can assert zero keys
     reach the client.
  3. **One honest-degradation choke point (NFR-OBS-01).** zod validation, the non-OK
     branch, the network-error branch, and the bad-params branch all resolve in the
     handler to a **typed result**, so the client receives a uniform `Forecast` (or a
     small typed error) and never interprets a raw upstream body or an opaque CORS
     failure.
  4. **Same-origin, CORS-free, encoding-controlled.** The client hits a same-origin
     route; the handler validates/encodes `lat`/`lon` deterministically.
- **Trade-off:** a route handler adds one server hop (client → our route →
  Open-Meteo) versus a direct client fetch (one hop). For a per-location, on-change
  fetch the extra hop is negligible (Open-Meteo is the slow leg either way) and buys
  the four properties above; a direct client fetch would bake the Open-Meteo URL/shape
  + the long param list into the bundle, scatter the zod parse across the component,
  and expose a cross-origin call. Route Handlers are **not cached by default** in Next
  16 — correct for a per-location lookup (we do **not** set `dynamic = 'force-static'`).
- **`lat`/`lon` validation (honest degradation, NFR-OBS-01):** the handler parses
  `lat`/`lon` as finite numbers in range (`lat ∈ [-90,90]`, `lon ∈ [-180,180]`);
  **missing, non-numeric, or out-of-range** params → a typed result the client treats
  as "no fetch / degraded" **without** calling Open-Meteo (mirroring geocode's
  empty-`q` short-circuit). This guards against a tampered URL producing an unbounded
  or nonsense upstream request.
- **Handler honest-degradation contract (NFR-OBS-01):** the handler **never throws to
  a 500**. Concretely: bad/missing `lat`/`lon` → a typed result (no upstream call); a
  **non-OK** Open-Meteo status, a **thrown** fetch (network), a **200 body that fails
  the zod schema**, or a `.json()` that throws → a typed result the client maps to the
  calm error Notice (status chosen so the client `fetch` RESOLVES and reads the body,
  never an unhandled rejection, never partial data). The whole body is wrapped so no
  unexpected throw escapes as a raw 500. (See "Error handling strategy" for the exact
  typed shape.)

### D2 — Pure framework-free `lib/forecast`: zod parse of both blocks + transforms, total (TC-PURE-01)

- **`lib/forecast/types.ts`** — the internal contract crossing the Server↔Client
  boundary, the single source of truth shared by the handler and the client:
  - `DailyForecast` carries **everything `comfortScore` needs as a `ComfortInput`**
    (so the mapping is a near pass-through, FR-COMFORT-02) **plus** the display fields
    the cards need:
    `{ time: string;                 // "YYYY-MM-DD" local calendar date (timezone=auto)
        weatherCode: number | null;  // Open-Meteo weather_code (display icon + label)
        tempMax: number | null;      // temperature_2m_max  (°C, display hi)
        tempMin: number | null;      // temperature_2m_min  (°C, display lo)
        apparentHigh: number | null; // apparent_temperature_max (comfort)
        apparentLow: number | null;  // apparent_temperature_min (comfort)
        precipProbability: number | null; // precipitation_probability_max 0..100 (display + comfort)
        windMax: number | null;      // wind_speed_10m_max (m/s, display + comfort)
        cloudCover: number | null;   // cloud_cover_mean 0..100 (comfort)
        uvIndex: number | null;      // uv_index_max (comfort)
        sunrise: string | null;      // ISO local time (display, today only)
        sunset: string | null }`     // ISO local time (display, today only)
  - `HourlyPoint = { time: string; temperature: number | null }`.
  - `Forecast = { days: DailyForecast[]; hourly: HourlyPoint[] }` — `days` is 1..7
    (chronological; a short array renders the days it has, per spec), `hourly` is the
    next-48 h slice.
  - `ForecastResult` — the handler's response contract: `{ forecast: Forecast }` on
    success / a typed error shape (e.g. `{ error: "failed" }`) on a non-OK upstream /
    network / zod failure / bad params. (See Error handling.)
  - A small `toComfortInput(day: DailyForecast): ComfortInput` mapper (the only place
    the daily→comfort field names are bridged): `{ time, apparentHigh, apparentLow,
    precipProbability, windSpeed: windMax, cloudCover, uvIndex }`. The `ComfortInput`
    type is imported from the locked `lib/scoring/types.ts` (the cross-capability
    contract); forecast does NOT redefine it.
- **`lib/forecast/validation.ts`** — the **zod schema for the Open-Meteo forecast
  response**, covering BOTH blocks, and a **total** parse. The upstream `daily` block
  is **column-oriented** (parallel arrays keyed by index against `daily.time`); the
  schema validates each as an array of nullable numbers / strings of matching length,
  then the parser **zips** them per index into `DailyForecast[]`. The `hourly` block
  is likewise `{ time: string[]; temperature_2m: (number|null)[] }`. Following the
  locked `lib/search`/`lib/location` `.safeParse` discipline the parse is **total**: a
  malformed / partial / non-object body, or a body whose top-level shape fails the
  schema, maps to a typed empty/again (or a typed "malformed" signal the handler turns
  into an error) and **NEVER throws** to the UI. A **missing/absent hourly block, a
  non-array hourly, or non-numeric hourly entries** fail validation and the whole
  response is rejected like any failed fetch (spec: the hourly block is validated
  before the daily cards render). A schema-valid body whose `daily.time` is **empty**
  (zero days) is surfaced so the client shows the degraded state (no day to render,
  per spec) rather than an empty grid. A short daily array (1..6 days) is **valid** and
  yields that many `DailyForecast`s. Per-day nullable fields (a missing
  precip/cloud/uv for a day) become `null` (not dropped, not zero) so the card can
  show a neutral placeholder and comfort-score's neutral fallback applies.
- **`lib/forecast/weather-code.ts`** — a pure `describeWeather(code: number | null):
  { icon: WeatherIconName; labelKey: ForecastMessageKey; category: WeatherCategory }`
  mapping the Open-Meteo WMO `weather_code` to (a) a stable icon **name** (a
  `lucide-react` icon key the card resolves — the lib stays DOM-free, returning only a
  name string), (b) an i18n **key** for the short Ukrainian condition label (the lib
  returns the KEY, the card calls `t()` — NFR-I18N-01, so the lib has no copy), and
  (c) a day/night-**agnostic** category (`clear | cloudy | fog | drizzle | rain | snow
  | thunder`) the later `add-animated-bg` slice will consume. **Total:** an unknown,
  out-of-range, or `null` code maps to a neutral default (e.g. `cloudy` / a generic
  label key / a generic icon) so no card breaks on an unexpected code. WMO groups
  (0 clear; 1-3 mainly clear→overcast; 45/48 fog; 51-57 drizzle; 61-67 rain; 71-77
  snow; 80-82 rain showers; 85/86 snow showers; 95-99 thunderstorm) are mapped per the
  documented table.
- **`lib/forecast/hourly.ts`** — a pure `nextHours(hourly: HourlyPoint[], count = 48,
  now?: number): HourlyPoint[]` that slices the next `count` hours **from now** out of
  the parsed hourly arrays. `now` is an **injected** parameter (default
  `Date.now()`); passing it explicitly keeps the function deterministic in unit tests
  (TC-PURE-01 forbids hidden clock reads in the pure layer — the default is the only
  concession and tests always inject). When fewer than `count` future points exist it
  returns the ones it has (spec: fewer-than-48 still renders). Comparison uses the
  point's local `time` parsed via a fixed `Date.parse` of the ISO local string (no
  `toISOString`, no viewer-TZ recompute) consistent with the comfort-score date
  discipline.
- **Trade-off:** keeping the zod parse, the column→row zip, the weather-code table,
  and the hourly slice in a framework-free module (rather than inline in the handler
  or the component) makes them **unit-tested deterministically** against a real-ish
  forecast payload and against malformed/empty/short inputs without a server or jsdom
  (TC-PURE-01), and the same validator is reused by the handler and any future server
  caller (weekend-compare will fetch the same shape). The cost is a few extra module
  boundaries, which the locked module convention already mandates.

### D3 — Client `ForecastSection`: client-driven fetch + in-memory location-tagged cache (FR-FORECAST-05, the ARCHITECTURE LESSON)

- **`components/forecast/ForecastSection.tsx`** is marked **`"use client"`**: it
  needs `useState`/`useEffect`/`useRef`, `fetch`, and `useLocation()` — and, per the
  **ARCHITECTURE LESSON** (current-state), anything depending on the active location
  MUST be client-driven, because `app/page.tsx` is statically prerendered and a
  server component would bake build-time/server-tz values. It fills the ShellContent
  forecast slot (D7) and reads `useLocation()` for the **location only** (not the
  setter).
- **Fetch on location change (FR-FORECAST-05):** an effect keyed on the active
  location's identity fires a `fetch` to **`/api/forecast?lat=&lon=`** (NEVER
  Open-Meteo directly) whenever the location changes. **No location active** → no
  fetch, the calm empty/no-location Notice (spec: a location must be selected first;
  no request, no never-resolving spinner). A `loading` state shows a calm Notice/skeleton
  while a fetch for a newly selected location is in flight.
- **In-memory, location-tagged cache (the spec's dedicated requirement):** the last
  **successful, schema-valid** `Forecast` is held in component state **tagged with the
  location identity it belongs to** (`{lat, lon}` rounded to a stable key). The cache
  is **in-memory only** — no cookies, no localStorage, no server store (ADR-0003).
  Concretely:
  - Every in-flight request captures the location identity it was issued for. When a
    response resolves, it is **rendered/cached only if** its identity still equals the
    currently active location. A response that resolves for a **no-longer-active**
    location (a quick A→B→A switch where B resolves after A is active again) is
    **discarded** — not cached, not rendered (the spec's late-out-of-order scenario).
  - While a re-fetch for a newly selected location B is in flight, A's cached forecast
    is **never** shown under B; the view shows B's loading/degraded state. Once B's
    validated response arrives it **supersedes** A's cache.
  - If B's fetch **fails**, the view shows B's degraded Notice and A's cache is **not**
    shown under B (no cross-location stale data). (A transient failure for the *same*
    location MAY keep showing that location's cache, per spec "Cached forecast covers a
    transient failure".)
  - Guarded with **both** an `AbortController` (abort the previous in-flight request on
    a new location) **and** a captured **location identity** compared on resolve —
    belt-and-braces so an aborted request's late resolution still can't write the wrong
    location's data (the same latest-wins discipline `SearchBox` uses).
- **Render order (FR-FORECAST-02/03/04):** when a valid `Forecast` is present,
  `ForecastSection` renders, in order:
  1. **`WeekendHighlight`** at the TOP — fed `upcomingWeekend(days.map(d =>
     ({ time: d.time, value: comfortScore(toComfortInput(d)).value })))` from
     comfort-score (the section computes the per-day comfort value once and reuses it
     for both the weekend summary and the per-card badge).
  2. A grid of **`DayCard`** — one per `days[]` entry (1..7, chronological): weekday
     name derived from the local `time` date, hi/lo °C, the weather icon + UA
     condition label (from `describeWeather` + `t(labelKey)`), precip probability %,
     wind (m/s), and a **`ComfortBadge value={comfortValue}`** for that day. (DayCard
     is detailed in D's "Day cards".)
  3. The **`HourlyChart`** — the dynamically-imported 48 h Recharts line chart fed
     `nextHours(forecast.hourly, 48)` (D5).
  4. **Today's sunrise + sunset** — small text under the chart, from `days[0].sunrise`
     / `days[0].sunset` formatted for the UA UI; a `null` value is omitted/labelled
     calmly ("—"), never an error (FR-FORECAST-04).
- **States** all use the shared `<Notice>` (honest degradation, NFR-OBS-01): no
  location → empty/info Notice; loading → a calm busy state (skeleton or a quiet
  status); error → error Notice (Ukrainian, from `forecast.*`, no `!`). The console
  stays silent on a healthy session: the effect aborts the in-flight request and
  ignores a stale resolution on unmount / location change (no "state update on
  unmounted component"), and caught errors are **rendered**, never logged.
- **Trade-off:** holding the cache + identity in component state (vs a module-level
  cache or a data library like SWR) keeps the slice dependency-free and the
  location-tagging explicit and unit-testable in jsdom, and matches the "in-memory
  only, no persistence" mandate; the cost is hand-managing the abort + identity guard
  (which the jsdom test drives explicitly by resolving responses out of order). A
  module-level cache would risk leaking across remounts and is unnecessary for a
  single on-screen section.

### D4 — Honest degradation: every failure is a calm inline Notice, never a toast/500 (NFR-OBS-01)

- The section reduces every outcome to one **inline** UI state, reusing the shared
  `components/ui/Notice.tsx`: (a) **forecast** — the weekend highlight + cards + chart
  + sun times; (b) **no location** — a calm empty/info Notice (a location must be
  chosen first), shown without any fetch; (c) **loading** — a calm busy state for a
  newly selected location; (d) **error** — an error Notice for a network error, a
  non-OK handler response, a malformed/zod-failed payload, **or an empty/zero-day
  forecast** (no day to render), with the rest of the page interactive. There is **no
  toast** anywhere and **no path** that surfaces a raw 500 or an uncaught exception.
- The **route handler** (D1) is the first line: bad params, a non-OK upstream, a
  network throw, a zod failure, or a `.json()` throw all resolve there to a typed
  result, so the client's `fetch` always resolves to a readable body and branches on
  the typed shape — no unhandled rejection, no opaque body to misread.
- **zod is the gate (the spec's payload contract).** The Open-Meteo body is parsed by
  the `lib/forecast` schema — **both** the daily and the hourly blocks — **before** any
  card or chart exists; a 200 whose body fails the schema (including a missing/malformed
  **hourly** block) is treated **exactly like a failed fetch** — discarded, error
  Notice shown, never rendered as partial data. A schema-valid response with **zero**
  daily days is surfaced as the degraded state (no empty grid, no fabricated day). A
  **short** daily array (1..6) is valid and renders the days it has.
- **Per-value calm rendering (FR-FORECAST-02):** the card formatters are total — a
  `null`/absent precip → a neutral placeholder ("—"), distinct from a present `0` →
  "0%"; temperature rounds to whole °C (round half away from zero) and wind to whole
  m/s by the same rule; an **extreme** value (e.g. -59°C, 212 m/s) is rounded and shown
  without overflow, no throw, no console warning. Unit labels come from `forecast.*`
  (no hardcoded unit text in the card, NFR-I18N-01).
- **Console silence (NFR-OBS-01):** on a healthy session (successful fetch, render)
  **no** warning or error is emitted; the effect cleans up its abort controller and
  ignores stale resolutions on unmount/location-change, caught errors are rendered not
  logged, and the dynamically-imported chart renders under jsdom (ResizeObserver is
  mocked in `vitest.setup.ts`) without warning.
- **Trade-off:** reusing the single shared `Notice` (vs a bespoke forecast-error UI)
  keeps the calm tone, the a11y roles, and the no-exclamation copy consistent app-wide
  — the "build the inline-error pattern once, reuse everywhere" mandate; the cost is
  that the loading/error/no-location copy must read well in the forecast context,
  which the `forecast.*` overrides handle and the eval grades.

### D5 — Dynamically-imported, client-only Recharts chart (NFR-PERF-03)

- **`components/forecast/HourlyChart.tsx`** is a SEPARATE component that imports
  Recharts and renders the 48 h temperature `LineChart` (a `ResponsiveContainer` +
  `LineChart` + `Line` + axes + tooltip). `ForecastSection` loads it via
  **`const HourlyChart = dynamic(() => import("./HourlyChart"), { ssr: false,
  loading: () => <ChartSkeleton/> })`** so **Recharts is never in the initial bundle
  and never runs on the server** — the locked dynamic-import pattern (AGENTS.md,
  mirrored by the map plan for Leaflet). The `ChartSkeleton` has the **same footprint**
  (fixed height/aspect) as the chart so swapping it in causes **no layout shift**
  (CLS).
- The chart plots temperature in **°C** against time, formats axis/tooltip values by
  the integer-degree rule (D4), is readable on the smallest viewport (a responsive
  container with sensible min height), and exposes an **accessible name** (from
  `forecast.chartLabel`) so the trend is not an unlabeled image (the spec's a11y
  scenario). Fewer than 48 points still plots (spec), and a chart fed an empty/short
  series renders calmly without a console warning.
- **Why `ssr: false` + a same-footprint skeleton (the ADR-worthy perf decision):**
  Recharts is a heavy client-only charting lib; server-rendering it is pointless
  (there is no server data — the forecast is client-fetched per D3) and shipping it in
  the initial bundle would blow the ≤ 200 KB budget (NFR-PERF-03). Loading it lazily,
  client-only, behind the section means the initial page payload excludes Recharts and
  the chart hydrates after the (client-fetched) data exists. The skeleton's matched
  footprint protects CLS while the chunk loads.
- **Trade-off:** the lazy chunk means a brief skeleton before the chart paints (vs an
  eagerly-bundled chart that would inflate the initial JS and still has no data to draw
  server-side). For a below-the-fold trend chart the skeleton is the right trade; the
  cost is one extra dynamic boundary + a skeleton component, which the locked pattern
  already prescribes. The chart is tested in jsdom by importing `HourlyChart` directly
  (bypassing `dynamic`) and asserting it renders the series + accessible name with the
  mocked ResizeObserver.

### D6 — i18n: a `forecast.*` namespace; weekday names via the documented choice

- Add a **`forecast.*`** namespace to `lib/i18n/uk.ts` + `en.ts` (sibling to the
  others, never reaching into `shell.*`) carrying every user-visible string: the
  section / region accessible labels, the **weekday names**, the **weather-code
  condition labels** (keyed so `describeWeather` returns a key and the card calls
  `t()`), the **"sunrise"/"sunset"** labels, the **unit labels** (`°C`, the m/s wind
  label, `%`) and the **minus glyph**, the **precipitation placeholder** ("—"), the
  **chart accessible name**, and the **loading / error / no-location** copy. Calm tone,
  **no exclamation marks** (BC-BRAND-01, enforced across both locales by the existing
  `lib/i18n/i18n.test.ts` sweep).
- **Weekday names — decision:** weekday labels come from the **i18n dictionary** (a
  `forecast.weekday.*` set of 7 short Ukrainian labels indexed by the day-of-week
  derived from the local `time` date), **not** from `Intl.DateTimeFormat`. Rationale:
  (1) the project mandate is **centralised, hand-authored Ukrainian strings with no
  runtime i18n library** (NFR-I18N-01) — `Intl` locale data is environment-dependent
  and would bypass the centralised dictionary the i18n test guards; (2) the day-of-week
  is derived from the **location-local `time` date** via the SAME fixed-`Date.UTC`
  parse comfort-score uses (no `toISOString`, no viewer-TZ recompute — AGENTS.md), so
  the label is the location's weekday, reproducibly. The card indexes
  `forecast.weekday[weekdayIndex]`. (Trade-off: a small hand-maintained 7-entry table
  vs `Intl` — chosen for determinism, central control, and test-guarded tone; the cost
  is seven extra keys, trivial.)
- **Trade-off:** owning a fresh `forecast.*` namespace (vs reusing another) keeps the
  slice's copy in its own domain per the locked convention and lets the forecast copy
  read well in context (graded by the eval); the small cost is a few keys.

### D7 — Fill the ShellContent forecast slot (§3a, not an app/page.tsx edit)

- Replace the inert `<div data-slot="forecast" aria-hidden="true" />` in
  `components/shell/ShellContent.tsx` (inside the **located-state** branch, rendered
  only when a location is active) with the real **`<ForecastSection/>`**, preserving
  the surrounding responsive grid region (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`)
  and the sibling `map` / `compare` slot placeholders (owned by later waves). This is
  the shell's **own** located-state region — **not** an edit to the shared
  `app/page.tsx` serialize point (§3a). `ForecastSection` decides its own column span
  within that grid (the daily grid + chart are wider content; it MAY span columns) and
  renders the empty/loading/error Notice states within the region.
- Because the slot lives in the **located** branch, `ForecastSection` is only mounted
  once a location is active — but it still guards its own no-location state (the safe
  `useLocation()` default returns `null` outside a provider, and the located branch is
  the normal mount point), so it never assumes a location and never fetches without
  one.
- **Trade-off:** editing `ShellContent.tsx` (vs a brand-new top-level slot) is the
  intended design — the shell created the inert slot specifically so this slice fills
  it; `ShellContent` is the shell's own slot host, not a multi-slice serialize point
  the way `app/page.tsx` is, so a one-file swap is correct and minimises churn.

## Data model

No persistent data, no DB, no schema (ADR-0003). State is ephemeral: the active
location lives in the **URL** (`?lat=&lon=&name=`, owned by the locked
LocationProvider); the forecast's last-good response and transient fetch state live
**in-memory in the component** (D3), tagged with the location identity. The
**internal data contract** (what crosses the Server↔Client boundary) and the
in-component state:

- **`DailyForecast`** / **`HourlyPoint`** / **`Forecast`** (`lib/forecast/types.ts`)
  — defined in D2; the minimal typed projection of the Open-Meteo forecast response,
  the only shape the client knows. `DailyForecast` carries the comfort factors
  (`apparentHigh`, `apparentLow`, `precipProbability`, `windMax`, `cloudCover`,
  `uvIndex`, `time`) **and** the display fields (`weatherCode`, `tempMax`, `tempMin`,
  `precipProbability`, `windMax`, `sunrise`, `sunset`).
- **`ForecastResult`** — the route handler's response: `{ forecast: Forecast }` on
  success / a small typed error shape (e.g. `{ error: "failed" }`) on a non-OK
  upstream / network / zod failure / bad params. (An empty-day forecast is surfaced so
  the client shows the degraded state.)
- **`ComfortInput`** — imported from the locked `lib/scoring/types.ts`;
  `toComfortInput(day)` is the one mapping point (`windMax → windSpeed`, the rest
  pass-through by name).
- **In-component (`ForecastSection`):** `forecast: Forecast | null`; `cacheKey:
  string | null` (the location identity the cached `forecast` belongs to); `status:
  "idle" | "loading" | "ready" | "error"`. Plus refs: the in-flight `AbortController`
  and the captured request location identity (for the discard-on-stale guard).

The pure surface (`lib/forecast`): the zod **forecast-response schema** (both
blocks), the **total parse** `parseForecast(body: unknown): ForecastResult-like`
(malformed/empty → typed empty/again, never throws), `describeWeather(code)` (total),
`nextHours(hourly, count, now?)` (pure), and `toComfortInput(day)` (pure).

## Error handling strategy

- **Two layers, both calm (NFR-OBS-01).** The **route handler** (D1) collapses every
  server-side fault to a typed result: bad/missing `lat`/`lon` → a typed result with
  no upstream call; non-OK Open-Meteo / network throw / `.json()` throw / zod-failed
  body → a typed error body. It **never** lets an exception escape as a raw 500 (the
  whole body is guarded). The **client** (D4) maps the typed result to an inline
  state: `{ forecast }` (render) or the typed error (error Notice). A `fetch` rejection
  on the client side (e.g. the route itself unreachable) is caught and shown as the
  same calm error Notice.
- **Typed result shape (the precise contract):** the handler returns
  `Response.json({ forecast } satisfies ForecastResult)` on success, or
  `Response.json({ error: "failed" } satisfies ForecastResult)` on any failure path,
  always with a **client-readable status** (200, so the client `fetch` resolves and
  reads the typed body — never an unhandled rejection). A schema-valid-but-**zero-day**
  forecast is returned as `{ error: "failed" }` (no day to render → degraded), matching
  the spec's "empty daily array degrades to the failed-fetch state".
- **zod is the gate (the spec's payload contract).** The Open-Meteo body is parsed by
  the `lib/forecast` schema — **both** blocks — before any value exists; a body that
  fails (including a missing/malformed **hourly** block, wrong-type daily columns, or
  mismatched column lengths) is treated **exactly like a failed fetch**. An absent
  per-day nullable field (precip/cloud/uv) is **valid** and becomes `null` (neutral
  placeholder + comfort neutral fallback), NOT a failure.
- **Location-tagged latest-wins (D3).** A response that resolves for a no-longer-active
  location is discarded (abort + identity guard), so a stale/late response never shows
  the wrong location's data or overwrites the current one.
- **Untrusted URL params** for the active location are already handled by the locked
  `lib/location` validation (non-numeric / out-of-range / comma-decimal / oversized
  `name` → `null`, calm empty state, no throw); this slice relies on that for the
  location it reads and adds the handler's own `lat`/`lon` bounds check as defence in
  depth for the route.

## Risks / Trade-offs

- **Key/URL leaking to the client (highest, TC-DATA-01/NFR-COST-01):** a
  client-direct Open-Meteo fetch would bake the forecast URL + long param list into
  the bundle and scatter parsing/error handling. Mitigation — the **Route Handler**
  (D1): the client only knows `/api/forecast` + the `Forecast` types; a review/grep
  asserts no `api.open-meteo.com` host and no key in the client bundle. The
  route-handler integration test drives it over a **mocked** Open-Meteo forecast
  `fetch`.
- **Silent partial data on a malformed 200 (NFR-OBS-01):** rendering an unvalidated
  body could show broken cards or a chart against an unvalidated hourly block.
  Mitigation — **zod parse of BOTH blocks before render** (D2); a 200 that fails the
  schema (including a bad hourly block) is treated as a failed fetch. Unit tests feed
  a real-ish payload (→ mapped `Forecast`), and malformed / empty-day / short / bad-
  hourly payloads (→ typed empty/error).
- **Wrong location's data shown after a quick switch (FR-FORECAST-05):** overlapping
  on-change fetches could attribute B's late response to A. Mitigation — the
  **location-tagged in-memory cache + abort + identity guard** (D3); a jsdom test
  resolves B's response **after** the user switches back to A and asserts B's data is
  discarded (A's forecast stands), and asserts A's cache is **not** shown under B when
  B's fetch fails.
- **Recharts in the initial bundle / SSR / CLS (NFR-PERF-03, NFR-PERF-02):** eagerly
  bundling or server-rendering Recharts would inflate the initial JS and risk layout
  shift. Mitigation — **`dynamic(..., { ssr:false })` + a same-footprint skeleton**
  (D5); the build output is inspected to confirm Recharts is in a lazy chunk, not the
  initial bundle, and the skeleton matches the chart footprint (no CLS).
- **Date/weekday from the viewer's clock instead of the location (FR-COMFORT-05,
  AGENTS.md):** computing the weekday from `new Date().getDay()` or
  `toISOString().slice(0,10)` would show the visitor's date, not the location's.
  Mitigation — every day-bound value (weekday label, weekend selection, hourly "from
  now") derives from the location-local `time` date via the **fixed-`Date.UTC` parse**
  comfort-score uses (timezone=auto pins each `daily.time` to the location's local
  date); the pure `nextHours` takes `now` as an injected param so tests are
  deterministic.
- **Extreme/odd values breaking the card (spec):** a -60°C or a 200+ m/s wind, or a
  `null` precip, could overflow or render misleadingly. Mitigation — **total
  formatters** (round half away from zero to whole units; `null` → "—" distinct from
  "0%"; layout that does not overflow); a unit test feeds extremes + nulls and asserts
  calm output, no throw, no console warning (D4).
- **Console noise on unmount / location change:** an un-aborted fetch resolving after
  unmount warns about state updates on an unmounted component. Mitigation — the effect
  aborts the in-flight request and ignores a stale resolution on cleanup (D3); the
  healthy-session test asserts the console stays clean.
- **Copy quality (the delivery bar, eval ≥ 90):** the loading / error / no-location
  copy is graded, not just asserted. Mitigation — calm, blame-free Ukrainian in
  `forecast.*` (D6); a browser-free eval case grades the failure/empty/loading copy
  against the rubric, targeting every dimension ≥ 90.
- **Scope creep:** the temptation to add a >7-day window, a background refresh,
  persistence, or to re-implement the comfort badge is resisted — those are explicit
  **Exclusions** / owned by other capabilities; this slice fetches + renders the
  7-day/48 h/sun view and feeds comfort-score's components (D1–D7).

## ADR note

The **server-side Route Handler data path** (D1) is a faithful **reuse** of the
pattern `add-city-search` D1 established (geocoding goes through `app/api/geocode` so
the upstream URL/shape and any key stay server-side, TC-DATA-01) — `add-forecast`
applies the identical pattern to the forecast endpoint, so it introduces **no new
architectural decision** beyond what is already accepted (ADR-0003 keyless/stateless
+ the AGENTS.md module convention "external calls live server-side, parsed by zod
before the UI"). The **client-driven fetch off `useLocation()`** (D3) is the
**ARCHITECTURE LESSON** already recorded in `docs/current-state.md` (location-dependent
work must be client-driven because `app/page.tsx` is statically prerendered) — also
not a new decision, an applied one. The one decision worth flagging as potentially
ADR-worthy is **the `dynamic(ssr:false)` + same-footprint-skeleton policy for heavy
client-only viz libs (Recharts here, Leaflet in `add-map`)** as the standing way to
keep the initial bundle within NFR-PERF-03 — but it is already prescribed by the
AGENTS.md module conventions and the map plan, so this design section documents it
rather than mandating a standalone ADR.
