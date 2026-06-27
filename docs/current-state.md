# Current State — Weather Explorer

> Persistent handoff. Update at every milestone. Source of truth is code/specs/
> tests — if this conflicts, verify and fix this file.

- **Last updated:** 2026-06-27 13:30 (Europe/Kyiv)
- **Phase:** 6 COMPLETE (G6) — **THE GOAL MET: every eval dimension ≥ 90.** The eval-suite
  (`project-factory:eval-judge`, maker≠checker, ship-unchanged bar 90) graded 14 cases →
  **14 pass / 0 fail**; per-dimension 93–99, baseline locked `quality/eval-baseline.json`
  (`node scripts/check-eval-ratchet.mjs` exit 0). Lifted the 3 sub-90: search-empty 59→96
  (added `search.emptyHint` beneath the "Нічого не знайдено" title), compare-error 73→95
  (forward guidance + de-enveloped the eval `produce()`), comfort-rationale 91→95 (bands
  case 87→94: trip-framed green[1], de-spliced yellow[1]; band-disjointness intact). QA
  proof pack authored under `docs/qa/` (traceability matrix, acceptance 9/9, manual test
  plan, demo script, risk register; R-06 eval RESOLVED). 606 tests green; build/lint/
  openspec strict clean; fresh `code-reviewer` PASS. **NEXT: Phase 7 (G7)** — global
  review-gate + trajectory-eval + technical docs + NFRs-by-class (deploy-gated pending) +
  deploy (env/user-gated). (history below kept):
  weekend-compare review FIXED a CRITICAL per-city-abort/strand bug + major failed-retry
  (+ shared `keyOf` in lib/location/key.ts, precip clamp). Then Phase 5 + Phase 6 (≥90
  goal) + Phase 7. Eval grading of all per-slice eval cases happens together in Phase 6
  (eval-suite, threshold 90).
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

### add-weekend-compare conventions (LOCKED — the LAST capability slice, no new ADR)
- **Pin state — `components/providers/PinProvider.tsx` (`"use client"`, D1):** `usePins()
  → { pins: PinnedCity[] (0..3), pin, unpin, isPinned, atCap }`. `PinnedCity` IS the
  locked `Location` ({lat,lon,name}). Dedupe + the **max-3 cap** live in the provider
  (unit-tested off-component, the component cannot bypass them); a 4th `pin` is a
  **no-op** surfacing `atCap` (never throws, never silently swallows). Dedupe by
  `keyOf(loc) = "${lat.toFixed(4)},${lon.toFixed(4)}"` — now the SINGLE shared identity
  in **`lib/location/key.ts`** (a Location identity's natural home; `lib/compare/key.ts`
  re-exports it and `ForecastSection` imports it, so the forecast cache, the pin list,
  the per-city compare cache, and `buildCompareRow` all key on ONE function — review
  finding #3). In-memory ONLY (ADR-0003, BC-PRIVACY-03) —
  no cookies / localStorage / server store; resets on reload (a test spies on
  `Storage.setItem` + `document.cookie` to prove it). `usePins()` returns a SAFE
  empty-list default outside a provider (mirrors `useLocation`/`useWeather`/`useTheme`).
  Mounted ONCE in `app/layout.tsx` INSIDE `LocationProvider` (alongside `WeatherProvider`,
  wrapping `{children}`) so the chip row + table share it; `app/page.tsx` UNTOUCHED.
- **Pure layer `lib/compare/{key,weekend,row}.ts`** (framework-free, TC-PURE-01, total,
  never throws): `selectWeekend(forecast): { saturday, sunday }` finds the upcoming
  **Saturday** (weekday 6) + its **CONSECUTIVE Sunday** (Sat+1 calendar day) by the
  location-local `time` date via a FIXED `Date.UTC(y,m-1,d)` parse — NEVER `toISOString`,
  NEVER `new Date("YYYY-MM-DD")`, NEVER the viewer's clock (FR-COMFORT-05; mirrors the
  locked `upcomingWeekend`/`localWeekday`). Anchors on the FIRST weekend day so a leading
  Sunday tail is NOT paired with a different week's Saturday (the split-weekend trap);
  degrades to `{ null, <Sunday> }` / `{ <Sat>, null }` / `{ null, null }`.
  `buildCompareRow(city, state): CompareRow` (`state = loading|failed|{ok,forecast}`) is
  the pure display model the table renders: per Sat/Sun `DayCells` carrying the
  **nullable** numbers as-is (a present `0%` precip stays `0`; an ABSENT precip stays
  `null` → em-dash; extreme negatives keep their sign), `comfortValue =
  comfortScore(toComfortInput(day)).value` (REUSES comfort-score, no local copy). BOTH
  Sat+Sun null → `status: "out-of-range"`; `key`/`name` always present so a column
  header renders in every state.
- **`components/compare/CompareSection.tsx` (`"use client"`, D2)** fills the shell
  `data-slot="compare"` (REPLACED the inert stub in `ShellContent.tsx`; `app/page.tsx`
  UNTOUCHED — client-driven per the ARCHITECTURE LESSON). A controls header (the "Pin
  this city" button — pins `useLocation().location`, lives in the compare/chip-row area
  per D1, disabled at cap / no-location with `compare.cap` as its hint — + the "Compare
  weekend" toggle, `role=switch`/`aria-checked`); a chip row (one chip per pin + a named
  `compare.unpin {city}` control, NOT rendered when empty); and on toggle-on a real
  sticky-header 3-column `<table>` (`<th scope=col>` per city, `<th scope=row>` per
  Sat/Sun × hi/lo/precip/comfort) with a `ComfortBadge` per present day. Each column's
  "make active" button calls the locked `setLocation(city)` (keeps all pins, does not
  close the table); the active column (its `keyOf` == the active location's) carries
  `aria-current` + a NON-COLOR cue (the `compare.active` marker AND the disabled active
  control) that MOVES when another is made active. Empty (no pins) → the calm
  `compare.empty` Notice, NO fetch; a failed city → calm `forecast.precipPlaceholder`
  ("—") cells + a calm `compare.error` label, the OTHER columns intact, console silent.
- **Parallel per-city fetch over the REUSED `/api/forecast` route (D4, TC-DATA-01,
  NFR-COST-01) — review-gate-HARDENED:** on the pinned-SET changing, each city whose
  cache entry is ABSENT or `"failed"` (so a failed city RETRIES on a later effect run /
  re-pin) and not already in flight is fetched via `GET /api/forecast?lat=&lon=` (NO new
  endpoint, NEVER Open-Meteo directly) IN PARALLEL (`Promise.allSettled` — NEVER a
  waterfall). The CRITICAL fix: a **PER-CITY `AbortController`** (a `Map` keyed by
  `keyOf`); on a pin-set change the effect aborts ONLY controllers for cities that LEFT
  the set (and drops their cache + in-flight entries so a re-pin re-fetches), NEVER a
  still-pinned in-flight request — the old single shared controller aborted EVERY
  request on any pin/unpin, stranding the survivors on "loading" forever. A resolution
  is discarded (no stale cache) when the request was aborted, the component unmounted,
  or the city is no longer in the LIVE `pinKeysRef` membership set (synced after each
  commit, not a stale closure). Controller/in-flight bookkeeping lives in the EFFECT
  BODY (side effects), never inside a `setCache` updater (updaters stay pure). Each
  city's `CityForecastState` is held in an in-memory **per-city** map (`keyOf → state`,
  ADR-0003); a successfully-cached city is not re-fetched. Two regression tests guard
  it (proven to FAIL on the old shared-controller code): (a) pinning a 3rd city while 2
  are in flight aborts NEITHER survivor (asserted on the captured signals) and all
  three resolve; (b) a failed city re-fetches + renders after unpin + re-pin. Build
  verified: `/` STAYS static (`CompareSection` is a client island), NO new dependency
  (`package.json` unchanged), NO `api.open-meteo.com` host/key in `.next/static`, and
  `.next/server/app/api` holds only `forecast`/`geocode`/`reverse-geocode` (compare
  added NO route). Precip cells are CLAMPED to 0..100 before formatting (FR-COMPARE-02
  valid range); an absent value still shows the em-dash.
- **i18n `compare.*`** (`lib/i18n/{uk,en}.ts`, sibling to `forecast.*`/`comfort.*`,
  never reaching into `shell.*`): `sectionLabel` (the section's accessible name — kept
  DISTINCT from `toggle.label` so a query for the toggle never matches the section
  wrapper), `toggle.label`, `pin`, `unpin`, `makeActive`, `active`, `cap`,
  `header.{saturday,sunday,hiLo,precip,comfort}`, `empty.{title,description}`
  (EVAL-GRADED, ≥90), `error`. Missing-data placeholder REUSES `forecast.precipPlaceholder`
  ("—"). No exclamation marks (BC-BRAND-01, swept by `i18n.test.ts`). Eval case
  `evals/cases/compare-copy.eval.ts` authored (graded in Phase 6, maker≠checker).
- **ALL 9 capability slices are now implemented.** weekend-compare added 55 tests
  (`lib/compare/{weekend,row}.test.ts`, `PinProvider.test.tsx`, `CompareSection.test.tsx`
  incl. the 2 per-city-abort/strand + failed-retry regressions) → **564 total green**.
  The review gate (8 findings: 1 CRITICAL + 1 major + minors) was addressed: the
  per-city abort/cache rework above (CRITICAL strand + major no-retry), the dead
  make-active `useReducer` tick replaced by a plain local re-render with an accurate
  comment (the cue still moves under the mocked-provider test), `keyOf` moved to the
  shared `lib/location/key.ts` (finding #3), the precip clamp (finding #4), and the
  softened tasks.md 6.2 import-boundary wording (finding #5; the `lib/compare`
  framework-free boundary is held by the `lib/` convention + the pure colocated tests,
  not a dedicated eslint rule). The reviewer CONFIRMED the `ShellContent.test.tsx`
  adaptation (assert the shell empty Notice by COPY, since the compare empty state is
  now a legitimate `role="status"` Notice) is correct, not a weakening. NO other
  upstream behavior changed (the `/api/forecast` route, `comfort.ts`, `ComfortBadge`
  consumed as-is; `ForecastSection` only swapped its local `keyOf` for the shared one).
  Next: the remaining gates (re-review, eval-suite ≥90, archive).

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
