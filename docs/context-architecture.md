# Context Architecture — static vs dynamic

Recorded as ADR-0002. Defines what an agent pays for on every turn (static) vs
what it loads on demand (dynamic), with a token budget that keeps the static
layer lean.

## Static layer (paid every turn) — budget ≤ ~1,500 tokens

- `AGENTS.md` — durable cross-cutting rules only (stack constraints, module
  conventions, correctness rules, test-first, eval bar). `CLAUDE.md` is just
  `@AGENTS.md`.

When `AGENTS.md` grows past the budget, **demote** detail to the dynamic layer
(a domain doc, a spec, or a skill) rather than silently raising the budget.

## Dynamic layer (loaded on demand)

- **Requirements & specs:** `docs/requirements.md`, `docs/product-brief.md`,
  `openspec/specs/<cap>/spec.md`, `openspec/changes/<change>/`.
- **Plan & handoff:** `docs/mvp-capability-plan.md`, `docs/current-state.md`.
- **Decisions:** `docs/adr/`.
- **Framework truth:** `node_modules/next/dist/docs/` — read before writing
  Next.js code; versions move faster than training data.
- **Per-domain code:** each `lib/<domain>/` module is self-describing
  (validation + queries + service + tests).
- **Evidence:** `docs/qa/` (traceability, eval report, recordings).

## Why

Agents are billed for static context on every turn across a long multi-phase
build. Keeping `AGENTS.md` tight and pushing specifics into on-demand files keeps
each turn cheap while preserving recall: the spec, the code, and the bundled
Next.js docs are authoritative and fetched only when the task touches them.
