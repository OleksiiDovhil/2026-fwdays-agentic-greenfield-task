# Weather Explorer — keyless weekend trip planner

A small, privacy-first, **Ukrainian-first** web app for deciding where to spend the
weekend by the weather: a 7-day forecast, a per-day **comfort score** with a calm
Ukrainian rationale, an interactive OpenStreetMap map (click or "use my location"),
a condition-driven animated background, and a side-by-side **weekend comparison**
of up to three cities.

Built for **fwdays Academy · Agentic Engineering: Greenfield** (the original task is
preserved in [`TASK.md`](TASK.md)). The point of the exercise is the **process**, not
the product size — so this repository is delivered through a full, gated, spec-driven
agentic loop with verification at every step (see [Engineering approach](#engineering-approach)).

## Highlights

- **Keyless & stateless** — all data from [Open-Meteo](https://open-meteo.com)
  (forecast + geocoding) and OSM raster tiles + Nominatim reverse-geocoding. No
  database, no auth, no cookies, no analytics, no paid keys (ADR-0003).
- **Privacy-first** — geolocation only on an explicit click, never on load.
- **Honest under failure** — every input or upstream fault degrades to one calm,
  visible inline state; no generic 500, no silent blank, console clean.
- **Accessible & themed** — WCAG-AA contrast verified computationally in both
  light and dark themes; hydration-safe theming with no first-paint flash.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
Leaflet + Recharts (lazy) · Vitest (no Playwright — see ADR-0004).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Validation battery:

```bash
npm run lint
npm run test:run         # 589 unit/component tests (Vitest)
npm run test:integration # 21 integration tests over mocked Open-Meteo
npm run build
npm run qa:verify        # the full deterministic gate battery
npx openspec validate --all --strict
```

## Engineering approach

Delivered with **Project Factory** — a spec-driven, multi-agent loop where
deterministic checks exist *before* the code they guard, and a red check is a stop
(never bypassed). The discipline, not the feature set, is the deliverable:

- **Spec-driven (SDD).** Requirements are numbered (`FR/NFR/TC/BC` in
  [`docs/requirements.md`](docs/requirements.md)); OpenSpec capability specs drive
  the build; tests and commits trace back to requirement ids.
- **Gated lifecycle G0–G7.** Scaffold → requirements → baseline specs → capability
  plan → per-slice delivery → cross-cutting hardening → QA proof + evals → global
  review & release readiness. `npm run gate:status` reports the deterministic state.
- **Test-first.** Each slice's tests are written from the spec and observed to fail
  (red) before implementation makes them green. **610 tests** pass; line coverage
  is ratcheted (95.78%).
- **Evals are the quality bar.** Beyond pass/fail tests, a fresh LLM judge grades
  user-visible quality (error clarity, empty-state usability, Ukrainian copy tone,
  comfort-rationale legibility) 0–100. **All 14 eval cases score ≥ 90**, guarded by
  a committed ratchet.
- **maker ≠ checker.** The agent that builds a slice never reviews or grades it.
  Review, trajectory grading, and evals come from independent agents. The
  pre-release global review (evidence in `docs/qa/global-review-findings.json`)
  caught and fixed two real defects the unit tests had missed — a timezone-frame
  bug in the hourly chart and a theme hydration mismatch.

## Documentation

- [`docs/product-brief.md`](docs/product-brief.md) — narrative & goals
- [`docs/requirements.md`](docs/requirements.md) — numbered FR/NFR/TC/BC
- [`docs/technical/architecture.md`](docs/technical/architecture.md) — system design
- [`docs/technical/deployment.md`](docs/technical/deployment.md) — deploy guide
- [`docs/qa/delivery-report.md`](docs/qa/delivery-report.md) — delivery + effort report
- [`docs/qa/`](docs/qa/) — traceability matrix, acceptance report, manual test plan, risk register
- [`docs/adr/`](docs/adr/) — accepted architecture decisions
- [`AGENTS.md`](AGENTS.md) — the agent rules (the static context for this repo)

## Status

Gates **G0–G7 pass** (deterministic). What remains is deploy-gated and intentionally
pending live measurement: a Vercel deployment, the live-URL smoke check, and the
metrics that need a running instance (Lighthouse performance & accessibility scores,
p95 TTFB) plus browser E2E recordings (environment-gated — no Playwright per the
stack constraints). See the delivery report's "remaining before production" section.
