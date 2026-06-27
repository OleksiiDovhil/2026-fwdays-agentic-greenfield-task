# Deployment — Weather Explorer

How to deploy Weather Explorer and what becomes verifiable only after it is live.
Companion to `docs/technical/architecture.md`. Authority: `docs/requirements.md`,
`docs/adr/`.

## 1. Target and prerequisites

- **Host:** Vercel (Git-integrated; a preview URL per PR, **TC-DEPLOY-01**).
- **Framework:** Next.js 16.2.9 (App Router, Turbopack), React 19.2.4, TypeScript
  strict (**TC-STACK-01**, ADR-0001).
- **Runtime:** Node 25 (the repo's dev/build runtime). Set the Vercel project's Node
  version accordingly.
- **Build command:** `next build` (the repo's `npm run build`).
- **Output:** `/` is **statically prerendered**; the three API routes
  (`/api/forecast`, `/api/geocode`, `/api/reverse-geocode`) are dynamic, server-
  rendered on demand. (Confirmed in the build output: `○ /` static, `ƒ /api/*`
  dynamic.)

## 2. Environment variables / secrets

**None required.** The app is keyless and stateless (**ADR-0003**, **NFR-COST-01**):
no database, no auth, no email, no API keys or tokens. All upstreams (Open-Meteo,
OSM Nominatim, OSM tiles) are keyless. `npm audit --audit-level=high` reports **0
vulnerabilities**, and there are **no secrets in the repo or git history** (verified
at G7). `.env.local` is git-ignored and contains no secrets even locally.

> If a future change introduces a non-keyless upstream, it must keep the
> TC-DATA-01 route-handler pattern (the upstream URL/key lives only in the handler,
> never the client bundle) and add the secret to Vercel project env — but the MVP
> needs zero.

## 3. Build & deploy steps

1. Push to the Git remote; Vercel's Git integration builds the branch and produces
   a **preview URL** (per-PR). Merging to the default branch promotes to production.
2. Vercel runs `next build`. No migrations, no seed, no post-deploy job (there is no
   database — ADR-0003).
3. Confirm the deployed routes: `/` (static) and the three `/api/*` handlers
   (dynamic). The handlers do the keyless server-side `fetch` to the upstreams.

There is no separate backend, no container, no cron, no queue.

## 4. Upstream dependencies and their usage policies (operational obligations)

The app calls these at runtime; honoring their policies is an operational obligation
(details in `docs/technical/architecture.md` §8 and ADR-0005):

- **Open-Meteo** (forecast + geocoding) — keyless, free (**TC-STACK-03**). Called
  server-side from `/api/forecast` and `/api/geocode` with a short
  `AbortSignal.timeout`. Forward-only geocoding (no reverse endpoint).
- **OSM Nominatim** (`/reverse`) — keyless (**ADR-0005**). The reverse-geocode
  handler **must send a descriptive, contactable `User-Agent` and a correct
  `Referer`** identifying the production deployment, and stay within ≤ 1 req/s (a
  single human map click is far below this). HTTPS only; results are not stored.
  A placeholder identity would breach the policy — confirm the production identity
  at deploy (risk **R-02**). On any Nominatim failure the click still sets the
  location from coordinates (calm fallback).
- **OSM raster tiles** (`*.tile.openstreetmap.org`) — keyless (**TC-STACK-04**).
  The **OSM Tile Usage Policy** (**TC-MAP-01**) requires HTTPS, a valid Referer, no
  scraping, and visible attribution: "© OpenStreetMap contributors" is always shown
  on the map (FR-MAP-04). The CSP `img-src` already allowlists the tile host.

## 5. Security headers (shipped in `next.config.ts`)

Applied to every route: `Content-Security-Policy` (`default-src 'self'`,
`connect-src 'self'`, `img-src 'self' data:` + OSM tiles; `script-src 'self'
'unsafe-inline'` for Next hydration), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`. The
`'unsafe-inline'` on `script-src` is a tracked post-MVP hardening item (no XSS sink
today; risk **R-08b**). The `Referrer-Policy` keeps a valid Referer for OSM/Nominatim
while not leaking full URLs cross-origin.

## 6. What is verifiable only after deploy (honest, intentional — not failures)

These are **deploy-gated** and reported PENDING until measured on the live URL at
Gate G7. They are explicit, never silently skipped, never used to pass a local gate
(see `docs/qa/requirements-traceability-matrix.md` §NFR and the risk register):

| Item | Why it needs the live URL | How to measure |
|---|---|---|
| **NFR-PERF-01** — TTFB ≤ 300 ms p95 | Real edge/CDN serving | p95 TTFB on the Vercel preview |
| **NFR-PERF-02** — Lighthouse Performance ≥ 90 | Production bundle + network | Lighthouse, mobile + desktop, on the production URL |
| **NFR-A11Y-01** — Lighthouse Accessibility ≥ 95 + live axe | Rendered DOM in a real browser | Lighthouse a11y + an axe scan (browser) |
| **E2E demo recordings** | Visual proof in a real browser | chrome-devtools MCP (env-gated: no Playwright, **TC-STACK-05**/ADR-0004) |

Locally verified already (do not need deploy): AA contrast (computational
`lib/a11y/contrast.test.ts`), a11y roles/names/focus (JSDOM), honest-under-failure
(tests + evals ≥ 90), Ukrainian-first i18n, keyless/zero-secrets, and the bundle
shape (Recharts/Leaflet lazy chunks — build-verified; note the **no automated
byte-budget ratchet** gap, risk R-08).

## 7. Remaining user-gated steps for production (G7)

The autonomous review work (Gates G0–G7) is complete and committed. The remaining
steps require the user / operator and are **not** done autonomously:

1. **Push** the repository to the Git remote.
2. **Deploy** to Vercel (connect the repo; first preview + production).
3. Run **CI on the remote** (the `.github/workflows/ci.yml` battery against the
   pushed branch).
4. **Measure the deploy-gated NFRs** (§6) on the live URL and record them.
5. **Capture the E2E recordings** when the chrome-devtools MCP is available
   (per `docs/qa/demo-script.md`), and run the live axe scan.

Until then the functional MVP is delivered and locally verified; the deploy-gated
evidence is honestly pending.
