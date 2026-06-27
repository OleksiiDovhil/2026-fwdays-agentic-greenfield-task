# Delivery Report — Weather Explorer

Customer-facing delivery + effort report for the Weather Explorer MVP. Every claim
links to evidence on disk (a test run, a generated report, a commit). Where evidence
is deploy-gated or env-gated it is marked PENDING plainly — not claimed.

- **Date:** 2026-06-27 (Europe/Kyiv)
- **Product:** Weather Explorer — a keyless, privacy-first, Ukrainian-first weekend
  trip planner (`docs/product-brief.md`, `docs/requirements.md`).
- **Status:** 9/9 capabilities delivered; Gates **G0–G7 (autonomous) passed**. The
  remaining steps to production are user/deploy-gated (deploy, push, live-measured
  NFRs, recordings) — see §7.

## 1. Executive summary

- **All 9 capabilities delivered and archived**, covering all 33 MVP functional
  requirements (one owner each — `docs/mvp-capability-plan.md`).
- **610 automated tests green** — 589 unit/component + 21 integration. Coverage
  **95.78% lines** (ratchet-guarded, `quality/coverage-baseline.json`).
- **Graded-quality bar MET (Gate G6 GREEN):** the eval-suite grades 14 copy-quality
  cases (maker ≠ checker, 2 judges) — **14/14 pass, every dimension ≥ 90**
  (`docs/qa/eval-report.md`), locked at `quality/eval-baseline.json`.
- **Per-slice reviews clean** (9/9 `review-findings.json clean:true`) and the **global
  pre-release review (G7)** found 3 substantive issues, of which **2 were fixed** and
  1 (a minor CSP hardening item with no present exploit path) was deferred to the
  risk register; a fresh reviewer verified both fixes PASS (commit `996a030`).
- **Process quality graded GREEN:** the trajectory-eval (the *path* each slice took)
  scored **36/36 judgements pass** (`docs/qa/trajectory-eval-report.md`).
- **Release hygiene green:** `npm audit --audit-level=high` → 0 vulnerabilities; no
  secrets in repo or git history; `qa:verify` Overall **Pass**.
- **Honestly pending:** the deploy-gated NFRs (Lighthouse, p95 TTFB) and the E2E
  recordings (env-gated). Neither is claimed as passed — see §6/§7.

## 2. Capabilities delivered

| # | Capability | Requirements | Evidence |
|---|---|---|---|
| 1 | App shell + responsive layout | FR-SHELL-01/02/03 | `2026-06-25-add-app-shell` (review clean, 8 findings fixed) |
| 2 | Comfort score (pure) | FR-COMFORT-01..05 | `2026-06-26-add-comfort-score` (split-weekend bug fixed) |
| 3 | Live header clock | FR-CLOCK-01 | `2026-06-26-add-top-clock` |
| 4 | Footer jokes (deterministic UA) | FR-JOKES-01 | `2026-06-26-add-bottom-jokes` (build-freeze bug fixed) |
| 5 | City search + opt-in geolocation | FR-SEARCH-01..06 | `2026-06-26-add-city-search` (9 findings fixed) |
| 6 | 7-day forecast + hourly + sun | FR-FORECAST-01..05 | `2026-06-26-add-forecast` |
| 7 | Interactive OSM map + click-to-set | FR-MAP-01..05 | `2026-06-26-add-map` (equator/meridian + same-origin icons fixed) |
| 8 | Condition-driven animated background | FR-ANIM-01..04 | `2026-06-26-add-animated-bg` (viewer-clock bug fixed) |
| 9 | Weekend compare (pin ≤ 3) | FR-COMPARE-01..03 | `2026-06-27-add-weekend-compare` (CRITICAL strand bug fixed) |

Full requirement → module → test mapping: `docs/qa/requirements-traceability-matrix.md`.

## 3. Gates G0–G7 (autonomous)

| Gate | What it certifies | Result |
|---|---|---|
| G0 | Scaffold + Project Factory loop installed | Pass (`efef101`) |
| G1 | Requirements + brief adopted (33 FR / 9 NFR / 9 TC / 6 BC) | Pass (`afdcee0`) |
| G2 | 9 baseline specs; every FR owned once; `openspec validate` 9/9 | Pass (`0bc1669`) |
| G3 | MVP capability plan (slices, DAG, FR coverage, NFR governance) | Pass (`3433a4c`) |
| G4 | 9 per-slice loops (spec → red → green → battery → review → archive) | Pass (9 archived, all clean) |
| G5 | Cross-slice integration (21 tests) + coverage baseline | Pass (`e0cacfa`) |
| G6 | Graded-quality bar — every eval dimension ≥ 90 | **Pass / GREEN** (`07f767b`; `eval-report.md`) |
| G7 | Global review + trajectory-eval + release hygiene | **Pass** (fixes `996a030`; evidence `c7689ff`) |

## 4. Quality evidence (the battery)

- **Automated tests:** 610 green (589 unit/component across 52 files + 21
  integration). Reproduce: `npm run test:run` + `npm run test:integration`.
- **Coverage:** 95.78% lines / 92.43% statements / 93.52% functions / 84.53% branches
  (`quality/coverage-baseline.json`, ratchet-guarded).
- **Graded quality (evals):** 14/14 pass, every dimension ≥ 90 (top: map-fallback 99;
  the three formerly-sub-90 dimensions — search-empty 59→96, compare-error 73→95,
  comfort-rationale 91→95 — were fixed and re-graded). `docs/qa/eval-report.md`;
  `node scripts/check-eval-ratchet.mjs` exits 0.
- **Release hygiene:** `qa:verify` Overall Pass (lint 0 warnings, `tsc` strict,
  `next build` `/` static, `openspec --all --strict` 9/9, traceability 33 FRs 0
  failures, trajectory); `npm audit --audit-level=high` 0 vulnerabilities; no secrets
  in repo/history; `check-traceability --release --strict-tests` and `--check-fresh`
  and `check-trajectory --release` all exit 0.

## 5. Review findings — what the gates caught and fixed

### Per-slice reviews (G4)
All 9 slices passed a maker ≠ checker review-gate (`review-findings.json clean:true`).
Substantive bugs caught + fixed include: the weekend-compare CRITICAL fetch-strand
(per-city AbortController rework), the animated-bg CRITICAL day/night viewer-clock
error, the bottom-jokes build-time freeze, the city-search stale-error + hung-upstream
timeouts, the map equator/meridian reset + same-origin icons, and the comfort-score
split-weekend bug. Details: `docs/qa/mvp-acceptance-report.md` §"Review evidence".

### Global pre-release review (G7)
Whole-codebase review (correctness + security + spec-compliance, each finding
adversarially verified by 2 lenses) → `docs/qa/global-review-findings.json`. **3
confirmed + 1 contested + 2 rejected.** Resolution (commit `996a030`, re-verified PASS
by a fresh reviewer):

1. **CRITICAL/MAJOR timezone (FR-FORECAST-03) — FIXED.** The hourly "next 48 h" chart
   window was skewed by the active location's UTC offset: `ForecastSection` called
   `nextHours(forecast.hourly, 48)` with the default `now = Date.now()` (true UTC),
   but each point's time is the location's wall clock read as UTC (Open-Meteo
   `timezone=auto`). Kyiv (+3h) showed 3 already-elapsed hours and stopped ~3h early —
   the exact mirror of the FR-ANIM-02 `isDaytime` fix, never applied here. The same
   defect was independently confirmed from the spec angle (the MAJOR spec-compliance
   finding). **Fix:** `nextHours` gains an optional `utcOffsetSeconds` (4th param)
   shifting `now` into the location frame (`now + offset*1000`); the caller threads
   `forecast.utcOffsetSeconds`. 3 regression tests pin the corrected + back-compat
   frames.
2. **MAJOR theme hydration (NFR-OBS-01) — raised contested, FIXED.** `ThemeProvider`
   read `matchMedia` in a `useState` initializer, so SSR rendered "light" but a
   dark-OS client's first render computed "dark"; the SSR'd `AppHeader` toggle then
   tripped a React hydration mismatch + console error on every dark-OS first paint.
   **Fix:** read the OS preference via `useSyncExternalStore` (server snapshot
   "light" === first client render → no mismatch) + a separate `override` state;
   `data-theme` is written only on an explicit choice (CSS paints the system theme,
   no flash). A dark-OS adoption test locks it.
3. **MINOR CSP `unsafe-inline` (security) — DEFERRED (not release-blocking).** The
   CSP `script-src` carries `'unsafe-inline'` for Next's hydration. The reviewers
   (both lenses) confirmed there is **no XSS sink today** — no `dangerouslySetInnerHTML`,
   `innerHTML` write, `eval`, or `new Function` anywhere; all upstream payloads are
   zod-parsed and rendered as text; `connect-src`/`img-src`/`default-src` are locked
   to `'self'` (+ OSM tiles). It is lost defense-in-depth to track post-MVP (tighten
   to nonces/hashes), recorded as risk **R-08b** — not a blocker for this keyless,
   auth-free, secret-free app.

### Trajectory-eval (G7)
The *process* of all 9 slices was graded by a fresh judge (maker ≠ checker) →
`docs/qa/trajectory-eval-report.md`: **36/36 judgements pass**. Per-dimension means:
process-order 94.4 / test-integrity 95.1 / in-scope 91.9 / craft 94.8 (pass bar 70);
weakest single score 82 (add-city-search in-scope — commit-hygiene scope-bleed of
forwarded docs, not code drift).

## 6. NFR status by class (honest)

**Local-verified now:**
- **NFR-A11Y-02** AA contrast — computational `lib/a11y/contrast.test.ts` (9 tests,
  light + dark).
- **NFR-A11Y-01** roles / accessible names / focus — JSDOM component tests.
- **NFR-OBS-01** honest under failure — tests + evals (all ≥ 90).
- **NFR-I18N-01** Ukrainian-first, no runtime i18n library.
- **NFR-COST-01** keyless, zero paid keys, no secrets.
- **NFR-PERF-03** bundle — build-verified + review-confirmed (Recharts/Leaflet lazy
  chunks). Caveat: **no automated byte-budget ratchet** yet (risk R-08).

**Deploy-gated — PENDING live measurement (explicit, intentional, not failures):**
- **NFR-PERF-01** p95 TTFB ≤ 300 ms.
- **NFR-PERF-02** Lighthouse Performance ≥ 90 (mobile + desktop).
- **NFR-A11Y-01** Lighthouse Accessibility score ≥ 95 + live axe scan.
- **E2E recordings** — env-gated: no Playwright (TC-STACK-05); chrome-devtools MCP
  not connected (ADR-0004).

## 7. Remaining before production (user/deploy-gated)

The autonomous work (G0–G7) is complete and committed. These steps need the
operator and are not done autonomously (see `docs/technical/deployment.md` §7):

1. **Push** to the Git remote.
2. **Deploy** to Vercel (preview + production).
3. **CI on the remote** — run `.github/workflows/ci.yml` against the pushed branch.
4. **Measure the deploy-gated NFRs** (§6) on the live URL and record them.
5. **Capture E2E recordings** (per `docs/qa/demo-script.md`) + live axe when the
   chrome-devtools MCP is available.
6. Confirm the production **Nominatim User-Agent/Referer** and OSM tile policy
   compliance on the live host (risk R-02).

## 8. Effort log (derived from git timestamps, Europe/Kyiv)

Times are commit timestamps from `git log`; a "session" groups contiguous work.
This is delivery effort, not a billing record.

| Session | Window | Work | Commits |
|---|---|---|---|
| Setup (G0–G3) | 2026-06-25 20:35 → 21:04 | Scaffold + loop, adopt requirements, 9 specs, capability plan | `efef101`, `afdcee0`, `0bc1669`, `3433a4c` |
| Wave 0–1 slices | 2026-06-25 22:32 → 2026-06-26 12:08 | app-shell, comfort-score, top-clock, bottom-jokes | `5301da5`, `ca66a02`, `b2ed754`, `966ebd4` |
| Wave 2–3 slices | 2026-06-26 13:14 → 17:38 | city-search, forecast, map | `d6706a6`, `d98a540`, `e835391` |
| Wave 4–5 slices | 2026-06-27 00:11 → 11:08 | animated-bg, weekend-compare | `520431d`, `0cd2122` |
| G5 integration | 2026-06-27 11:25 | cross-slice flow (21 tests) + coverage baseline | `e0cacfa` |
| G6 graded quality | 2026-06-27 12:32 → 12:35 | eval copy fixes (≥ 90), acceptance pack, battery record | `07f767b`, `46ebe89`, `9e594df` |
| G7 global review | 2026-06-27 16:39 | 2 substantive fixes (timezone + hydration) + G7 evidence | `996a030`, `c7689ff` |

**Span:** first commit 2026-06-25 20:35 → last 2026-06-27 16:39 — ~2 calendar days,
9 capability slices + 8 gates, 14 graded copy cases, and 2 global-review fixes, all
green. The remaining production steps (§7) are user/deploy-gated.

---

*Generated by QA documentation. Sources: `git log`, `docs/qa/*` (eval-report,
global-review-findings, trajectory-eval-report, automated-verification-latest),
`quality/*-baseline.json`, `npm audit`. QA documents the independently-graded
results; it does not grade or review (maker ≠ checker).*
