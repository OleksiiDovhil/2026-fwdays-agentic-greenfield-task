# ADR-0002: Static vs dynamic context split

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** orchestrator + user

## Context

This is a long, multi-phase, multi-agent build. Static context (read every agent
turn) is paid repeatedly; without a budget it bloats and every turn gets more
expensive. The requirements also warn that Next.js 16 may differ from training
data, so framework truth must be fetched on demand, not memorised.

## Decision

We will keep a **lean static layer** — `AGENTS.md` (durable cross-cutting rules)
plus `CLAUDE.md` → `@AGENTS.md` — under a ~1,500-token budget, and push all
per-domain detail, procedures, specs, and framework docs into a **dynamic layer**
loaded on demand. The full split and budget live in
`docs/context-architecture.md`.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Lean static + dynamic on demand (chosen) | Cheap per turn; recall preserved via specs/code | Requires discipline to demote detail |
| Fat `AGENTS.md` with everything | One file to read | Expensive every turn; goes stale; drowns the rules that matter |

## Consequences

- When `AGENTS.md` exceeds budget, demote to a domain doc/spec/skill — never
  silently raise the budget.
- Agents must open the spec, the code, and `node_modules/next/dist/docs/` for
  specifics rather than assume.
