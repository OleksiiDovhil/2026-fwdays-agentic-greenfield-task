# Current State — Weather Explorer

> Persistent handoff. Update at every milestone. Source of truth is code/specs/
> tests — if this conflicts, verify and fix this file.

- **Last updated:** 2026-06-26 (Europe/Kyiv)
- **Phase:** 4 in progress — Wave 1 COMPLETE; `add-city-search` IMPLEMENTED +
  VALIDATED (tests/lint/build/openspec green), NOT yet eval-graded or archived.
- **Delivery goal:** every eval dimension ≥ 90 (Gate G6), driven in a loop.

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
6. add-forecast  ◀ NEXT (Wave 3) · 7. add-map · 8. add-animated-bg · 9. add-weekend-compare

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

`add-city-search` is IMPLEMENTED + VALIDATED (lint/test:run [259]/build/openspec/
traceability green; smoke over mocked geocoding passed). PENDING (maker≠checker):
the eval-suite judge grades the `search.*` copy (target ≥ 90 on `search-empty-clarity`
+ `geolocation-denied-clarity`), then the review-gate, then
`npx openspec archive add-city-search --yes --skip-specs`. After archive, start
**Wave 3: `add-forecast`** (and `add-map`) — both CONSUME the active location this
slice writes (`useLocation()`) and REUSE the `app/api/geocode` server/route pattern
to fetch Open-Meteo forecast data (keyless, zod-parsed, typed-result, client-driven
per the ARCHITECTURE LESSON).
