# Current State — Weather Explorer

> Persistent handoff. Update at every milestone. Source of truth is code/specs/
> tests — if this conflicts, verify and fix this file.

- **Last updated:** 2026-06-27 00:08 (Europe/Kyiv)
- **Phase:** 4 in progress — 8/9 slices DONE & archived (app-shell, comfort-score,
  top-clock, bottom-jokes, city-search, forecast, map, animated-bg — each review-gate
  CLEAN). animated-bg review FIXED a real FR-ANIM-02 bug (day/night now follows the
  LOCATION's `utc_offset_seconds`, not the viewer's clock). 509 tests green. LAST slice:
  weekend-compare (spec ✅). Then Phase 5 + Phase 6 eval-suite (≥90 goal) + Phase 7.
  Eval grading of all per-slice eval cases happens together in Phase 6 (eval-suite,
  threshold 90).
- map added: `app/api/reverse-geocode` (Nominatim, ADR-0005) + client-only Leaflet
  (dynamic ssr:false). NOTE for later slices: `lib/location/url.ts serialize()` now
  emits PLAIN decimal (no exponent) so any coord round-trips DOT_DECIMAL; Leaflet
  marker icons are SAME-ORIGIN; `next.config.ts` now sets CSP + security headers.
- **Delivery goal:** every eval dimension ≥ 90 (Gate G6), driven in a loop.

### add-forecast conventions (LOCKED — Wave 4+ slices reuse these)
- **i18n:** `forecast.*` namespace in `lib/i18n/{uk,en}.ts` (sibling to others).
  `forecast.weekday.{0..6}` (0=Sun..6=Sat, indexed off the location-local `time`
  date via a fixed `Date.UTC` parse), `forecast.condition.*` (weather-code labels,
  incl. `unknown` fallback), `forecast.unit.{celsius,wind,percent}` + `forecast.minus`
  + `forecast.precipPlaceholder` ("—"), `forecast.{sunrise,sunset,chartLabel,
  sectionLabel}`. EVAL-GRADED copy: `forecast.{loading,error,noLocation}` (≥ 90).
- **Data path (TC-DATA-01, the SAME pattern as geocode):** `app/api/forecast/route.ts`
  — a Next 16 `GET(?lat=&lon=)` doing the KEYLESS server-side `fetch` to
  `https://api.open-meteo.com/v1/forecast` (URL + the long `daily`/`hourly` param
  lists + unit pins live ONLY there: `temperature_unit=celsius`, `windspeed_unit=ms`,
  `timezone=auto`, `forecast_days=7`), `AbortSignal.timeout`, zod-parses BOTH blocks
  via `lib/forecast`, returns typed `{ forecast }` / `{ error: "failed" }` (status
  200, NEVER a raw 500: bad/missing/out-of-range lat|lon short-circuit with no
  upstream call; non-OK / thrown / `.json()` throw / zod-fail / zero-day all → typed
  error). NOT cached. Build verified: `/` STAYS static; NO `open-meteo` host/key in
  `.next/static`; **Recharts is in a LAZY chunk** (registered in the page
  react-loadable-manifest, ABSENT from build-manifest initial chunks + rootMainFiles).
- **Pure layer:** `lib/forecast/{types,validation,weather-code,hourly,format}.ts`
  (framework-free, TC-PURE-01). `parseForecast(body): ForecastResult` TOTAL (column→row
  zip; malformed/empty-hourly/zero-day → `{error:"failed"}`, never throws; short 1..6
  days valid; absent per-day value → `null`; `cloud_cover_mean` optional).
  `describeWeather(code)` → `{icon (lucide name), labelKey (forecast.condition.*),
  category}` TOTAL (unknown/null → neutral default). `nextHours(hourly,count=48,now?)`
  pure (injected `now`, fixed-UTC parse). `toComfortInput(day)` → exact `ComfortInput`
  (`windMax→windSpeed`). `roundAwayFromZero`/`localWeekday` (format).
- **`DailyForecast` shape** (`lib/forecast/types.ts`) carries the comfort factors +
  display fields — the shape `add-weekend-compare` reuses. The **`weather-code`
  category** (`clear|cloudy|fog|drizzle|rain|snow|thunder`) is the contract
  `add-animated-bg` consumes (day/night-agnostic).
- **UI:** `components/forecast/{ForecastSection,DayCard,HourlyChart}.tsx`. ForecastSection
  (`"use client"`) reads `useLocation()` (location only), fetches `/api/forecast` on
  location change, holds an in-memory location-tagged cache (single slot, `{lat,lon}`
  rounded key) with `AbortController` + captured-identity latest-wins discard (A→B→A
  late B is dropped; A's cache never shown under B). Render order: WeekendHighlight
  (top) → 7-card `day-grid` → dynamically-imported (`dynamic(ssr:false)`) HourlyChart
  → today's sunrise/sunset. States via `<Notice>` (no-location=info/status, error=alert,
  loading=quiet skeleton — NO role, so it never collides with the located-state
  `queryByRole("status")` shell test). data hooks: `data-slot` `forecast`/`day-card`/
  `day-grid`/`weekend-highlight`/`hourly-chart`, `data-testid="hourly-chart"`. Fills
  the ShellContent forecast slot (the `<section data-slot="forecast">` IS the slot —
  `app/page.tsx` UNTOUCHED). Client-driven per the ARCHITECTURE LESSON.
- forecast A→B→A discard test: the leak sentinel was corrected to a non-colliding
  value (B `tempMax:88`) so it no longer false-positives on A's legitimate "30%"
  precip; 356/356 green, no test weakened.

### add-animated-bg conventions (LOCKED — Wave 5+ slices reuse these)
- **Shared `WeatherContext` (D1, ADR-WORTHY cross-slice integration):**
  `components/providers/WeatherProvider.tsx` (`"use client"`) exposes
  `useWeather() → { weather: WeatherSnapshot, publish }`, where `WeatherSnapshot =
  { todayCategory: WeatherCategory|null, sunrise: string|null, sunset: string|null,
  isLoaded: boolean }` (`WeatherCategory` IMPORTED from `lib/forecast/weather-code.ts`,
  never redefined). In-memory ONLY (ADR-0003) — NO fetch, NO persistence; a passive
  relay from the forecast that already fetched (the `forecast` capability owns the ONLY
  weather fetch, TC-DATA-01/NFR-COST-01). `useWeather()` returns the not-loaded default
  (`{null,null,null,false}` exported as `NOT_LOADED_WEATHER`) outside a provider and as
  the initial value; `publish` is latest-wins (replace, no merge). Mounted ONCE in
  `app/layout.tsx` INSIDE `LocationProvider`, wrapping `{children}`, so it spans BOTH
  the `<WeatherBackground/>` and `<ShellContent/>`/`<ForecastSection/>` siblings.
  `app/page.tsx` UNTOUCHED. **FLAG: this is the ADR-worthy decision** (who owns the
  fetch + how decorative consumers read derived weather without a duplicate request).
- **Pure layer `lib/animated-bg/{day-night,scene}.ts`** (framework-free, TC-PURE-01,
  total, never throws): `isDaytime(now: Date|number, sunrise, sunset, utcOffsetSeconds?):
  boolean` — decides day/night in the active location's frame by shifting the ABSOLUTE
  instant by the LOCATION's `utcOffsetSeconds` (Open-Meteo) and comparing TIME-OF-DAY
  (minutes since local midnight) against the sun strings' time-of-day (so a calendar-date
  mismatch can't flip it); inclusive at sunrise, exclusive at sunset. NEVER the viewer's
  `getHours()`/timezone — a cross-timezone viewer ("explore another city") sees the
  LOCATION's day/night (FR-ANIM-02; the review-gate fixed a prior viewer-clock bug here).
  `utcOffsetSeconds` null/missing/non-finite OR null/malformed sun → `true` (day). A 4th
  optional arg: omitted → it reads the passed instant's LOCAL components (the injected-
  `Date` unit-test back-compat path). `conditionToScene(category): { gradient:
  GradientKind, particle: ParticleKind }` — `clear→none`, `cloudy/fog→clouds`,
  `drizzle/rain/thunder→rain`, `snow→snow`, unknown/null/undefined → neutral default
  `{ gradient:"clear", particle:"none" }` (gradient only). `ParticleKind = rain|snow|
  clouds|none`; `GradientKind = clear|cloudy|fog|storm`.
- **`WeatherBackground` (`components/shell/WeatherBackground.tsx`, `"use client"`)** fills
  the shell bg slot (replaces the inert stub; `app/page.tsx` untouched). A fixed
  `inset-0 -z-10` layer, `pointer-events:none` + `aria-hidden="true"` + NO focusable
  children (FR-ANIM-04, NFR-A11Y-01); consumes `useWeather()`; renders the day OR night
  base gradient by `isDaytime` (`data-gradient="day|night"`) tinted by the scene kind,
  and exactly one particle family (`data-particle="rain|snow|clouds"`, none for clear)
  as a small FIXED count of CSS-keyframe nodes (`app/globals.css`
  `animated-bg-{rain,snow,cloud}-*` — transform/opacity only; NO canvas/WebGL, NO new
  dep, NFR-PERF-03). Under `prefers-reduced-motion: reduce` (JS `matchMedia` read,
  guarded) it OMITS the particle nodes entirely (static gradient only, day/night still
  applies) with a CSS `@media` backstop. The ABSOLUTE "now" (`Date.now()`, passed to
  `isDaytime` with the snapshot's `utcOffsetSeconds`) + reduced-motion are CLIENT
  mount-reads deferred one microtask (the locked TopClock D2 pattern, NOT a synchronous
  setState-in-effect); a ~60s `setInterval` re-samples `now` so a long-lived session
  transitions day↔night as the LOCATION crosses sunrise/sunset (resync, cleared on
  unmount, no re-fetch). Not-loaded snapshot → calm neutral DAY gradient, no effect,
  console silent (NFR-OBS-01). a11y: the layer is `aria-hidden` ONLY — NO `aria-label`/
  `role` (a label on an aria-hidden node is dead; `shell.background.label` is left unused
  in the dictionary).
- **`WeatherSnapshot` carries `utcOffsetSeconds?: number|null`** (the LOCATION's offset)
  — OPTIONAL, published on the LOADED snapshot only; `NOT_LOADED_WEATHER` stays the
  minimal 4-key default (its day-fallback state needs no offset, and keeping it 4 keys
  preserves the provider's exact-shape `toEqual` contract tests). `lib/forecast/{types,
  validation}.ts` ADDITIVELY capture top-level `utc_offset_seconds` (timezone=auto) onto
  `Forecast.utcOffsetSeconds` (number|null; parse stays total — absent → null; the
  upstream key stays server-side, only the DTO field reaches the client).
- **ForecastSection publish (additive):** `components/forecast/ForecastSection.tsx` gained
  ONLY a `useEffect` (keyed on the derived snapshot primitives) that `publish`es
  `{ describeWeather(days[0].weatherCode).category, days[0].sunrise, days[0].sunset,
  utcOffsetSeconds, isLoaded:true }` when its validated forecast is shown, and
  `NOT_LOADED_WEATHER` on no-location / error / invalid. NONE of its fetch/cache/
  latest-wins/render logic changed; all existing ForecastSection tests stay green.
- **Regression tests (review-gate fix):** `lib/animated-bg/day-night.offset.test.ts`
  (offset → location frame), `components/shell/WeatherBackground.timezone.test.tsx`
  (cross-timezone viewer gets the LOCATION's day/night — fixed instant, flip only the
  offset), `components/shell/WeatherBackground.reactivity.test.tsx` (category change swaps
  the particle, no leftover). 509 tests green.
- Build verified: `/` STAYS static (`WeatherBackground` is a client island under the
  static page); NO new dependency (`package.json` unchanged); NO `api.open-meteo.com`
  host/key in `.next/static` from animated-bg (it issues no fetch).

## add-app-shell conventions (LOCKED — Wave 1+ slices reuse these)

- **i18n:** `lib/i18n/{uk,en,index}.ts`; `t("namespace.key")` resolves nested
  dot-paths (UK default → EN fallback → ""). Add per-domain namespaces to `uk.ts`
  + `en.ts` (`search.*`, `clock.*`, `jokes.*`, `forecast.*`, `comfort.*`, `map.*`,
  `compare.*`) — never reach into `shell.*`. No exclamation marks (test-enforced).
- **Location:** `lib/location/{types,validation,url}.ts` (pure; `Location={lat,lon,name}`;
  dot-decimal only; total/never-throws → null on bad input). Client
  `components/providers/LocationProvider.tsx` exposes `useLocation() → {location,setLocation}`
  syncing `?lat=&lon=&name=` via `router.replace`. city-search/map WRITE it;
  forecast/animated-bg/weekend-compare READ it.
- **Theme:** `ThemeProvider` (light/dark, system default, `data-theme`, cookie-free).
- **Error/empty:** `components/ui/Notice.tsx` (`error`→role alert, `empty`/`info`→role
  status). Runtime faults: `app/error.tsx` + `components/ui/ErrorBoundary.tsx`. REUSE these.
- **UI primitives:** `components/ui/{Button,Card,Badge,Input}.tsx` (cva + `cn()` from
  `lib/utils.ts`); palette tokens in `app/globals.css` + `lib/a11y/palette.ts`
  (AA-verified by `lib/a11y/contrast.ts checkPalette()`).
- **Slots:** `app/page.tsx` composes `AppHeader` (logo+theme+**clock slot**),
  `ShellContent` (empty-vs-located + responsive grid `grid-cols-1 md:grid-cols-2
  xl:grid-cols-3`; hosts forecast/map/compare slots), `AppFooter` (Open-Meteo+OSM
  credits + **jokes slot**), `WeatherBackground` (**bg slot**). Fill YOUR slot file,
  never edit `app/page.tsx` (§3a serialize point).

## Gates passed

- **G0** ✅ scaffold + loop installed; lint/build/typecheck green; hooks fire
  (commit-msg blocks untraced feature commits). Commit `efef101`.
- **G1** ✅ `docs/requirements.md` + `docs/product-brief.md` adopted (user-
  provided, complete). 33 FR / 6 NFR / 9 TC / 6 BC. Reconciliation: added
  FR-SEARCH-06 (geolocation button, mandated by BC-PRIVACY-02) — see
  `docs/requirements-clarifications.md`. Scope incl. weekend-compare (MVP).
- **G2** ✅ 9 baseline specs (`openspec/specs/`); all 33 FRs owned once, no
  duplicates/contradictions; `openspec validate --all --strict` = 9 passed.
  city-search reconciled zero-results literal to Ukrainian. Commit after G1.
- **G3** ✅ `docs/mvp-capability-plan.md`: 9 slices, dependency DAG (critical
  path app-shell→city-search→forecast→animated-bg→weekend-compare), FR coverage
  table (33/33), cross-cutting NFR/TC governance (§5a). check-traceability: 0
  failures. Checkpoint 2: plan is a faithful decomposition of the user's own
  requirements + autonomous mandate → proceeding.

## Phase 4 slice order (per-slice loop: spec-change → red tests+evals → green → battery → review-gate → archive)

1. add-app-shell (foundational)  ✅ DONE (G4) — 68 tests, review CLEAN, archived
2. add-comfort-score  ✅ DONE (G4) — 150 tests, review CLEAN (split-weekend bug fixed), archived
3. add-top-clock  ✅ DONE (G4) — 174 tests, review CLEAN, archived
4. add-bottom-jokes  ✅ DONE (G4) — 204 tests, review CLEAN (build-freeze bug fixed: FooterJoke
   is now client-driven, rotates per visitor-local-day), archived. WAVE 1 COMPLETE.
5. add-city-search  ◀ IMPLEMENTED + VALIDATED (tests/lint/build/openspec green;
   eval-grade + review-gate + archive PENDING — maker≠checker)
6. add-forecast  ✅ · 7. add-map  ✅ · 8. add-animated-bg  ◀ IMPLEMENTED + VALIDATED
   (eval-grade + review-gate + archive PENDING) · 9. add-weekend-compare  ◀ NEXT (Wave 5)

### add-city-search conventions (LOCKED — Wave 3+ slices reuse these)
- **i18n:** `search.*` namespace in `lib/i18n/{uk,en}.ts` (sibling to others). The
  inert `shell.search.*` slot copy is now SUPERSEDED (commented as such; left in
  place per §3a, NOT consumed by SearchBox). Graded copy: `search.empty`
  ("Нічого не знайдено"), `search.geolocationDenied`, `search.geolocationUnavailable`.
- **Data path (THE Wave-3 reuse pattern, TC-DATA-01):** geocoding goes through the
  **`app/api/geocode` Route Handler** — a Next 16 `GET(request)` that does the
  KEYLESS server-side `fetch` to Open-Meteo (URL/params/`count`/`language` live ONLY
  there), zod-parses via `lib/search`, and returns a typed `{ suggestions }` /
  `{ error: "failed" }`. NEVER a raw 500 (empty/oversized/missing q, non-OK upstream,
  network throw, malformed 200 all degrade to a calm typed body). NOT cached (no
  `dynamic = 'force-static'`). The client bundle carries `/api/geocode` + the
  `GeoSuggestion` DTO only — verified the Open-Meteo host + keys are ABSENT from
  `.next/static`. `add-forecast` (also Open-Meteo) follows this exact server/route
  pattern.
- **Pure layer:** `lib/search/{types,validation,flag}.ts` — framework-free (TC-PURE-01).
  `parseGeocoding(body): GeoSuggestion[]` (total: malformed/empty/out-of-range →
  dropped/[], never throws) + `parseGeocodingResult` (discriminated ok/malformed for
  the handler's error-vs-empty branch); `flagEmoji(code): string|null` (regional-
  indicator, null on bad code); `GeoSuggestion = {id,name,admin1?,country?,
  countryCode?,lat,lon}` is the cross-boundary contract.
- **Widget:** `components/search/SearchBox.tsx` (`"use client"`) — debounced (300 ms,
  AbortController + request-id latest-wins) combobox calling `/api/geocode` (NEVER
  Open-Meteo directly); WAI-ARIA combobox/listbox (aria-activedescendant/selected,
  Escape, focus stays in input); selection → `setLocation()` (provider owns URL sync);
  Enter auto-selects a LONE suggestion; zero results → inline `<Notice variant="empty">`;
  opt-in "Use my location" reads `navigator.geolocation` ONLY on explicit click
  (BC-PRIVACY-02), calm Notice on denial/unavailable. Fills the SearchHero slot (D7);
  `app/page.tsx` UNTOUCHED (still static — ARCHITECTURE LESSON honored, search is
  client-driven). Honest degradation everywhere; console silent on a healthy session.

### KEY ARCHITECTURE LESSON (applies to forecast/map): app/page.tsx is STATICALLY PRERENDERED
(no dynamic API). Anything that depends on the visitor's clock OR the active location (URL
?lat=&lon=) MUST be CLIENT-driven — a server component would bake build-time/server-tz values.
TopClock + FooterJoke are client. forecast/map MUST fetch on the client off useLocation()
(or a route handler the client calls), never a server component reading new Date()/searchParams
baked at build. The review-gate caught this only by inspecting the .next build output.

- top-clock: `components/clock/TopClock.tsx` fills the AppHeader clock slot; `lib/clock/format.ts`
  pure `formatClock`. font-mono now mapped to Geist Mono in globals.css @theme inline.

### add-comfort-score conventions (for forecast + weekend-compare to consume)
- `comfortScore(daily): {value:0..100 int, rationale:UA sentence}` in `lib/scoring/comfort.ts`
  (pure/total). Input type `ComfortInput` (lib/scoring/types.ts): `{time:"YYYY-MM-DD",
  apparentHigh, apparentLow, precipProbability, windSpeed(m/s), cloudCover%, uvIndex}` —
  forecast produces this shape. `bandOf(value)` → green/yellow/red.
- `upcomingWeekend(days)` → `{value, saturday?, sunday?, available:"both"|"one"|"none"}`,
  pairs a Saturday only with its CONSECUTIVE Sunday (same weekend) by local `time` date.
- Components: `components/comfort/ComfortBadge.tsx` (value + accessible UA label, color-not-only),
  `components/comfort/WeekendHighlight.tsx` (forecast wires it into the TOP of the grid).
- i18n `comfort.*` namespace; green/yellow/red badge tokens in palette/globals.css (AA-verified).

Agents assume default DB/auth/Playwright stack — OVERRIDE per dispatch with
AGENTS.md + ADR-0003/0004 (no DB/auth/email; Vitest only; service smoke over
mocked Open-Meteo; eval produce() calls pure lib).

## What exists

- Next.js 16.2.9 / React 19.2.4 / TS strict / Tailwind 4 app scaffolded at repo
  root (`app/`, root-level `lib/` to come). Stack libs installed: leaflet,
  react-leaflet, recharts, zod, cva/clsx/tailwind-merge, lucide-react. Dev:
  vitest (+coverage), testing-library, @fission-ai/openspec, tsx.
- Project Factory loop installed: `.claude/agents/` (11), `.claude/workflows/`
  (6), `scripts/check-*`, `scripts/qa-verify.mjs` (battery adapted to DB-less,
  browser-deferred), git hooks (`core.hooksPath=.githooks`), CI
  (`.github/workflows/ci.yml`), OpenSpec initialised (`openspec/config.yaml`).
- Docs: `AGENTS.md`, `CLAUDE.md`, `docs/context-architecture.md`,
  `docs/adr/ADR-0001..0004`, `.env.example`, `openspec/project.md`.
- ADRs: 0001 stack · 0002 context · 0003 no-DB/auth/email (keyless) · 0004
  no-Playwright, chrome-devtools MCP for E2E, browser evidence env-gated.

## Key decisions / constraints

- Keyless, stateless: no DB/auth/email. State in URL + in-memory only (ADR-0003).
- TC-STACK-05 honoured: no Playwright. chrome-devtools MCP is **not connected**
  in this environment → demo recordings, live axe scan, and vision-verify are
  **environment-gated** in Phase 6 (reported pending, never faked). Contrast
  (NFR-A11Y-02) verified computationally; rendering covered by jsdom tests.
  Eval goal needs no browser (ADR-0004).

## Next step

**Next: `add-weekend-compare`** (spec READY — `openspec/changes/add-weekend-compare/`;
pin ≤3 cities, reuse the `DailyForecast` shape + `app/api/forecast` route + comfort
badges/`upcomingWeekend`). `add-animated-bg` is IMPLEMENTED + VALIDATED (509 tests green;
lint/build/openspec/trace green) and awaits eval-grade + review-gate + archive
(maker≠checker — the implementing agent does not review/grade it). Its shared
`WeatherProvider` (ForecastSection publishes today's condition+sun, WeatherBackground
consumes; reduced-motion static; pointer-events none) is the ADR-worthy cross-slice
integration to record. All per-slice eval cases are graded together in Phase 6
(eval-suite, threshold 90).
