## 1. Setup and design tokens

> No database schema, no migrations, no auth, no email (ADR-0003). No new deps —
> clsx, tailwind-merge, cva, zod, lucide-react, tailwindcss 4 are installed.

- [x] 1.1 Define the calm light/dark palette in `app/globals.css`: a low-chroma,
  Ukrainian-first-friendly set of foreground/background/surface/border/primary/
  muted/accent tokens as Tailwind 4 `@theme` tokens plus CSS variables for
  `:root` (light) and `[data-theme="dark"]` (dark); every fg/bg pair chosen to
  clear WCAG AA (verified computationally in 2.4). Add visible `:focus-visible`
  ring tokens (NFR-A11Y-01).
- [x] 1.2 Add `lib/utils.ts` exporting `cn(...inputs)` = `twMerge(clsx(inputs))`
  (framework-free; no `react`). Colocate `lib/utils.test.ts`.
- [x] 1.3 Scaffold the i18n module shape: `lib/i18n/uk.ts` (default, Ukrainian) and
  `lib/i18n/en.ts` (fallback) with a `shell` namespace (`uk.shell.*`) for hero,
  top-bar, footer credits, and Notice copy; `lib/i18n/index.ts` exporting the
  typed `Dictionary` (derived from `uk`) and `t(key)`. Reserve the namespacing
  convention (`uk.search.*`, `uk.forecast.*`, …) in a comment so later slices
  extend without collision (§3a). Calm tone, no exclamation marks (BC-BRAND-01).
- [x] 1.4 Export a single source-of-truth palette-token list as plain data in
  `lib/a11y/palette.ts` (light + dark token pairs) so the contrast checker
  (2.4) needs no DOM; add a code comment binding it to keep lockstep with
  `app/globals.css` (mitigates D6 drift). Framework-free.

## 2. Pure domain logic (framework-free, TC-PURE-01)

> Every file here imports no `next/*`, no `react`, no DOM globals. Each has a
> colocated `*.test.ts` carrying `@trace` ids.

- [x] 2.1 `lib/location/types.ts`: `export type Location = { lat: number; lon:
  number; name: string }`.
- [x] 2.2 `lib/location/validation.ts`: zod schema — `lat ∈ [-90, 90]`,
  `lon ∈ [-180, 180]` (finite), `name` non-empty `≤ 120` chars. Parse coordinates
  from strings with a **dot decimal only**; reject comma-decimals (e.g. `50,45`).
  Total: returns a typed success/failure, never throws to the UI.
- [x] 2.3 `lib/location/url.ts`: pure `parse(params: Record<string,string>):
  Location | null` and `serialize(location: Location): Record<string,string>` (or
  query string) for `?lat=&lon=&name=`. `parse` runs validation (2.2); malformed/
  out-of-range/partial → `null` (degrades to empty state, no NaN, no throw).
- [x] 2.4 `lib/i18n/index.ts` `t()` semantics: return the UK value; fall back to the
  EN value when a key is absent from UK; never emit a missing-key placeholder or
  console error. Type keys off `uk`.
- [x] 2.5 `lib/a11y/contrast.ts`: pure WCAG relative-luminance + `contrastRatio(fg,
  bg)`; a `checkPalette()` that asserts ≥ 4.5:1 (normal) and ≥ 3:1 (large/UI) over
  every pair in `lib/a11y/palette.ts` for **both** light and dark (NFR-A11Y-02,
  ADR-0004). No DOM.

## 3. Providers and shared UI

- [x] 3.1 `components/providers/LocationProvider.tsx` (`"use client"`): read the URL
  via `next/navigation` `useSearchParams`, seed in-memory state through the pure
  `parse`+validate (marshal `URLSearchParams` to a plain map), expose
  `useLocation()` → `{ location, setLocation }`. `setLocation` syncs the URL via
  `useRouter().replace(serialize(...))` (replace, not push; no full navigation,
  FR-SHELL-01). Malformed/partial URL → `location: null` with no crash/NaN/console
  noise (NFR-OBS-01).
- [x] 3.2 `components/providers/ThemeProvider.tsx` (`"use client"`): resolve
  light/dark defaulting to the system `prefers-color-scheme`; set `data-theme` (and
  `dark` class) on the document element; expose current theme + a toggle. No cookie,
  no server persistence (BC-PRIVACY-03).
- [x] 3.3 `components/ui/Notice.tsx`: the one calm inline error/empty/info primitive
  reused everywhere — `variant: 'error' | 'empty' | 'info'`, icon + message, copy
  from `lib/i18n`, inline within its region (never a 500, never a silent blank),
  accessible name via `role` per variant (`status`/`alert`) (NFR-OBS-01,
  NFR-A11Y-01, BC-BRAND-01).
- [x] 3.4 Base cva primitives under `components/ui/` in shadcn conventions:
  `Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx` — built with
  class-variance-authority + `cn()`, keyed off the palette tokens, AA-contrast,
  visible focus (TC-STACK-02, NFR-A11Y-01/02). Do not invent base-nova internals;
  follow shadcn cva primitive conventions.

## 4. Layout, page composition and slot stubs

- [x] 4.1 Rewrite `app/layout.tsx` (server component): `<html lang="uk">`, calm
  metadata (title/description from copy, no `!`), `<body>` wrapping `{children}`
  with `ThemeProvider` then `LocationProvider`; wrap the search-params-reading
  subtree in `Suspense` (Next 16 requirement). Providers wrap children, not the
  whole document.
- [x] 4.2 Create slot stub components under `components/shell/`: `AppHeader.tsx`
  (logo + theme indicator/toggle with an accessible current-theme name + an inert
  **clock slot** placeholder), `SearchHero.tsx` (first-load hero copy + a centered
  inert **search slot** placeholder, FR-SHELL-03), `AppFooter.tsx` (**Open-Meteo +
  OpenStreetMap** credits with hyperlinks per BC-BRAND-02 + an inert **jokes slot**
  placeholder), `WeatherBackground.tsx` (inert background slot; later honors
  pointer-events/reduced-motion). All copy from `lib/i18n`, no `!`.
- [x] 4.3 Rewrite `app/page.tsx` (server component) composing the named slots:
  `<AppHeader/>`, `<SearchHero/>` shown as the first-load empty state when there is
  no active location, a main content region (placeholder for forecast/map/compare
  slots), `<AppFooter/>`, and `<WeatherBackground/>`. Later slices fill their own
  slot file — never `app/page.tsx` (§3a serialize point).
- [x] 4.4 Responsive grid (FR-SHELL-02): main content region uses
  `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3` with a consistent gap — single
  column on mobile, two columns at `md` (768 px), three columns at `xl` (1280 px).
  Long hero/chrome text and an edge-length `name` wrap (no clip/overflow) at the
  narrowest width.

## 5. Tests (Vitest only — unit + jsdom component + an eval; NO Playwright)

- [x] 5.1 Unit `lib/location`: `url.test.ts` + `validation.test.ts` — valid round
  trip; reject non-numeric, out-of-range `[-90,90]`/`[-180,180]`, partial (missing
  `lon`/`name`), over-length `name` (>120), and **comma-decimal** coordinates → all
  degrade to `null` without throwing. `@trace FR-SHELL-01`.
- [x] 5.2 Unit `lib/i18n`: default returns UK values; missing-UK-key falls back to
  EN with no placeholder/console error; **no value in uk or en contains `!`**.
  `@trace NFR-I18N-01, BC-BRAND-01`.
- [x] 5.3 Unit `lib/a11y/contrast.test.ts`: known-ratio assertions (black/white ≈
  21:1) + `checkPalette()` passes ≥ 4.5:1 / ≥ 3:1 for every pair in **both** light
  and dark. `@trace NFR-A11Y-02`.
- [x] 5.4 jsdom component `components/ui/Notice.test.tsx`: error/empty/info each
  render an accessible-named container, copy from `lib/i18n`, contain no `!`, and
  render inline (no thrown 500). `@trace NFR-OBS-01, NFR-A11Y-01`.
- [x] 5.5 jsdom component `AppHeader.test.tsx`: theme indicator/toggle exposes an
  accessible name describing the current theme and toggles light↔dark (asserts the
  `data-theme` flip). `@trace FR-SHELL-01, NFR-A11Y-01`.
- [x] 5.6 jsdom component empty-state render: with no active location the page/slots
  render the `SearchHero` hero + centered search slot and are **never blank**; the
  responsive container carries `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.
  `@trace FR-SHELL-02, FR-SHELL-03, NFR-OBS-01`.
- [x] 5.7 Eval case `evals/cases/shell-empty-and-error.eval.ts`: `produce()` drives
  the pure `lib/i18n` shell copy for the empty state + a `Notice` error/empty
  message; `rubric` grades Ukrainian tone, clarity, and calmness (mark gating lines
  `CRITICAL:`), `dimension` grouped, `@trace NFR-OBS-01, BC-BRAND-01`. Target every
  dimension ≥ 90.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red), then
  implement sections 1–4 to green (test-first per AGENTS.md). Never weaken a test
  to pass it.
- [x] 6.2 Run `npm run lint` — zero errors/warnings.
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green.
- [x] 6.4 Run `npm run build` — production build succeeds; console clean.
- [x] 6.5 Run `npx openspec validate add-app-shell --strict` — zero errors/warnings.
- [x] 6.6 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [x] 6.7 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-app-shell` implemented/validated, record the locked conventions (i18n
  namespaces, `Location` shape + `useLocation()`, `Notice` API, palette tokens) and
  the exact next step (Wave 1: `add-comfort-score` / `add-top-clock` /
  `add-bottom-jokes`).
- [x] 6.8 SERVICE/RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003), step by
  step: (a) render the shell empty state in jsdom (Testing Library) and assert the
  `SearchHero` hero copy + centered search slot are present and the region is not
  blank; (b) render `<Notice variant="error" />` and `<Notice variant="empty" />`
  and assert each shows an accessible-named inline message with no `!` and no thrown
  500; (c) call `lib/location` `parse` on `?lat=50.45&lon=30.52&name=Kyiv` and
  assert a valid `Location`, and on `?lat=200&lon=30` assert `null`; (d) call
  `lib/a11y` `checkPalette()` and assert it passes for light and dark. Capture the
  pass output as the smoke evidence.
- [x] 6.9 GATED on 6.8 passing: `npx openspec archive add-app-shell --yes` to fold
  the delta into `openspec/specs/app-shell/spec.md`. Do not archive before the
  smoke passes.
