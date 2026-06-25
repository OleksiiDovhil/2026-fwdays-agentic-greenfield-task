# Weather Explorer — Agent Rules

Keyless, privacy-first, Ukrainian-first weekend trip planner. `CLAUDE.md` is a
single line: `@AGENTS.md`.

# This may NOT be the Next.js you know

Installed version **Next.js 16.2.9 (App Router) · React 19.2.4 · TypeScript
strict**. APIs and conventions may differ from training data. **Read the relevant
guide in `node_modules/next/dist/docs/` before writing any Next.js code** (routing,
server/client components, `dynamic`, metadata, route handlers). Heed deprecations.

Use `docs/requirements.md` (numbered FR/NFR/TC/BC) as the requirements source of
truth; `docs/product-brief.md` for narrative.

## Project Factory (spec-driven, multi-agent)

Delivered with **Project Factory**. The deterministic loop — `scripts/check-*`
(traceability, coverage, eval, trajectory, a11y, recordings), git hooks, CI,
OpenSpec specs, and the gates G0–G8 — is the law. A red check is a STOP: fix the
check, never weaken or bypass it (no `--no-verify`). Maker ≠ checker: the agent
that built a slice never reviews/grades it.

## Project Handoff Protocol

Before planning or implementing any substantive change, read:

1. `docs/current-state.md` — latest handoff + exact next step.
2. `docs/mvp-capability-plan.md` — change sequence and capability scope.
3. `openspec/project.md` and the relevant files under `openspec/specs/`.
4. `docs/adr/` — accepted architecture decisions.

Keep `docs/current-state.md` current at every milestone (OpenSpec change
created/implemented/validated/archived; capability planned→implemented; an ADR
accepted). Stamp last-updated date/time (timezone: **Europe/Kyiv**) and the
current phase. It is a handoff aid, not the source of truth — if it conflicts
with code/specs/tests, verify and update it.

## Context architecture (static vs dynamic)

This file is **static context** — paid every agent turn — so keep it to durable
cross-cutting rules. Per-domain detail lives in the spec, the code, or
`node_modules/next/dist/docs/`. See `docs/context-architecture.md` for the budget.

## Stack constraints (do not drift — see docs/adr/)

- **Keyless & stateless.** No database, no auth, no email, no server-side
  persistence (ADR-0003). All data is Open-Meteo (forecast + geocoding, keyless,
  TC-STACK-03) and OSM raster tiles (TC-STACK-04). Zero paid keys (NFR-COST-01).
- **Privacy-first.** No analytics, no trackers, no fingerprinting, no
  application-set cookies (BC-PRIVACY-01/03). Geolocation ONLY on an explicit
  user action — never on load (BC-PRIVACY-02).
- **No Playwright** (TC-STACK-05). Unit/component/integration = Vitest; E2E
  verification = chrome-devtools MCP recordings. See ADR-0004.

## Module conventions

- `lib/<domain>/` is **framework-free** (TC-PURE-01): no `next/*`, no `react`,
  no DOM globals — 100% unit-testable. Pure helpers in their own files with a
  colocated `*.test.ts`. Example: `lib/scoring/comfort.ts` is a pure total
  function (FR-COMFORT-01).
  - `validation.ts` (zod) parses BOTH user input and external API responses —
    never trust an Open-Meteo / geocoding payload's shape; parse it.
  - `queries.ts` performs the keyless `fetch` to Open-Meteo / OSM.
  - `service.ts` orchestrates query → validate → transform; returns typed
    results or a typed failure (never throws raw to the UI).
- `app/` route segments are thin **server components**; mark a component
  `"use client"` only when it needs interactivity/browser APIs (map, animated
  background, search box, live clock).
- Client-only widgets that touch `window`/Leaflet load via
  `dynamic(() => import(...), { ssr: false })` with a same-footprint skeleton
  (FR-MAP-05).
- UI strings are centralised in `lib/i18n/uk.ts` (Ukrainian-first) with `en.ts`
  fallback; no runtime i18n library in MVP (NFR-I18N-01). Tone is calm and
  practical; **no exclamation marks** anywhere in product copy (BC-BRAND-01).

## Correctness rules (honest under failure — NFR-OBS-01)

- No user input or external call produces a generic 500 or a silent blank.
  Build the inline-error pattern in the first slice (a shared, calm error/empty
  state) and reuse it everywhere. Geocoding with zero results shows an inline
  "Нічого не знайдено", never an error toast (FR-SEARCH-05).
- External calls (Open-Meteo, OSM, geocoding) never fail silently: degrade to a
  calm, visible state and keep the console clean on a healthy session.
- Numeric/locale parsing is total: accept the values Open-Meteo returns
  (negatives, zeros, nulls for missing hours) without throwing.
- Comfort scoring is a **pure total function**: defined for every input,
  rationale ≤ 80 chars, Ukrainian, no emoji (FR-COMFORT-01/03).
- Day-vs-night and "this weekend" use the **active location's** local dates /
  sunrise-sunset, not the visitor's clock (FR-ANIM-02, FR-COMFORT-05). Use local
  calendar dates for day-bound logic — never `toISOString().slice(0,10)`.
- The animated background never intercepts clicks (`pointer-events: none`,
  FR-ANIM-04) and respects `prefers-reduced-motion` (FR-ANIM-03).

## Test-first (per slice)

Write the slice's unit/component tests from the spec FIRST and confirm they FAIL
(red); then implement to green. Never weaken a test to pass it — if a test
contradicts the spec, change it deliberately, not silently. Every test file
carries `@trace FR-x` annotations.

## Validation cadence

Run before and after substantial changes:

```bash
npm run lint
npm run test:run
npm run build
npx openspec validate --all --strict
node scripts/check-eval-ratchet.mjs   # once evals exist — the graded-quality bar
```

Do not archive an OpenSpec change before implementation AND its smoke flow pass.
Keep `.env.local` private; never commit or print it (there are no secrets anyway).

## Evals (graded quality, not just correctness — the project's bar)

Tests assert exact results; **evals grade quality** a unit test can't — error
clarity, empty-state usability, Ukrainian copy tone, comfort-rationale
legibility — scored 0–100 against a rubric. **The delivery bar for this project
is: every eval dimension ≥ 90.**

- Cases live in `evals/cases/*.eval.ts`: `scenario` + async `produce()` (drive a
  pure `lib/` service and return the user-visible output) + `rubric` (mark gating
  lines `CRITICAL:`) + `@trace` ids. Group by `dimension`; the ratchet guards
  each dimension separately.
- The `eval-suite` workflow grades them with a fresh `eval-judge` (maker≠checker),
  writing `docs/qa/eval-report.md` + `evals/results/*.json`.
- `node scripts/check-eval-ratchet.mjs` guards the committed score (no API key).
  Quality may ratchet up, never silently drop. Wired as `check:eval`.

## Environment notes

- macOS (darwin), zsh. Node 25, npm 11. `npx openspec` → local
  `@fission-ai/openspec`.
- **No database / auth / email** — omit those steps from any per-slice loop;
  the "smoke flow" is a service/integration flow over mocked Open-Meteo payloads.
- Open-Meteo and OSM are keyless and free; respect the OSM Tile Usage Policy
  (HTTPS, attribution, valid Referer; no scraping) — TC-MAP-01.
