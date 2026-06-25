# OpenSpec Project — Weather Explorer / Weekend Trip Planner

> OpenSpec 1.4.1 stores machine config in `openspec/config.yaml`. This file is the
> human-readable project overview that `AGENTS.md` points contributors to.

## What this is

A keyless, privacy-first, Ukrainian-first web app that helps an anonymous visitor
decide whether — and where — a weekend trip is worth taking based on the weather.
A 7-day forecast with per-day comfort scoring, an interactive map, and a calm
animated background that reflects the sky at the chosen place.

- **Source of truth:** `docs/requirements.md` (numbered FR/NFR/TC/BC) and
  `docs/product-brief.md` (narrative).
- **Single actor:** anonymous visitor. No accounts, no roles, no persistence.

## Stack (see docs/adr/)

- Next.js 16.2 App Router · React 19.2 · TypeScript strict (TC-STACK-01)
- Tailwind CSS 4 (PostCSS) · shadcn/ui · class-variance-authority (TC-STACK-02)
- Open-Meteo forecast + geocoding, keyless (TC-STACK-03)
- Leaflet + react-leaflet, OSM raster tiles (TC-STACK-04)
- Vitest for unit/component/integration; chrome-devtools MCP for E2E recordings;
  no Playwright (TC-STACK-05)
- **No database, no auth, no email** — keyless and stateless (ADR-0003)

## Conventions

- `lib/<domain>/` is framework-free and 100% unit-testable (TC-PURE-01): no
  `next/*`, no `react`, no DOM globals.
- UI strings centralised in `lib/i18n/uk.ts` (+ `en.ts`), Ukrainian-first,
  calm tone, no exclamation marks (NFR-I18N-01, BC-BRAND-01).
- Every external call and user input degrades honestly — never a generic 500,
  never a silent blank (NFR-OBS-01).

## Capabilities

`app-shell`, `top-clock`, `city-search`, `bottom-jokes`, `forecast`,
`comfort-score`, `map`, `animated-bg`, `weekend-compare`. See
`docs/mvp-capability-plan.md` (Phase 3) for slicing and ownership.
