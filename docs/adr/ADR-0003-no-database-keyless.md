# ADR-0003: No database, auth, email — keyless and stateless

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** orchestrator + user

## Context

The product is explicitly keyless and privacy-first. The single actor is an
anonymous visitor with no account, no roles, and nothing persisted server-side
(product brief; BC-PRIVACY-01/02/03; NFR-COST-01). All data is read live from
keyless services (Open-Meteo forecast + geocoding, OSM tiles). The Project
Factory default stack includes Postgres/Drizzle, Better Auth, and Resend — none
of which this product needs.

## Decision

We will ship **no database, no authentication, and no email**. State that must
survive a reload lives in the **URL** (`?lat=&lon=&name=`, FR-SEARCH-03) and, for
the session only, in memory (last forecast cache, FR-FORECAST-05; pinned compare
cities, FR-COMPARE-01). The Project Factory loop is adapted accordingly: the
per-slice "smoke flow" is a **service/integration flow over mocked Open-Meteo
payloads**, not a real-DB smoke; DB/auth/email gates and checks are omitted.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Keyless, stateless (chosen) | Matches privacy/cost constraints; no secrets; trivial deploy | "Favorites/history" impossible — but they are explicitly out of scope |
| Add a DB "just in case" | Future features cheaper | Violates BC-PRIVACY/NFR-COST; adds migrations, secrets, attack surface |
| LocalStorage for pins | Survives reload | A form of client storage; URL-sharing already covers the share use case; keep MVP minimal |

## Consequences

- No migrations, no connection secrets, no auth guards, no RBAC — large parts of
  the default loop simply do not apply.
- Server actions/route handlers still must never 500 on bad input or fail
  silently on a bad upstream response (NFR-OBS-01) — the error-surface rule
  applies to the Open-Meteo/geocoding calls instead of DB writes.
- Deployment is a static/edge-friendly Next.js app with zero env secrets
  required.
