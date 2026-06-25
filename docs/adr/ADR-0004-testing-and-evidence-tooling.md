# ADR-0004: Testing layers and evidence tooling (no Playwright)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** orchestrator + user

## Context

TC-STACK-05 is explicit: **Vitest for unit tests on `lib/`; no Playwright in MVP;
use `chrome-devtools` MCP for E2E verification recordings.** The Project Factory
default evidence tooling — `scripts/check-a11y.mjs` and
`scripts/record-demos.mjs` — is built on `@playwright/test` + `@axe-core/
playwright`. So the framework default conflicts with the requirement, and the
requirement's mandated tool (chrome-devtools MCP) is **not connected in the
current headless build environment** (verified: only Gmail/Calendar/Drive/Indeed
MCP + WebFetch are available).

## Decision

We honour TC-STACK-05 strictly: **do not install Playwright.**

- **Deterministic test layers:** Vitest only —
  - unit + component (jsdom) over `lib/` and `components/` (`test:run`);
  - service-integration over mocked Open-Meteo payloads (`test:integration`).
- **E2E verification:** via **chrome-devtools MCP** when available, captured as
  recordings under `docs/qa/` (Phase 6). `test:e2e` is a non-failing placeholder
  (`scripts/e2e.mjs`) so the battery never reports a browser pass that did not
  happen.
- **WCAG-AA contrast (NFR-A11Y-02):** verified **computationally** — a pure
  function computes the contrast ratio of every design token pair in light and
  dark and asserts ≥ 4.5:1 (≥ 3:1 for large text). This needs no browser and is
  unit-tested + eval-graded.
- **Accessible names / roles / focusability (NFR-A11Y-01, testable parts):**
  asserted in jsdom component tests (Testing Library).
- **Browser-rendered evidence** that genuinely needs a live browser — demo/proof
  **video recordings**, the live axe DOM scan (`check-a11y.mjs`), and the
  **vision-verify** still-image pass — is **environment-gated** while
  chrome-devtools MCP is absent. It is reported as `pending (env: chrome-devtools
  MCP unavailable)` in the gate output — never silently skipped and never faked.

The user's stated delivery bar — **every eval dimension ≥ 90** — is unaffected:
output evals grade pure `lib/` outputs via `produce()` and require no browser.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Honour the ban; env-gate browser evidence (chosen) | Respects TC-STACK-05; eval goal fully achievable; nothing faked | Video/live-axe/vision evidence pends a chrome-devtools MCP env |
| Install Playwright as "dev-only" for evidence | Real videos + live axe now | Installs the explicitly-banned package for a secondary gate the goal doesn't need |
| Add Puppeteer instead | Not literally "Playwright" | Same heavyweight browser-driver the requirement steers away from; bad-faith reading |

## Consequences

- `check-a11y.mjs`, `record-demos.mjs` remain in the repo (PF infra) but are not
  run here; `qa:verify` excludes the browser-only checks so the battery stays
  green and honest. `check-recordings.mjs` (pure Node) still gates any recordings
  that DO get produced.
- If the user connects chrome-devtools MCP (or approves a narrow, documented
  Playwright exception strictly for evidence generation), the recordings + live
  a11y + vision-verify gates can be completed without changing app code.
- This decision is surfaced to the user before Phase 6, where it first bites.
