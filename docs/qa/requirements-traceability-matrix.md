# Requirements Traceability Matrix — Weather Explorer

Every MVP **functional** requirement (FR-SHELL / CLOCK / SEARCH / JOKES /
FORECAST / COMFORT / MAP / ANIM / COMPARE) and every **non-functional**
requirement (NFR) from `docs/requirements.md`, mapped to its owning capability,
implementing module(s), the automated test(s) that prove it (cited by file +
`@trace` id), the manual test case, and the evidence class.

Last updated: 2026-06-27 (Europe/Kyiv). Sources of truth: `docs/requirements.md`,
the `@trace` annotations in the test files, `docs/qa/traceability-report.md`
(generated), `quality/coverage-baseline.json`, and the archived per-slice
`openspec/changes/archive/*/review-findings.json` (all `clean:true`).

## Legend — evidence classes

- **unit** — pure `lib/` Vitest unit test (framework-free, TC-PURE-01).
- **component** — JSDOM component test (Testing Library).
- **route** — Next 16 Route Handler test over mocked upstream payloads.
- **integration** — `tests/integration/weekend-trip-flow.integration.test.ts`
  (21 tests: the search → forecast → comfort → weekend → compare business flow
  over mocked Open-Meteo; LOCAL-date timezone-invariance proven).
- **review-clean** — the slice's `review-gate` finding set resolved + re-verified
  by a fresh reviewer (maker ≠ checker); `review-findings.json clean:true`.
- **build** — verified by `npm run build` output (route shape, `/` static, lazy
  chunks, no upstream host/key in `.next/static`) + review-confirmed.
- **eval** — graded by the eval-suite (writes `eval-report.md`, maker ≠ checker).
  The eval-suite **has run and is GREEN**: 14 cases, 14 pass / 0 fail — every
  dimension ≥ 90 (Gate G6 met). A row tagged `eval` carries that dimension's
  passing score; cite the
  verdict from `eval-report.md`, not a recording.
- **browser-gated** — visual E2E recording, env-gated per ADR-0004 (no
  Playwright TC-STACK-05; chrome-devtools MCP not connected here). **Pending.**
- **deploy-gated** — measured on the live Vercel URL at G7. **Pending live.**

The recording column is empty for every FR by design (browser-gated, see
`traceability-report.md` warnings). The "Recording" status is therefore tracked
in the acceptance report's pending section, not as a per-row cell here.

---

## Functional requirements

### Shell & navigation — capability `app-shell`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-SHELL-01 | `components/shell/AppHeader.tsx`, `app/page.tsx`, `components/providers/LocationProvider.tsx`, `lib/location/{types,url,validation}.ts` | `components/shell/AppHeader.test.tsx` ·FR-SHELL-01; `lib/location/url.test.ts`, `lib/location/validation.test.ts`, `lib/location/serialize-roundtrip.test.ts` ·FR-SHELL-01 | MT-12 | unit, component, review-clean |
| FR-SHELL-02 | `components/shell/ShellContent.tsx` (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) | `components/shell/empty-state.test.tsx` ·FR-SHELL-02 | MT-10 | component, review-clean |
| FR-SHELL-03 | `components/shell/ShellContent.tsx`, `components/shell/SearchHero.tsx` | `components/shell/empty-state.test.tsx` ·FR-SHELL-03; `components/shell/ShellContent.test.tsx` ·FR-SHELL-03 | MT-01 | component, review-clean |

### Top clock — capability `top-clock`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-CLOCK-01 | `components/clock/TopClock.tsx`, `lib/clock/format.ts` | `lib/clock/format.test.ts` ·FR-CLOCK-01; `components/clock/TopClock.test.tsx` ·FR-CLOCK-01 (live tick via fake timers, no CLS) | MT-11 | unit, component, review-clean |

### City search — capability `city-search`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-SEARCH-01 | `app/api/geocode/route.ts`, `components/search/SearchBox.tsx`, `lib/search/{types,validation}.ts` | `lib/search/validation.test.ts` ·FR-SEARCH-01; `app/api/geocode/route.test.ts` ·FR-SEARCH-01; `components/search/SearchBox.test.tsx` ·FR-SEARCH-01; integration ·FR-SEARCH-01 | MT-02 | unit, route, component, integration, review-clean |
| FR-SEARCH-02 | `components/search/SearchBox.tsx`, `lib/search/flag.ts`, `lib/search/validation.ts` | `lib/search/flag.test.ts` ·FR-SEARCH-02; `lib/search/validation.test.ts` ·FR-SEARCH-02; `components/search/SearchBox.test.tsx` ·FR-SEARCH-02 | MT-02 | unit, component, review-clean |
| FR-SEARCH-03 | `components/search/SearchBox.tsx`, `components/providers/LocationProvider.tsx`, `lib/location/url.ts` | `components/search/SearchBox.test.tsx` ·FR-SEARCH-03; integration ·FR-SEARCH-03 | MT-02 | component, integration, review-clean |
| FR-SEARCH-04 | `components/search/SearchBox.tsx` (Enter auto-selects a lone suggestion) | `components/search/SearchBox.test.tsx` ·FR-SEARCH-04 | MT-03 | component, review-clean |
| FR-SEARCH-05 | `components/search/SearchBox.tsx`, `components/ui/Notice.tsx` (`variant="empty"`), `search.empty` in `lib/i18n/uk.ts` | `components/search/SearchBox.test.tsx` ·FR-SEARCH-05 | MT-04 | component, review-clean, eval `search-empty-clarity` = 96 pass (`eval-report.md`) |
| FR-SEARCH-06 | `components/search/SearchBox.tsx` ("Use my location", `navigator.geolocation` on click only), `search.geolocation{Denied,Unavailable}` | `components/search/SearchBox.test.tsx` ·FR-SEARCH-06, ·BC-PRIVACY-02 | MT-05 | component, review-clean, eval `geolocation-denied-clarity` = 93 pass |

### Footer jokes — capability `bottom-jokes`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-JOKES-01 | `components/jokes/FooterJoke.tsx` (`"use client"`, deterministic per visitor-local-day), `lib/jokes/jokes.ts`, `components/shell/AppFooter.tsx` | `lib/jokes/jokes.test.ts` ·FR-JOKES-01; `components/jokes/FooterJoke.test.tsx` ·FR-JOKES-01; `components/shell/AppFooter.test.tsx` ·FR-JOKES-01 | MT-13 | unit, component, review-clean, eval `jokes-quality` = 95 pass |

### Forecast — capability `forecast`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-FORECAST-01 | `app/api/forecast/route.ts` (keyless server fetch), `lib/forecast/{types,validation}.ts`, `components/forecast/ForecastSection.tsx` | `lib/forecast/validation.test.ts` ·FR-FORECAST-01; `app/api/forecast/route.test.ts` ·FR-FORECAST-01; `components/forecast/ForecastSection.test.tsx` ·FR-FORECAST-01; `lib/forecast/comfort-input.test.ts` ·FR-FORECAST-01; integration ·FR-FORECAST-01 | MT-06 | unit, route, component, integration, review-clean |
| FR-FORECAST-02 | `components/forecast/DayCard.tsx`, `lib/forecast/weather-code.ts`, `components/forecast/ForecastSection.tsx` | `components/forecast/DayCard.test.tsx` ·FR-FORECAST-02; `lib/forecast/weather-code.test.ts` ·FR-FORECAST-02; `components/forecast/ForecastSection.test.tsx` ·FR-FORECAST-02 | MT-06 | unit, component, review-clean |
| FR-FORECAST-03 | `components/forecast/HourlyChart.tsx` (Recharts, lazy `dynamic ssr:false`), `lib/forecast/hourly.ts` | `lib/forecast/hourly.test.ts` ·FR-FORECAST-03; `components/forecast/HourlyChart.test.tsx` ·FR-FORECAST-03; `components/forecast/ForecastSection.test.tsx` ·FR-FORECAST-03 | MT-06 | unit, component, review-clean |
| FR-FORECAST-04 | `components/forecast/ForecastSection.tsx` (sunrise/sunset under chart) | `components/forecast/ForecastSection.test.tsx` ·FR-FORECAST-04 | MT-06 | component, review-clean |
| FR-FORECAST-05 | `components/forecast/ForecastSection.tsx` (in-memory location-tagged cache, AbortController, latest-wins discard) | `components/forecast/ForecastSection.test.tsx` ·FR-FORECAST-05 (incl. the A→B→A discard sentinel) | MT-08 | component, review-clean, eval `forecast-loading-clarity` = 94 pass / `forecast-empty-clarity` = 95 pass |

### Map — capability `map`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-MAP-01 | `components/map/{LocationMap,LocationMapClient}.tsx` (Leaflet/react-leaflet, OSM tiles) | `components/map/LocationMap.test.tsx` ·FR-MAP-01 | MT-07 | component, review-clean |
| FR-MAP-02 | `components/map/LocationMapClient.tsx` (marker + city popup) | `components/map/LocationMap.test.tsx` ·FR-MAP-02 | MT-07 | component, review-clean |
| FR-MAP-03 | `app/api/reverse-geocode/route.ts` (Nominatim, ADR-0005), `lib/geo/{reverse-validation,coordinate-label,types}.ts`, `components/map/LocationMapClient.tsx` | `lib/geo/reverse-validation.test.ts`, `lib/geo/coordinate-label.test.ts`, `lib/geo/equator-meridian.test.ts` ·FR-MAP-03; `app/api/reverse-geocode/route.test.ts` ·FR-MAP-03; `components/map/LocationMap.test.tsx` ·FR-MAP-03; `components/map/ReverseFailedHint.test.tsx` ·FR-MAP-03 | MT-07 | unit, route, component, review-clean, eval `map-reverse-failed-clarity` = 94 pass / `map-fallback-clarity` = 99 pass |
| FR-MAP-04 | `components/map/LocationMapClient.tsx` ("© OpenStreetMap contributors" attribution) | `components/map/LocationMap.test.tsx` ·FR-MAP-04 (asserts the attribution string) | MT-07 | component, review-clean |
| FR-MAP-05 | `components/map/LocationMap.tsx` (`dynamic ssr:false`), `components/map/MapSkeleton.tsx` (same footprint) | `components/map/LocationMap.test.tsx` ·FR-MAP-05; `/` stays static, Leaflet lazy | MT-07 | component, build, review-clean |

### Comfort score — capability `comfort-score`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-COMFORT-01 | `lib/scoring/comfort.ts` (pure total `comfortScore(daily)`), `lib/scoring/types.ts` | `lib/scoring/comfort.test.ts` ·FR-COMFORT-01 | MT-06 | unit, review-clean |
| FR-COMFORT-02 | `lib/scoring/comfort.ts` (feels-like, precip, wind, cloud, UV), `lib/forecast/format.ts` `toComfortInput` | `lib/scoring/comfort.test.ts` ·FR-COMFORT-02; `lib/forecast/comfort-input.test.ts` ·FR-COMFORT-02; `lib/forecast/validation.test.ts` ·FR-COMFORT-02 | MT-06 | unit, review-clean |
| FR-COMFORT-03 | `lib/scoring/comfort.ts` (UA rationale, ≤ 80 chars, no emoji) | `lib/scoring/rationale.test.ts` ·FR-COMFORT-03, ·BC-BRAND-01 | MT-06 | unit, review-clean, eval `comfort-rationale-quality` = 95 pass (`…-bands` case 94, `…-missing-data` 96 — `eval-report.md`) |
| FR-COMFORT-04 | `components/comfort/ComfortBadge.tsx` (green ≥ 70 / yellow 40–69 / red < 40, color-not-only), `lib/scoring/comfort.ts` `bandOf` | `lib/scoring/bands.test.ts` ·FR-COMFORT-04; `components/comfort/ComfortBadge.test.tsx` ·FR-COMFORT-04; `components/forecast/ForecastSection.test.tsx` ·FR-COMFORT-04 | MT-06 | unit, component, review-clean |
| FR-COMFORT-05 | `components/comfort/WeekendHighlight.tsx`, `lib/scoring/comfort.ts` `upcomingWeekend` (Sat+Sun avg, location-local dates) | `lib/scoring/weekend.test.ts` ·FR-COMFORT-05; `lib/compare/weekend.test.ts` ·FR-COMFORT-05; `components/comfort/WeekendHighlight.test.tsx` ·FR-COMFORT-05; `components/forecast/ForecastSection.test.tsx` ·FR-COMFORT-05; integration ·FR-COMFORT-05 | MT-06 | unit, component, integration, review-clean |

### Animated background — capability `animated-bg`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-ANIM-01 | `components/shell/WeatherBackground.tsx`, `lib/animated-bg/scene.ts` (`conditionToScene`), `app/globals.css` particle keyframes | `lib/animated-bg/scene.test.ts` ·FR-ANIM-01; `components/shell/WeatherBackground.test.tsx` ·FR-ANIM-01; `components/shell/WeatherBackground.reactivity.test.tsx` ·FR-ANIM-01; `components/providers/WeatherProvider.test.tsx` ·FR-ANIM-01 | MT-14 | unit, component, review-clean |
| FR-ANIM-02 | `lib/animated-bg/day-night.ts` (`isDaytime`, location frame via `utcOffsetSeconds`), `components/providers/WeatherProvider.tsx`, `components/shell/WeatherBackground.tsx` | `lib/animated-bg/day-night.test.ts`, `lib/animated-bg/day-night.offset.test.ts` ·FR-ANIM-02; `components/shell/WeatherBackground.timezone.test.tsx` ·FR-ANIM-02 (cross-tz viewer gets the LOCATION's day/night); `components/providers/WeatherProvider.test.tsx` ·FR-ANIM-02 | MT-14 | unit, component, review-clean |
| FR-ANIM-03 | `components/shell/WeatherBackground.tsx` (`matchMedia` reduced-motion → static gradient, CSS `@media` backstop) | `components/shell/WeatherBackground.test.tsx` ·FR-ANIM-03 (reduced motion → no particle nodes) | MT-15 | component, review-clean |
| FR-ANIM-04 | `components/shell/WeatherBackground.tsx` (`pointer-events:none`, `aria-hidden`, no focusable children) | `components/shell/WeatherBackground.test.tsx` ·FR-ANIM-04 | MT-14 | component, review-clean |

### Weekend compare — capability `weekend-compare`

| Req | Implementation | Proving test(s) — file · `@trace` | Manual | Evidence |
|---|---|---|---|---|
| FR-COMPARE-01 | `components/providers/PinProvider.tsx` (`usePins`, max-3 cap + dedupe), `components/compare/CompareSection.tsx` (chip row), `lib/location/key.ts` | `components/providers/PinProvider.test.tsx` ·FR-COMPARE-01 (cap + dedupe + in-memory-only, spies on `Storage.setItem`/`document.cookie`); `components/compare/CompareSection.test.tsx` ·FR-COMPARE-01 | MT-09 | unit, component, review-clean, eval `compare-empty-clarity` = 95 pass |
| FR-COMPARE-02 | `components/compare/CompareSection.tsx` (3-col Sat/Sun table), `lib/compare/{weekend,row}.ts`, `components/comfort/ComfortBadge.tsx` | `lib/compare/weekend.test.ts`, `lib/compare/row.test.ts` ·FR-COMPARE-02; `components/compare/CompareSection.test.tsx` ·FR-COMPARE-02 (incl. per-city-abort/strand + failed-retry regressions); integration ·FR-COMPARE-02 | MT-09 | unit, component, integration, review-clean, eval `compare-error-clarity` = 95 pass (`eval-report.md`) |
| FR-COMPARE-03 | `components/compare/CompareSection.tsx` (sticky `<th scope=col>` per city + "make active" → `setLocation`, `aria-current` + non-color cue) | `components/compare/CompareSection.test.tsx` ·FR-COMPARE-03 | MT-09 | component, review-clean |

---

## Non-functional requirements

Verification mode is marked **local** (verifiable now, this environment) or
**deploy-gated** (needs the live Vercel URL at G7).

| Req | Mode | Owner / where enforced | Proving test / measurement — file · `@trace` | Evidence |
|---|---|---|---|---|
| NFR-PERF-01 (TTFB ≤ 300 ms p95) | **deploy-gated** | every route; `app-shell` keeps `/` static-first | Live p95 measurement on the Vercel preview at G7. No local proxy. | **deploy-gated — pending live** |
| NFR-PERF-02 (Lighthouse Perf ≥ 90) | **deploy-gated** | every UI slice; map (Leaflet) + chart (Recharts) dynamically imported | Lighthouse on the production URL (mobile + desktop) at G7. `components/clock/TopClock.test.tsx` ·NFR-PERF-02 asserts the no-CLS contribution locally. | **deploy-gated — pending live**; partial local (no-CLS) |
| NFR-PERF-03 (initial JS ≤ 200 KB gz) | **local** | every slice keeps client islands small; Recharts + Leaflet isolated in **lazy chunks** | `npm run build`: `/` stays static, Recharts registered in the page react-loadable-manifest and **absent** from initial build-manifest chunks + rootMainFiles; Leaflet lazy; no new dependency added by any slice (`package.json` unchanged across slices). Verified at build + review-confirmed per slice (current-state add-forecast/add-animated-bg/add-weekend-compare notes). **Not a ratcheted byte-budget assertion** — see gap note below. | build, review-clean |
| NFR-A11Y-01 (a11y ≥ 95; focus + names) | **deploy-gated** (Lighthouse score) / **local** (roles + names) | every UI slice | Local JSDOM role/name assertions: `components/shell/AppHeader.test.tsx`, `components/clock/TopClock.test.tsx`, `components/comfort/ComfortBadge.test.tsx`, `components/forecast/HourlyChart.test.tsx`, `components/search/SearchBox.test.tsx`, `components/compare/CompareSection.test.tsx`, `components/shell/WeatherBackground.test.tsx`, `components/ui/Notice.test.tsx` ·NFR-A11Y-01. Lighthouse a11y score + axe scan are **deploy/browser-gated** at G7. | component (roles/names); deploy-gated (score) |
| NFR-A11Y-02 (WCAG-AA contrast, light + dark) | **local** | `app-shell` palette tokens, comfort badges, map controls | `lib/a11y/contrast.test.ts` ·NFR-A11Y-02: `checkPalette()` runs the WCAG relative-luminance ratio over every fg/bg pair in `lib/a11y/palette.ts` (text ≥ 4.5:1, UI ≥ 3:1) in BOTH themes — the no-browser AA proof (ADR-0004). Palette is lockstep with `app/globals.css`. | unit |
| NFR-COST-01 (zero paid keys) | **local** | every external-data slice — city-search, forecast, map | Keyless upstreams only (Open-Meteo forecast + geocoding; Nominatim; OSM tiles). Route handlers `app/api/{forecast,geocode,reverse-geocode}/route.ts` carry no key; build verifies no upstream host/key in `.next/static`. ADR-0003. Code/dep review per slice; `review-clean`. | build, review-clean |
| NFR-OBS-01 (console silent, honest failure) | **local** | every slice; shared `components/ui/Notice.tsx` error/empty pattern + `app/error.tsx` | `@trace NFR-OBS-01` asserts a clean console + calm degraded state across: `app/api/{forecast,geocode,reverse-geocode}/route.test.ts`, `components/forecast/ForecastSection.test.tsx`, `components/search/SearchBox.test.tsx`, `components/map/LocationMap.test.tsx`, `components/compare/CompareSection.test.tsx`, `components/jokes/FooterJoke.test.tsx`, `components/ui/{Notice,ErrorBoundary}.test.tsx`, `lib/jokes/jokes.test.ts`, `lib/geo/equator-meridian.test.ts`, and integration. | unit, component, route, integration, review-clean |
| NFR-DX-01 (lint+tsc+test+build < 60 s) | **local** | app-wide | `qa:verify` battery run 2026-06-27 09:23:53–09:24:16 Z = **~23 s total**; unit suite 6.05 s, integration 0.75 s, build 4.2 s compile (see `automated-verification-latest.md`). | build/timed battery |
| NFR-I18N-01 (centralised UA strings, EN fallback) | **local** | every slice extends `lib/i18n` | `lib/i18n/i18n.test.ts` ·NFR-I18N-01 (nested dot-path resolution UK→EN→""); `components/jokes/FooterJoke.test.tsx`, `components/shell/AppFooter.test.tsx` ·NFR-I18N-01. No runtime i18n library. | unit, component |

---

## Technical constraints & business constraints (cross-cutting — abbreviated)

These are not the matrix's primary scope (FR + NFR) but are traced where a
dedicated test asserts them; listed so no constraint is silently unowned.

| Req | Where enforced | Proving test — file · `@trace` | Evidence |
|---|---|---|---|
| TC-STACK-02 (Tailwind 4 / cva / `cn`) | `lib/utils.ts`, `components/ui/*` | `lib/utils.test.ts` ·TC-STACK-02 | unit |
| TC-DATA-01 (Open-Meteo from server/route, no key in client) | `app/api/{forecast,geocode,reverse-geocode}/route.ts` | `app/api/{forecast,geocode,reverse-geocode}/route.test.ts` ·TC-DATA-01 | route, build |
| TC-PURE-01 (framework-free `lib/`) | all `lib/*` modules | every colocated `lib/**/*.test.ts` (pure, no `next`/`react`/DOM); trajectory audit | unit, review-clean |
| TC-MAP-01 (OSM attribution/policy) | `components/map/LocationMapClient.tsx`, `app/api/reverse-geocode/route.ts` (real User-Agent) | `components/map/LocationMap.test.tsx` ·FR-MAP-04 (attribution) | component, review-clean |
| TC-STACK-05 (Vitest; no Playwright) | tooling | whole suite is Vitest; E2E via chrome-devtools MCP (ADR-0004) | meta |
| BC-PRIVACY-02 (geolocation on explicit action only) | `components/search/SearchBox.tsx` | `components/search/SearchBox.test.tsx` ·BC-PRIVACY-02 | component, review-clean |
| BC-PRIVACY-03 (no app-set cookies/storage) | providers (in-memory + URL only, ADR-0003) | `components/providers/PinProvider.test.tsx` (spies on `Storage.setItem` + `document.cookie`) | component, review-clean |
| BC-BRAND-01 (UA-first, calm, no exclamation marks) | `lib/i18n/{uk,en}.ts` | `lib/i18n/i18n.test.ts` ·BC-BRAND-01 (sweeps every UK + EN value); `lib/scoring/rationale.test.ts`, `lib/jokes/jokes.test.ts`, `components/clock/TopClock.test.tsx`, `components/map/ReverseFailedHint.test.tsx` ·BC-BRAND-01 | unit, component |
| BC-BRAND-02 (footer credits Open-Meteo + OSM) | `components/shell/AppFooter.tsx` | `components/shell/AppFooter.test.tsx` | component |

---

## Cells that could not be fully filled — explicit reasons

No MVP FR or NFR cell is blank. The following are filled with an explicit
pending/gated marker rather than positive local evidence:

1. **Recording column (all 33 FRs)** — empty by design. Browser-gated:
   no Playwright (TC-STACK-05); chrome-devtools MCP is not connected in this
   environment (ADR-0004). `traceability-report.md` emits one
   `recording-evidence` warning per FR (33 warnings, 0 failures) and
   `recordings-report.md` notes no manifest yet (expected before Phase 6).
   Recordings are produced in Phase 6 when the MCP is available; each clip's
   manifest entry will list the FR ids it proves.
2. **NFR-PERF-01 (TTFB p95)** — deploy-gated; requires the live Vercel preview.
   No local proxy exists; measured at G7. Pending live.
3. **NFR-PERF-02 (Lighthouse Performance ≥ 90)** — deploy-gated; needs the
   production URL (mobile + desktop). Locally only the no-CLS contribution is
   asserted (`TopClock.test.tsx`). Pending live.
4. **NFR-A11Y-01 Lighthouse score (≥ 95) + axe scan** — deploy/browser-gated.
   Interactive-element roles and accessible names ARE asserted locally in JSDOM
   (the `@trace NFR-A11Y-01` set above); the numeric Lighthouse score and the
   live axe pass are gated to G7.
5. **eval-graded copy (13 dimensions)** — the eval-suite **has run and is GREEN**
   (`eval-report.md`, maker ≠ checker): **14 cases, 14 pass / 0 fail — every
   dimension ≥ 90 (Gate G6 met).** The `eval`-class rows above cite each
   dimension's passing score. The three dimensions that failed an earlier run were
   fixed by the build agent (copy + eval-harness corrections — not QA) and
   re-graded: `search-empty-clarity` 59 → 96 (FR-SEARCH-05, added `search.emptyHint`),
   `compare-error-clarity` 73 → 95 (FR-COMPARE-02, forward guidance in
   `compare.error` + the `produce()` now returns the real user string),
   `comfort-rationale-quality` 91 → 95 (FR-COMFORT-03, trip-framed green +
   de-spliced yellow rationale). The score is locked at `quality/eval-baseline.json`
   and `node scripts/check-eval-ratchet.mjs` exits 0.

### Honesty note on NFR-PERF-03 (bundle ≤ 200 KB)

This is verified at `npm run build` (lazy chunks confirmed; no upstream
host/key in `.next/static`; no new dependency per slice) and confirmed by each
slice's review-gate — but there is **no standalone `scripts/check-*` that fails
on a gzipped-byte regression**. It is build-verified + review-confirmed, not a
ratcheted automated byte budget. Recommend wiring a bundle-size check before
G7 (ops action — see risk register R-08).
