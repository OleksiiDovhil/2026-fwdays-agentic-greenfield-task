# Current State — Weather Explorer

> Persistent handoff. Update at every milestone. Source of truth is code/specs/
> tests — if this conflicts, verify and fix this file.

- **Last updated:** 2026-06-25 (Europe/Kyiv)
- **Phase:** 3 done (plan, G3) → starting Phase 4 (per-slice build).
- **Delivery goal:** every eval dimension ≥ 90 (Gate G6), driven in a loop.

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

1. add-app-shell (foundational: layout, i18n, LocationProvider, error/empty
   pattern, theme, slot stubs)  ◀ NEXT
2. add-comfort-score · 3. add-top-clock · 4. add-bottom-jokes (parallel-safe)
5. add-city-search · 6. add-forecast · 7. add-map · 8. add-animated-bg
9. add-weekend-compare
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

Finish Gate G0: adapt `qa-verify` battery + `.gitignore` + eslint ignores, run
`npm run lint && npm run build`, verify git hooks fire on a test commit, commit
the scaffold + loop. Then Phase 1: adopt `docs/requirements.md` +
`docs/product-brief.md` (provided by the user), scope summary, commit.
