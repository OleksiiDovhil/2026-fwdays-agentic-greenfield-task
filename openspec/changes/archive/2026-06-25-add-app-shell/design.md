## Context

This is Wave 0, the single serialize point (capability plan §3a). The shell owns
the files many later slices touch — `app/page.tsx`, `lib/i18n/uk.ts`/`en.ts`, the
active-location mechanism — so it must define their shapes precisely once. Stack
reality (ADR-0003/0004): **no database, no auth, no email**; state lives in the
**URL + memory only**; tests are **Vitest** (unit + jsdom component) with **no
Playwright**; WCAG-AA contrast is verified **computationally** (a pure function),
not in a browser. `lib/` is **framework-free** (TC-PURE-01): no `next/*`, no
`react`, no DOM. Next.js 16.2 App Router conventions apply (read
`node_modules/next/dist/docs/`): `"use client"` marks a Server↔Client boundary,
and providers should wrap `{children}` as deep as practical so static server
content stays static. Tailwind 4 uses the `@theme`/CSS-variable model (no JS
config). The decisions below are the contracts later slices build on.

## Goals / Non-Goals

**Goals:**

- Establish the responsive single-page frame (FR-SHELL-01/02) and the first-load
  empty state with a centered search slot (FR-SHELL-03).
- Pin the five reusable conventions: i18n dictionary shape, active-location state
  (`Location` + URL parse/serialize + `useLocation()`), theme mechanism, the
  shared `Notice` error/empty primitive, and the AA-contrast palette tokens.
- Compose `app/page.tsx` from **named slot components** so later slices edit their
  own slot file, never the shared page (§3a).
- Keep all domain logic framework-free and 100% unit-testable (TC-PURE-01).
- Calm, Ukrainian-first copy with **no exclamation marks** anywhere (BC-BRAND-01).

**Non-Goals:**

- The real city-search input, geolocation, forecast, map, animated background,
  weekend-compare, the live clock, and the jokes — those are owning slices. This
  slice ships their slots as inert stubs only.
- Any database / auth / email / cookie / analytics (ADR-0003, BC-PRIVACY-*).
- A runtime i18n library — a typed dictionary + `t()` only (NFR-I18N-01).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004.

## Decisions

### D1 — i18n: typed dictionary, Ukrainian-first, namespaced per domain (NFR-I18N-01, BC-BRAND-01)

- `lib/i18n/uk.ts` is the **default** (Ukrainian-first) dictionary; `lib/i18n/en.ts`
  is the **fallback**, same key shape. `lib/i18n/index.ts` exports the typed
  dictionary type (derived from `uk`) and a `t(key)` accessor that returns the UK
  value, falling back to the EN value when a key is absent from UK, and never
  emits a missing-key placeholder or console error (spec: "Missing Ukrainian key
  falls back to English").
- **Namespacing:** strings are grouped per domain — `uk.shell.*` now; later slices
  add `uk.search.*`, `uk.forecast.*`, `uk.clock.*`, `uk.jokes.*`, … as sibling
  namespaces so slices extend the dictionary **without key collisions** (§3a).
- Tone is calm and practical; a unit test asserts **no value contains `!`** in any
  locale (BC-BRAND-01). Framework-free so it is fully unit-testable (TC-PURE-01).
- **Trade-off:** a hand-rolled `t()` has no pluralization/interpolation engine; the
  MVP copy does not need one, and avoiding a runtime i18n dep keeps the client
  bundle small (NFR-PERF-03). If interpolation is later needed, `t()` can take a
  params arg without changing the dictionary shape. Keys are typed off `uk`, so a
  key present only in `en` is not reachable by type — acceptable: `en` is a strict
  fallback subset, never a superset.

### D2 — Active-location state: pure core + a thin client provider (the shared mechanism)

This is THE location mechanism city-search/map/forecast/animated-bg/weekend-compare
consume; the shell owns decoding/validating the untrusted URL, downstream consumes
the validated in-memory state and does **not** re-parse the raw URL.

- **`lib/location/types.ts`** — `Location = { lat: number; lon: number; name: string }`.
- **`lib/location/url.ts`** — pure, framework-free `parse(params)` /
  `serialize(location)` for `?lat=&lon=&name=`. `parse` takes a plain key→string
  map (e.g. from `URLSearchParams`) so it stays DOM-free; returns
  `Location | null`. `serialize` returns a query string / param map.
- **`lib/location/validation.ts`** — zod schema: `lat ∈ [-90, 90]`,
  `lon ∈ [-180, 180]` (finite), `name` non-empty and `≤ 120` chars. Coordinates
  are parsed from strings with a **dot decimal only** — a comma-decimal value
  (e.g. `50,45`) is **rejected**, not silently coerced (spec: malformed/out-of-range
  degrades to the empty state). Validation is total: it never throws to the UI; it
  returns a typed success/failure that `parse` maps to `Location | null`.
- **`components/providers/LocationProvider.tsx`** (`"use client"`) — reads the URL
  via `next/navigation` (`useSearchParams`), runs the pure `parse`+validate to seed
  in-memory state, and exposes **`useLocation()` → `{ location, setLocation }`**.
  `setLocation` updates state and syncs the URL via `useRouter().replace(...)` with
  the pure `serialize` output (replace, not push, so reloads/back behave; no full
  navigation, FR-SHELL-01). A malformed/partial/out-of-range URL seeds `null`
  (empty state) with **no crash, no NaN, no console noise** (NFR-OBS-01).
- **Trade-off / ADR-worthy:** keeping parse/serialize/validation pure in `lib/`
  while the provider is the only `next/navigation` touch-point keeps URL-as-state
  100% unit-testable and honors TC-PURE-01; the small cost is the provider must
  marshal `URLSearchParams` into a plain map for `parse`. We choose **URL replace
  over push** so the active location is shareable/reloadable but does not spam
  history. The `Location` shape is intentionally minimal (no timezone/elevation);
  forecast/map derive those from Open-Meteo at fetch time. This state shape is the
  cross-cutting contract called out as ADR-worthy in plan §4.1.

### D3 — Theme: client provider, light/dark + system, `data-theme` (FR-SHELL-01)

- **`components/providers/ThemeProvider.tsx`** (`"use client"`) — resolves
  light/dark, **respecting the system preference** (`prefers-color-scheme`) as the
  default, and sets a `data-theme` attribute (and/or `dark` class) on the document
  element that the CSS variables key off. Exposes the current theme + a toggle.
- A **header theme indicator/toggle** in `<AppHeader/>` shows and switches the
  active theme, with an **accessible name describing the current theme** (spec:
  "Theme indicator reflects the active theme"; NFR-A11Y-01).
- **No application cookie / no server persistence** (BC-PRIVACY-03): preference is
  in-memory for the session, seeded from the system preference. **Trade-off:** the
  choice does not survive a reload (no cookie/localStorage by constraint); the calm
  default is to follow the OS, which is the least surprising behavior and keeps us
  cookie-free. To avoid a first-paint flash we keep the default = system so the SSR
  markup matches the OS without a stored override.

### D4 — Shared error/empty pattern: `components/ui/Notice.tsx` (NFR-OBS-01)

- **`components/ui/Notice.tsx`** — one calm inline component with variants
  `error | empty | info`, an icon + a message, that **every** capability renders
  into instead of a generic 500 or a silent blank. It renders **inline within the
  affected region**, exposes an **accessible name** for assistive tech (e.g.
  `role="status"`/`role="alert"` by variant), and draws copy from `lib/i18n`
  (calm, no `!`). This is the error-surface primitive the whole app reuses; the
  spec's "shared inline error and empty-state pattern" requirement is satisfied here.
- **Trade-off:** one component with variants (vs separate Error/Empty components)
  keeps the surface consistent and the import path stable for every later slice; the
  cost is a slightly wider prop API, which we keep small (`variant`, `title`,
  `description`, optional `action`).

### D5 — Design system: `cn()` + cva primitives + Tailwind 4 tokens (TC-STACK-02)

- **`lib/utils.ts`** exports `cn(...)` = `twMerge(clsx(...))` (clsx + tailwind-merge).
  This is the only `lib/` file that is design-system glue; it stays framework-free
  (no `react`).
- **cva primitives** under `components/ui/`: `Button`, `Card`, `Badge`, `Input`,
  built with `class-variance-authority` following **shadcn/ui conventions**.
  TC-STACK-02 names **base-nova** as the intended base style; we set up the
  primitives in shadcn conventions with a calm AA-contrast palette and do **not**
  invent specific base-nova internals we are unsure of.
- **Palette** lives in `app/globals.css` as Tailwind 4 `@theme` tokens plus
  light/dark **CSS variables** (`:root` and `[data-theme="dark"]`). The palette is
  calm (muted, low-chroma) and every foreground/background **token pair** is chosen
  to clear AA contrast (see D6).
- **Trade-off:** cva + tokens (vs ad-hoc Tailwind classes) front-loads a little
  setup but gives every later slice consistent, themeable, AA-safe primitives and
  one `cn()` merge strategy, avoiding class-conflict bugs.

### D6 — Contrast: pure `lib/a11y/contrast.ts`, computational AA check (NFR-A11Y-02, ADR-0004)

- **`lib/a11y/contrast.ts`** — a pure WCAG **contrast-ratio** function
  (relative-luminance formula) plus a **checker over the palette token pairs** that
  asserts **≥ 4.5:1 for normal text and ≥ 3:1 for large text/UI**, in **both** light
  and dark. The palette token values are mirrored as plain data in `lib/` so the
  checker needs no DOM. This is how we verify NFR-A11Y-02 **without a browser**
  (ADR-0004); it is unit-tested and eval-adjacent.
- **Trade-off:** mirroring the CSS token values into `lib/` data risks drift from
  `globals.css`; we mitigate with a single source-of-truth token list the test reads
  and a task to keep them in lockstep. The alternative (parsing CSS at test time)
  adds DOM/CSS-parser coupling that breaks TC-PURE-01.

### D7 — Layout + named slot composition (§3a, FR-SHELL-01/03)

- **`app/layout.tsx`** — **server component**: `<html lang="uk">`, metadata (calm
  title/description from copy, no `!`), `<body>` wraps `{children}` with
  `ThemeProvider` then `LocationProvider` (providers wrap children, not the whole
  document, per the Next.js guide). A `Suspense` boundary wraps the part that reads
  `useSearchParams` as required by Next 16.
- **`app/page.tsx`** — **server component** composing **named slot components**:
  `<AppHeader/>` (logo + theme indicator + a **clock slot** stub),
  `<SearchHero/>` (first-load hero + **centered search slot** stub, FR-SHELL-03),
  a **main content region** (where forecast/map/compare slots will live), and
  `<AppFooter/>` (**credits Open-Meteo + OpenStreetMap** with hyperlinks per
  BC-BRAND-02 + a **jokes slot** stub), plus a `<WeatherBackground/>` slot stub.
- **For this slice only**, the clock/search/forecast/map/compare/jokes/background
  are **inert stubs** (a labeled placeholder or empty region). The slot **files +
  composition exist now** so later slices edit `components/shell/<Slot>.tsx` or
  their own module — **never `app/page.tsx`** (§3a serialize point).
- **Trade-off:** stubbing slots adds files up front but is the whole point of the
  serialize-point strategy: it removes merge contention on the shared page so
  Wave 1+ slices are isolated.

### D8 — Responsive grid (FR-SHELL-02)

- Tailwind breakpoints: **mobile single column** (base), **two columns at `md`**
  (768 px), **three columns at `xl`** (1280 px). Concretely the main content region
  uses a CSS grid utility chain — `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
  with a consistent `gap` — so column count changes exactly at 768/1280 and reading
  order is preserved on reflow. Long chrome/hero text and an edge-length restored
  `name` **wrap** (no clip/overflow) at the narrowest width (spec scenario).
- **Trade-off:** a pure grid-cols chain (vs bespoke fl:/container queries) maps
  one-to-one to the FR-SHELL-02 breakpoints, is trivially assertable in jsdom via
  the className, and keeps the markup framework-idiomatic.

## Risks / Trade-offs

- **Convention lock-in (highest):** these shapes are reused by 8 later slices.
  Mitigation — pin `Location`, the i18n namespace convention, `useLocation()`, and
  `Notice`'s API here and treat the location-state shape as the ADR-worthy decision
  (plan §4.1); document them in this design so reviewers can object before Wave 1.
- **Token drift (D6):** `lib/a11y` palette data can diverge from `globals.css`.
  Mitigation — single token list + a test + an explicit "keep in lockstep" task.
- **`useSearchParams` + SSR (Next 16):** reading search params client-side requires
  a `Suspense` boundary or it can deopt to client rendering / warn. Mitigation —
  wrap the location-consuming subtree in `Suspense`; keep the provider shallow.
- **Theme flash / no persistence:** default = system avoids a stored-override flash;
  the trade-off (no reload persistence) is accepted under BC-PRIVACY-03.
- **Comma-decimal coordinates:** rejecting `50,45` (vs coercing) is deliberate — a
  locale-formatted number is treated as malformed and degrades to the empty state
  (NFR-OBS-01), never a NaN map center.
- **Scope creep into slots:** the temptation to "just add the real search" here is
  resisted — slots stay inert so each FR is owned by exactly one slice (plan §5).
