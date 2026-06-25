# Current State — Weather Explorer

> Persistent handoff. Update at every milestone. Source of truth is code/specs/
> tests — if this conflicts, verify and fix this file.

- **Last updated:** 2026-06-25 (Europe/Kyiv)
- **Phase:** 0 — scaffold + loop install (Gate G0), in progress
- **Delivery goal:** every eval dimension ≥ 90 (Gate G6), driven in a loop.

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

Finish Gate G0: adapt `qa-verify` battery + `.gitignore` + eslint ignores, run
`npm run lint && npm run build`, verify git hooks fire on a test commit, commit
the scaffold + loop. Then Phase 1: adopt `docs/requirements.md` +
`docs/product-brief.md` (provided by the user), scope summary, commit.
