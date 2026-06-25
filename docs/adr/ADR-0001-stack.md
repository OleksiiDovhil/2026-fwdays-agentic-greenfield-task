# ADR-0001: Adopt the requirement-mandated Next.js stack

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** orchestrator + user

## Context

`docs/requirements.md` fixes the stack via accepted technical constraints:
Next.js 16.2 App Router + React 19.2 + TypeScript strict (TC-STACK-01); Tailwind
CSS 4 with shadcn/ui and class-variance-authority (TC-STACK-02); Open-Meteo for
all weather/geocoding data (TC-STACK-03); Leaflet + react-leaflet over OSM raster
tiles (TC-STACK-04). The Project Factory default stack (Postgres/Drizzle, Better
Auth, Resend, Playwright) is therefore only a partial fit and must be adjusted
(see ADR-0003, ADR-0004).

## Decision

We will build on **Next.js 16.2.9 (App Router) · React 19.2.4 · TypeScript
strict · Tailwind CSS 4 (PostCSS) · shadcn/ui + cva · Open-Meteo · Leaflet/
react-leaflet**, scaffolded with `create-next-app` (no `src/` dir, so `app/` and
the framework-free `lib/` sit at the repo root to match the paths the
requirements cite and TC-PURE-01).

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Requirement-mandated stack (chosen) | Matches accepted TCs; keyless; modern | Diverges from PF defaults — needs ADR-0003/0004 |
| PF default stack as-is | Less framework friction | Violates TC-STACK-03/04, adds an unneeded DB/auth/email |
| Pin exact Next 16.2.0 | Literal match to "16.2" | 16.2.9 is the current 16.2 patch; floor satisfied, fixes included |

## Consequences

- The keyless data layer (Open-Meteo/OSM) removes whole classes of risk (no
  secrets, no DB migrations) — see ADR-0003.
- We must adapt the Project Factory loop (per-slice smoke, gates) to a DB-less,
  auth-less stack; the framework explicitly supports this ("the declared stack
  drives the loop").
- `lib/` must stay framework-free (TC-PURE-01) to keep 100% unit-testability.
