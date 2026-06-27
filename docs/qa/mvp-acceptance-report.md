# MVP Acceptance Report — Weather Explorer

Acceptance summary for the Weather Explorer MVP, ready for customer review and
signature. Every claim links to evidence: a test file, a build/battery result,
a generated report, or an archived review record. Where evidence is pending
(env-gated or deploy-gated), it is marked **pending** plainly — not claimed.

- **Date of report:** 2026-06-27 (Europe/Kyiv)
- **Scope:** the MVP defined in `docs/requirements.md` — 33 functional
  requirements across 9 capabilities, 9 non-functional requirements, plus the
  technical/business constraints.
- **Phase:** 5 complete (Gate G5). Phase 6 (eval-suite ≥ 90) and Phase 7
  (live deploy + deploy-gated NFRs) follow.

## Executive summary

- **9 of 9 capability slices delivered and archived.** Every MVP functional
  requirement is owned by exactly one capability and proven by automated tests
  (see `requirements-traceability-matrix.md`).
- **585 unit/component tests + 21 integration tests — all green** (52 test files;
  battery run 2026-06-27 09:23–09:24 Z, Overall **Pass** —
  `automated-verification-latest.md`).
- **Coverage 95.78% lines** (92.43% statements / 93.52% functions / 84.53%
  branches), committed and ratchet-guarded (`quality/coverage-baseline.json`).
- **All 9 review-gates clean** (`openspec/changes/archive/*/review-findings.json`,
  every `clean:true`), with **2 high-severity bugs caught and fixed** in review
  (a CRITICAL compare-fetch strand and a CRITICAL day/night viewer-clock error),
  plus several majors — see "Review evidence" below.
- **The full battery is all-green:** lint (0 warnings), `tsc --noEmit` (strict),
  `next build` (`/` static, `api/*` dynamic), `openspec validate --all --strict`
  (9 passed), traceability (33 FRs, 0 failures), trajectory, recordings, and the
  coverage + eval ratchets.
- **Graded-quality bar MET (Gate G6 GREEN).** The eval-suite has run and written
  `eval-report.md` (maker ≠ checker, 2 judges per case): **14 cases, 14 pass /
  0 fail — every dimension ≥ 90.** The three previously-sub-90 dimensions were
  fixed (copy revisions, by the build agent — not QA) and re-graded:
  `search-empty-clarity` 59 → 96, `compare-error-clarity` 73 → 95,
  `comfort-rationale-quality` 91 → 95. The score is locked at
  `quality/eval-baseline.json` and `node scripts/check-eval-ratchet.mjs` exits 0.
  See "Graded-quality status" below.
- **Honestly pending:** browser E2E recordings (env-gated, ADR-0004) and the
  deploy-gated NFRs (Lighthouse, p95 TTFB). Neither is claimed as passed here.

## Per-capability acceptance

Acceptance criteria are drawn from each capability's spec
(`openspec/specs/<cap>/spec.md`) and the plan's Definition of Done
(`docs/mvp-capability-plan.md` §4). Evidence cites the proving tests (full
`@trace` map in the matrix) and the archived review record.

| Capability | Requirements | Acceptance criteria (from spec / plan DoD) | Evidence | Accepted |
|---|---|---|---|---|
| app-shell | FR-SHELL-01/02/03 | Renders empty hero with centered search; responsive 1/2/3-col at 768/1280; AA contrast tokens; centralized UA strings, no exclamation marks; URL-synced active location | `AppHeader.test.tsx`, `empty-state.test.tsx`, `ShellContent.test.tsx`, `lib/location/*.test.ts`, `lib/a11y/contrast.test.ts`, `lib/i18n/i18n.test.ts`; review-clean (`2026-06-25-add-app-shell`, 8 findings fixed) | ☐ |
| comfort-score | FR-COMFORT-01..05 | Pure total `comfortScore`; 0–100 + ≤80-char UA rationale, no emoji; green≥70/yellow40-69/red<40 badge (color-not-only); weekend = consecutive Sat+Sun avg by local dates | `lib/scoring/{comfort,bands,rationale,weekend}.test.ts`, `ComfortBadge.test.tsx`, `WeekendHighlight.test.tsx`; review-clean (`2026-06-26-add-comfort-score`, split-weekend bug fixed) | ☐ |
| top-clock | FR-CLOCK-01 | Accessible live local-time clock; ticks without layout shift | `lib/clock/format.test.ts`, `TopClock.test.tsx`; review-clean (`2026-06-26-add-top-clock`) | ☐ |
| bottom-jokes | FR-JOKES-01 | Deterministic UA weather joke per local day; no network/tracking; no exclamation marks | `lib/jokes/jokes.test.ts`, `FooterJoke.test.tsx`, `AppFooter.test.tsx`; review-clean (`2026-06-26-add-bottom-jokes`, build-freeze bug fixed) | ☐ |
| city-search | FR-SEARCH-01..06 | Debounced geocoding suggestions (city/region/country/flag); select → set location + URL; Enter selects lone suggestion; zero-results inline «Нічого не знайдено» (no toast); opt-in geolocation on click only; all error paths calm | `lib/search/{validation,flag}.test.ts`, `app/api/geocode/route.test.ts`, `SearchBox.test.tsx`; review-clean (`2026-06-26-add-city-search`, 9 findings incl. stale-error + timeouts fixed) | ☐ |
| forecast | FR-FORECAST-01..05 | Keyless server fetch of 7-day daily; 7 day cards (weekday/hi-lo/icon/precip/wind) + comfort badges; 48h Recharts hourly line; today sunrise/sunset; in-memory cache until location change | `lib/forecast/*.test.ts`, `app/api/forecast/route.test.ts`, `DayCard.test.tsx`, `HourlyChart.test.tsx`, `ForecastSection.test.tsx`; review-clean (`2026-06-26-add-forecast`) | ☐ |
| map | FR-MAP-01..05 | Client-only Leaflet/OSM map bounded to location; marker + city popup; click → reverse-geocode → set location + refetch; OSM attribution always shown; SSR skeleton of same footprint | `lib/geo/*.test.ts`, `app/api/reverse-geocode/route.test.ts`, `LocationMap.test.tsx`, `ReverseFailedHint.test.tsx`; review-clean (`2026-06-26-add-map`, equator/meridian + same-origin icons fixed) | ☐ |
| animated-bg | FR-ANIM-01..04 | Condition-driven gradient + rain/snow/cloud; day/night by **location** sunrise/sunset; reduced-motion → static; pointer-events none, aria-hidden | `lib/animated-bg/*.test.ts`, `WeatherProvider.test.tsx`, `WeatherBackground{,.reactivity,.timezone}.test.tsx`; review-clean (`2026-06-26-add-animated-bg`, viewer-clock bug fixed) | ☐ |
| weekend-compare | FR-COMPARE-01..03 | Pin ≤ 3 cities (chip row, cap enforced in provider); "Compare weekend" → 3-col Sat/Sun table (hi/lo, precip%, comfort); sticky per-column header + "make active"; in-memory only | `lib/compare/{weekend,row}.test.ts`, `PinProvider.test.tsx`, `CompareSection.test.tsx`; review-clean (`2026-06-27-add-weekend-compare`, CRITICAL strand + no-retry fixed) | ☐ |

All 9 archived review records are `clean:true` and list the implementer's fix +
a fresh reviewer's re-verification (maker ≠ checker).

## Non-functional acceptance (summary)

Full rows in `requirements-traceability-matrix.md` §Non-functional.

| NFR | Verified now (local) | Pending |
|---|---|---|
| NFR-A11Y-02 (AA contrast, both themes) | ✅ `checkPalette()` computational WCAG check (`lib/a11y/contrast.test.ts`) | — |
| NFR-OBS-01 (console silent, honest failure) | ✅ `@trace NFR-OBS-01` across routes/components/integration | — |
| NFR-PERF-03 (initial JS ≤ 200 KB gz) | ✅ build-verified: Recharts + Leaflet in lazy chunks, no new dep per slice | byte-regression guard not yet automated (R-08) |
| NFR-DX-01 (lint+tsc+test+build < 60 s) | ✅ battery ~23 s end-to-end | — |
| NFR-I18N-01 (centralized UA strings) | ✅ `lib/i18n/i18n.test.ts` | — |
| NFR-COST-01 (zero paid keys) | ✅ keyless upstreams; no key in `.next/static`; review-clean | — |
| NFR-A11Y-01 (a11y ≥ 95, focus + names) | ✅ JSDOM roles/names asserted | Lighthouse score + live axe (deploy-gated) |
| NFR-PERF-02 (Lighthouse Perf ≥ 90) | partial: no-CLS asserted | Lighthouse on production URL (deploy-gated) |
| NFR-PERF-01 (TTFB ≤ 300 ms p95) | — | live p95 on Vercel preview (deploy-gated) |

## Review evidence — bugs caught and fixed in the gates

The maker ≠ checker review-gate caught real defects before archive. Highlights:

- **CRITICAL (weekend-compare):** a single shared AbortController aborted *every*
  in-flight forecast request on any pin/unpin, stranding the surviving cities on
  "loading" forever. Fixed with a per-city AbortController map (aborts only
  cities that left the set) + failed-city retry; two regression tests proven to
  fail on the old code. (`2026-06-27-add-weekend-compare`.)
- **CRITICAL (animated-bg):** day/night was read from the **viewer's** clock, so
  exploring a far-timezone city showed the wrong sky. Fixed by threading the
  location's `utc_offset_seconds` into `isDaytime` (compares time-of-day in the
  location frame, calendar-mismatch-proof); a host-independent timezone test
  flips day↔night purely on the offset. (`2026-06-26-add-animated-bg`.)
- **MAJOR (bottom-jokes):** the joke was frozen at build time (server timezone),
  not rotating per visitor-local-day. Fixed by making `FooterJoke` a client
  component computing the joke after mount. (`2026-06-26-add-bottom-jokes`.)
- **MAJOR (city-search):** a stale geolocation error persisted across typing/
  selection, and a hung (not failed) upstream left an indefinite spinner. Fixed
  (clear-on-typing + server/client fetch timeouts). (`2026-06-26-add-city-search`.)
- **MAJOR (map):** equator/meridian coordinates reset to 0 (exponent in the URL
  serializer), and Leaflet marker icons loaded from a third-party CDN. Fixed
  (plain-decimal serialize round-trip + same-origin icons + real Nominatim
  User-Agent + CSP). (`2026-06-26-add-map`.)
- **comfort-score:** a split-weekend bug averaged a Saturday with a *different*
  week's Sunday; fixed to pair only consecutive Sat+Sun.
  (`2026-06-26-add-comfort-score`.)
- **app-shell:** 8 findings fixed (runtime ErrorBoundary + `app/error.tsx`,
  cookie-free dark-FOUC fix, theme-toggle correction, broadened `@trace` regex).
  (`2026-06-25-add-app-shell`.)

## Cross-slice integration (Phase 5)

The business loop is proven end-to-end over mocked Open-Meteo payloads:
`tests/integration/weekend-trip-flow.integration.test.ts` — **21 tests** covering
search → forecast → comfort → weekend → compare, with LOCAL-date timezone
invariance proven (the day-bound logic uses the location's calendar dates, not
`toISOString`). Commit `e0cacfa`.

## Pending / env-gated items (explicit — not accepted yet)

These are required to fully close acceptance and are **not** claimed as done:

1. **Browser E2E demo recordings** — env-gated (no Playwright TC-STACK-05;
   chrome-devtools MCP not connected, ADR-0004). The recording column of the
   matrix is empty; `traceability-report.md` shows 33 `recording-evidence`
   warnings (0 failures) and `recordings-report.md` notes no manifest yet
   (expected before Phase 6). Capture spec ready in `demo-script.md`.
   *Ops action:* connect the MCP in Phase 6 and record one clip per viewport.
2. **Deploy-gated NFRs** — NFR-PERF-01 (TTFB p95), NFR-PERF-02 (Lighthouse Perf),
   NFR-A11Y-01 Lighthouse score + live axe — measured on the live Vercel URL at
   G7. *Ops action:* run Lighthouse (mobile + desktop) + measure p95 after deploy.
3. **Automated bundle-size guard (NFR-PERF-03)** — currently build-verified +
   review-confirmed, not a ratcheted byte budget (risk R-08). *Recommended before
   G7.*

The eval-suite graded-quality bar is **no longer pending — it is GREEN** (see the
next section).

## Graded-quality status (eval-suite — the project's delivery bar)

Source: `docs/qa/eval-report.md` (generated by the eval-suite, maker ≠ checker,
2 judges per case; guarded by `scripts/check-eval-ratchet.mjs` against
`quality/eval-baseline.json`). The eval — not the recordings — decides these.

**Result: 14 cases, 14 pass / 0 fail. Every dimension ≥ 90 — the bar is MET
(Gate G6 GREEN).** The score is locked at `quality/eval-baseline.json`;
`node scripts/check-eval-ratchet.mjs` exits 0 (quality may ratchet up, never
silently drop).

Per-dimension scores (from `eval-report.md`):

| Dimension | Score | Verdict |
|---|---|---|
| map-fallback-clarity | 99 | pass |
| error-clarity | 96 | pass |
| search-empty-clarity | 96 | pass |
| comfort-rationale-quality | 95 | pass |
| compare-empty-clarity | 95 | pass |
| compare-error-clarity | 95 | pass |
| forecast-empty-clarity | 95 | pass |
| jokes-quality | 95 | pass |
| empty-state-clarity | 95 | pass |
| forecast-error-clarity | 94 | pass |
| forecast-loading-clarity | 94 | pass |
| map-reverse-failed-clarity | 94 | pass |
| geolocation-denied-clarity | 93 | pass |

(All 14 cases pass; the `comfort-rationale-quality` dimension spans two cases —
`…-bands` 94 and `…-missing-data` 96 — both ≥ 90.)

### How the three previously-failing dimensions were resolved

The earlier run had three sub-90 dimensions. They were fixed by the build agent
(copy + eval-harness corrections — **not** QA; maker ≠ checker preserved) and the
eval-suite re-graded to GREEN:

- **`search-empty-clarity` 59 → 96 (FR-SEARCH-05).** Added `search.emptyHint`
  («Спробуйте іншу назву міста або перевірте написання.») beneath the unchanged
  «Нічого не знайдено» title — the empty state now invites another spelling
  instead of being a bare two-word phrase.
- **`compare-error-clarity` 73 → 95 (FR-COMPARE-02).** Appended forward guidance
  to `compare.error` («…Спробуйте пізніше.»), and corrected the eval `produce()`
  that returned a raw `{ error: … }` envelope (a judge had read it as a leaked
  payload) so it now returns the genuine user-visible string
  (`perCityErrorMessage`).
- **`comfort-rationale-quality` 91 → 95 (FR-COMFORT-03).** Polished
  `lib/scoring/comfort.ts` — the green rationale is now trip-framed (was framed
  around «прогулянки») and the yellow rationale is a clean two-clause sentence
  (was a three-clause comma-splice). The band-disjointness contract still holds
  (`lib/scoring/rationale.test.ts` 12/12).

Post-fix verification reported by the build agent and consistent with the suite
here: **606 tests green** (585 unit/component + 21 integration), `tsc` clean,
production build clean, lint clean, OpenSpec 9/9 strict, and a fresh
`code-reviewer` PASS with no findings.

**QA position:** the functional MVP is delivered and tested **and** the
graded-quality bar (the project's own ≥ 90 delivery criterion) is met. The
graded-quality gate is GREEN. The remaining open items are solely the env-gated
recordings and the deploy-gated NFRs above.

## Sign-off

By signing, the customer accepts that the 9 capabilities and 33 MVP functional
requirements are delivered and verified by the cited automated evidence, and that
the graded-quality bar (every eval dimension ≥ 90, Gate G6) is **met**. The only
remaining open items are the env-gated browser E2E recordings and the deploy-gated
NFRs (Lighthouse, p95 TTFB), to be closed at Phase 6 capture and G7 deploy.

Accepted by: ______________________   Role: __________________   Date: __________

Notes / conditions: ______________________________________________________
