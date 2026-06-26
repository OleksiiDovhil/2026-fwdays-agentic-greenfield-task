## 1. Setup (i18n + the shared `WeatherContext` provider + `ForecastSection` publishes)

> No database, no migrations, no auth, no email (ADR-0003). **No new deps** —
> gradients are CSS, particles are CSS/SVG (NFR-PERF-03, NFR-DX-01). Reuse the LOCKED
> conventions: `lib/i18n` namespaces + `t()`, `useLocation()`, the
> `lib/forecast/weather-code.ts` `describeWeather`/`WeatherCategory` contract, and the
> shell's `WeatherBackground` slot. This slice introduces **no readable data and no new
> readable color** — the decorative gradient is not AA-graded text (NFR-A11Y-02 governs
> readable text). No exclamation marks anywhere (BC-BRAND-01, NFR-I18N-01).

- [x] 1.1 i18n (D7): EITHER reuse the existing `shell.background.label` ("Тло з
  погодою" / EN "Weather backdrop") that the stub already references, OR add a small
  sibling `animatedBg.*` namespace to `lib/i18n/uk.ts` + `lib/i18n/en.ts` (sibling to
  the others — never edit `shell.*`) with a calm, **no-exclamation** label
  (`animatedBg.label`). Mirror the key in `en.ts` (strict fallback subset, identical
  shape). The existing `lib/i18n/i18n.test.ts` no-`!` sweep covers any added key
  automatically. Decide and record which option in a code comment.
  DECISION: REUSED `shell.background.label` (recorded in the i18n-DECISION comment in
  `components/shell/WeatherBackground.tsx`) — no new i18n key added.
- [x] 1.2 `components/providers/WeatherProvider.tsx` (`"use client"`, D1) — a tiny
  in-memory `WeatherContext` exposing `{ weather: WeatherSnapshot; publish: (next) =>
  void }` where `WeatherSnapshot = { todayCategory: WeatherCategory | null; sunrise:
  string | null; sunset: string | null; isLoaded: boolean }`. Import `WeatherCategory`
  from the LOCKED `lib/forecast/weather-code.ts` (do NOT redefine it). Hold the snapshot
  in React state (in-memory ONLY — no cookies / localStorage / server store, ADR-0003);
  hold NO fetch (it is a passive relay from the forecast that already fetched, TC-DATA-01,
  NFR-COST-01). Export a `useWeather()` hook returning the context value, or a safe
  **not-loaded default** (`{ todayCategory: null, sunrise: null, sunset: null, isLoaded:
  false }`) outside a provider so a stray consumer never crashes (mirroring
  `useLocation`/`useTheme`).
- [x] 1.3 Mount `<WeatherProvider>` once in `app/layout.tsx` (D1/D8) — **inside** the
  existing `<LocationProvider>`, wrapping `{children}`, so it spans BOTH the
  `<WeatherBackground/>` and the `<ShellContent/>`/`<ForecastSection/>` subtrees (which
  are SIBLINGS in `app/page.tsx` — neither is an ancestor of the other, so the provider
  must wrap both). `app/layout.tsx` is the providers' home (it already mounts
  `ThemeProvider` + `LocationProvider`); this is the analogous minimal edit. Do **NOT**
  edit `app/page.tsx` (§3a serialize point).
- [x] 1.4 `components/forecast/ForecastSection.tsx` PUBLISHES into `WeatherContext`
  (D1) — a **minimal additive** edit: add a `useEffect` (keyed on the derived snapshot)
  that calls `publish({ todayCategory: describeWeather(days[0].weatherCode).category,
  sunrise: days[0].sunrise, sunset: days[0].sunset, isLoaded: true })` when its
  validated forecast for the active location is ready, and `publish` the **not-loaded
  default** when there is no location / no forecast / a failed-or-invalid fetch. Change
  **NONE** of the forecast fetch / cache / latest-wins / render logic. ALL existing
  `ForecastSection` tests MUST stay green (a new test in §5 asserts the publish).

## 2. Pure domain logic (`lib/animated-bg` — framework-free, TC-PURE-01)

> No `next/*`, no `react`, no DOM globals — 100% unit-testable, **total** (never throws
> to the UI). Colocated `*.test.ts` with `@trace` ids. Write the §5 unit tests FIRST and
> confirm they FAIL (red) before implementing (test-first per AGENTS.md). Mirror the
> LOCKED fixed-ISO-local date parse (`lib/forecast/format.ts localWeekday`,
> `lib/scoring/comfort.ts parseLocalDate`) — never `toISOString`, never `new Date("…Z")`,
> never the viewer's clock (AGENTS.md, FR-ANIM-02).

- [x] 2.1 `lib/animated-bg/day-night.ts` (D4, FR-ANIM-02) — a pure, **total**
  `isDaytime(nowLocal: Date | number, sunrise: string | null, sunset: string | null):
  boolean` deciding day vs night **in the active location's local frame**: parse the
  ISO-local `sunrise`/`sunset` wall-clock via a FIXED parse (the locked discipline — no
  `…Z`, no `toISOString`) and compare the location-local "now" wall time against them;
  at/after sunrise and before sunset → `true` (day), otherwise → `false` (night). TOTAL
  fallback: a **null / missing / malformed** sunrise or sunset → `true` (day) — the
  deterministic fallback (FR-ANIM-02 "missing sun times fall back to the day gradient");
  no throw, no log. The visitor's own timezone/device clock is NEVER consulted (the
  helper reasons only about the location-local wall clock the component passes + the
  location-local sun strings).
- [x] 2.2 `lib/animated-bg/scene.ts` (D3, FR-ANIM-01) — a pure, **total**
  `conditionToScene(category: WeatherCategory | null | undefined): { gradient:
  GradientKind; particle: ParticleKind }` where `ParticleKind = "rain" | "snow" |
  "clouds" | "none"` and `GradientKind` names the base-gradient family. Map: `clear` →
  `none` (gradient only); `cloudy` → `clouds`; `fog` → `clouds` (over a fog gradient);
  `drizzle` → `rain`; `rain` → `rain`; `snow` → `snow`; `thunder` → `rain` (over a
  stormier gradient — NO lightning effect, per Exclusions). TOTAL: an **unknown / absent**
  (`null`/`undefined` or any future category) → the neutral default `{ gradient:
  "clear", particle: "none" }` (gradient only — FR-ANIM-01 "unknown or missing weather
  code degrades to gradient"). Import `WeatherCategory` from the LOCKED
  `lib/forecast/weather-code.ts`.

## 3. Server

> None. This slice issues **no weather request of its own** (spec "Data dependency and
> inputs", TC-DATA-01) — it is a pure consumer of the `forecast` capability's already-
> fetched, validated daily payload via the shared `WeatherContext` (§1.2/§1.4). No route
> handler, no `fetch`, no API key (NFR-COST-01). (Section intentionally empty.)

## 4. UI (`WeatherBackground` client: gradient + particle layers; fill the slot)

> `"use client"` for `WeatherBackground` — it reads `useWeather()` context state,
> `matchMedia` (reduced motion), and the location-local "now" on the client (the
> ARCHITECTURE LESSON: location/clock-dependent work is client-driven). Consume
> `useWeather()`; compute day/night via `isDaytime` and the scene via `conditionToScene`.
> Fill the slot file `components/shell/WeatherBackground.tsx`; do **NOT** edit
> `app/page.tsx` (§3a). Any label from `lib/i18n` (no `!`).

- [x] 4.1 `components/shell/WeatherBackground.tsx` (`"use client"`, D2/D8) — REPLACE the
  inert stub's body with a real **fixed, full-viewport, behind-content** layer: `fixed
  inset-0 -z-10` with **`pointer-events: none`** (FR-ANIM-04) and **`aria-hidden="true"`**
  (decorative, NFR-A11Y-01); no focusable children. Keep `data-slot="weather-background"`
  and the accessible label (`shell.background.label` or `animatedBg.label` per §1.1). Do
  NOT edit `app/page.tsx` (the stub is already mounted there; only the slot component's
  internals change).
- [x] 4.2 Consume `useWeather()` + derive the scene (D2/D3/D4): read the
  `WeatherSnapshot` from `useWeather()`. Compute `isDaytime(nowLocal, snapshot.sunrise,
  snapshot.sunset)` (the location-local "now" read on the client, guarded for SSR/jsdom —
  the `ThemeProvider` `typeof window` guard) and `conditionToScene(snapshot.todayCategory)`.
  When `snapshot.isLoaded` is `false` (no location / no forecast / failed-or-invalid
  fetch) → render the calm **neutral DAY gradient** with **no effect** (the deterministic
  fallback; `conditionToScene(null)` → `none`, `isDaytime(_, null, null)` → day),
  NFR-OBS-01.
- [x] 4.3 Gradient layer (D2/D6, FR-ANIM-01/02): render a **day OR night base gradient**
  chosen by `isDaytime(...)`, tinted by the `conditionToScene().gradient` kind. Pure CSS
  (`linear-/radial-gradient` Tailwind utilities or `app/globals.css` classes keyed off
  the theme tokens) — **no new dependency**, no per-frame JS. The gradient is the ONLY
  thing shown under reduced motion (§4.5) and the fallback (§4.2).
- [x] 4.4 Particle layer (D2/D6, FR-ANIM-01): when motion is permitted (§4.5) AND the
  scene's `particle` is not `none`, render exactly ONE effect — **rain** streaks, **snow**
  flakes, or **drifting clouds** — as a **small fixed count** of CSS/SVG-animated
  elements (`transform`/`opacity` keyframes only, GPU-friendly; the count is a constant,
  not data-driven, NFR-PERF-03). Exactly one family at a time (rain XOR snow XOR clouds),
  selected by `conditionToScene(category).particle`. A `clear`/unknown category renders
  NO particles (gradient only).
- [x] 4.5 Reduced-motion branch (D5, FR-ANIM-03): read `window.matchMedia("(prefers-
  reduced-motion: reduce)")` on the client (guarded `typeof window !== "undefined" &&
  window.matchMedia`). When it **matches**, render the **static base gradient ONLY** — NO
  particles, NO animation — while STILL applying the day-vs-night gradient selection
  (§4.3, the spec's "reduced motion still respects day vs night"). When it does NOT match
  and the category maps to an effect, the effect **renders** (required, not optional —
  the spec's "no reduced-motion preference renders the mapped effect"). Omit the particle
  NODES entirely under reduced motion (not merely pause them) so a test can assert their
  absence; a CSS `@media (prefers-reduced-motion: reduce)` rule MAY back-stop the
  animations as defence in depth.
- [x] 4.6 Reactivity (D2, FR-ANIM-01): the render is a pure function of `(snapshot,
  nowLocal, reducedMotion)`, so when the active location changes or its forecast updates
  (`ForecastSection` publishes a new snapshot, §1.4) the background re-renders with the
  new gradient + effect and NO effect from the previous location remains. Keep the console
  silent on every path (no `console.*`; guarded `window` reads).

## 5. Tests (Vitest only — unit + jsdom component; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement §§1–4 to green. Every
> test file carries `@trace` ids. Never weaken a test to pass it; if a test contradicts
> the spec, change it deliberately. `matchMedia` is mocked in `vitest.setup.ts` returning
> `matches: false` (motion permitted); override `window.matchMedia` per-case to assert
> reduced motion. Inject `nowLocal`/sun times for determinism; do NOT read the real clock.

- [x] 5.1 Unit `lib/animated-bg/day-night.test.ts` (FR-ANIM-02, D4): with INJECTED
  `nowLocal` + ISO-local sun strings, assert `isDaytime` is `true` at/after sunrise and
  before sunset, `false` before sunrise and at/after sunset (test BOTH boundaries —
  exactly at sunrise → day; exactly at sunset → night). Assert the **location-not-viewer-
  clock proof**: with sun times placing the location-local "now" in daytime, the result
  is `true` **even when the test simulates a visitor device clock at a nighttime hour**
  (the visitor's timezone/clock is never consulted). Assert the TOTAL fallback: a
  `null`/missing/malformed sunrise or sunset → `true` (day), no throw. `@trace FR-ANIM-02`.
- [x] 5.2 Unit `lib/animated-bg/scene.test.ts` (FR-ANIM-01, D3): assert
  `conditionToScene` maps each `WeatherCategory` to the expected particle family — `clear`
  → `none`, `cloudy` → `clouds`, `fog` → `clouds`, `drizzle` → `rain`, `rain` → `rain`,
  `snow` → `snow`, `thunder` → `rain` — and a defined `gradient` kind for each; assert an
  **unknown / `null` / `undefined`** category → the neutral default `{ gradient: "clear",
  particle: "none" }` (no throw, gradient only). `@trace FR-ANIM-01`.
- [x] 5.3 jsdom `components/shell/WeatherBackground.test.tsx` — gradient renders
  (FR-ANIM-01/02, D2): with `useWeather()` mocked (or `WeatherProvider` seeded) to a
  LOADED snapshot, render `<WeatherBackground/>` and assert a base gradient layer
  renders; assert it switches DAY vs NIGHT by the snapshot's sun times + an injected/
  controllable "now" (a daytime snapshot → the day gradient; a nighttime snapshot → the
  night gradient). `@trace FR-ANIM-01, FR-ANIM-02`.
- [x] 5.4 jsdom particle-by-category (FR-ANIM-01, D2/D4): with motion permitted
  (`matchMedia` default `matches: false`), assert a `rain` category renders the **rain**
  particle layer, a `snow` category the **snow** layer, a `cloudy` category the **clouds**
  layer, and a `clear`/unknown category renders **NO** particle layer (gradient only). Use
  stable hooks (e.g. `data-particle="rain|snow|clouds"` or `data-testid`) so the assertion
  is objective. `@trace FR-ANIM-01`.
- [x] 5.5 jsdom reduced-motion (FR-ANIM-03, D5): OVERRIDE `window.matchMedia` so
  `(prefers-reduced-motion: reduce)` returns `matches: true`; render with a `rain` (or
  `snow`) category and assert the layer renders the **static base gradient ONLY** — NO
  particle nodes, no animation. Assert reduced motion STILL respects day vs night (a
  nighttime snapshot under reduced motion → the static NIGHT gradient). Then with
  `matches: false` and a `snow` category, assert the snow effect IS rendered (not
  suppressed). `@trace FR-ANIM-03`.
- [x] 5.6 jsdom no-interaction + decorative (FR-ANIM-04, NFR-A11Y-01, D2): assert the
  layer has **`pointer-events: none`** (the class / computed `pointer-events`), is
  **`aria-hidden="true"`**, is positioned behind content (`-z-10`), and contains **no
  focusable elements** (no tab stops). `@trace FR-ANIM-04, NFR-A11Y-01`.
- [x] 5.7 jsdom calm default with no data + console silence (NFR-OBS-01, D2): with a
  **not-loaded** snapshot (`isLoaded: false`, `todayCategory: null`, null sun times) —
  the no-location / failed-or-invalid-fetch case — assert the layer renders the calm
  **neutral DAY gradient** with **NO effect**, surfaces no error, and the console stays
  clean (no warning/error). `@trace NFR-OBS-01, FR-ANIM-01, FR-ANIM-02`.
- [x] 5.8 jsdom `ForecastSection` publishes correctly + its existing tests pass
  (FR-ANIM-01/02, D1): with `WeatherProvider` wrapping a rendered `<ForecastSection/>`
  (mocked `fetch` + active `useLocation()`), assert that on a successful forecast load the
  context snapshot becomes `{ todayCategory: <days[0] category>, sunrise: <days[0]
  .sunrise>, sunset: <days[0].sunset>, isLoaded: true }`, and on no-location / error the
  snapshot is the not-loaded default. Confirm the **existing** `ForecastSection.test.tsx`
  suite stays green (the publish edit is additive). `@trace FR-ANIM-01, FR-ANIM-02`.
- [x] 5.9 EVAL (D7) — **LOW-VALUE for a decorative layer.** The only candidate copy is a
  non-announced accessible label. You MAY add a tiny eval grading that label's tone, OR
  **SKIP** with a documented note in `tasks.md`/the eval index (the existing
  `lib/i18n/i18n.test.ts` no-`!` sweep + the calm reused `shell.background.label` already
  cover it; there is no user-visible graded copy here). Record the decision. `@trace
  FR-ANIM-01`.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the §5 tests FIRST and confirm they FAIL (red) for the right reason
  (missing modules / unimplemented branches, not weak assertions), then implement §§1–4 to
  green (test-first per AGENTS.md). Never weaken a test to pass it; if a test contradicts
  the spec, change it deliberately, not silently.
- [x] 6.2 Run `npm run lint` — zero errors/warnings (incl. the import-boundary check:
  `lib/animated-bg` has no `next/*`/`react`/DOM imports, TC-PURE-01; no inline UI
  literals, NFR-I18N-01; no new dependency added, NFR-PERF-03/DX-01; no `fetch` /
  `api.open-meteo.com` reference in animated-bg, TC-DATA-01/NFR-COST-01).
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green, INCLUDING the
  existing `ForecastSection` suite (the publish edit kept it green) and the new
  animated-bg tests.
- [x] 6.4 Run `npm run build` — production build succeeds; console clean. Confirm
  `app/page.tsx` stays **static** (the ARCHITECTURE LESSON — `WeatherBackground` is a
  client island under the static page), the client bundle carries **no new dependency**
  and **no `api.open-meteo.com` reference / key** from animated-bg (NFR-COST-01,
  NFR-PERF-03), and no new chunk of significance is added (CSS gradients + small
  CSS/SVG particles).
- [x] 6.5 Run `node scripts/check-eval-ratchet.mjs` (the graded-quality bar) — no
  dimension regresses. Per §5.9 the EVAL is LOW-VALUE for this decorative layer; if no
  animated-bg eval was added, record SKIP-with-note (the ratchet must not drop on existing
  dimensions). (The eval-suite judge workflow, maker≠checker, grades any copy; the maker
  does not self-grade — record SKIP if `evals/results/latest.json` is absent.)
- [x] 6.6 Run `npx openspec validate add-animated-bg --strict` — zero errors/warnings
  ("Change 'add-animated-bg' is valid").
- [x] 6.7 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [x] 6.8 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-animated-bg` implemented/validated, and record the conventions for downstream
  reuse: the shared **`WeatherContext`** (`components/providers/WeatherProvider.tsx` +
  `useWeather()`) the forecast PUBLISHES into and decorative consumers CONSUME (the
  cross-slice integration — flag the ADR); `lib/animated-bg/{day-night,scene}.ts` as the
  pure layer (`isDaytime` total, location-local frame, never the viewer's clock;
  `conditionToScene` total, category → gradient + one particle family); the client
  `WeatherBackground` filling the shell bg slot (gradient + particle layers,
  reduced-motion static branch, `pointer-events: none` + `aria-hidden`, calm neutral-day
  fallback with no data); the additive `ForecastSection` publish edit; and the exact next
  step (Wave 5: `add-weekend-compare`).
- [x] 6.9 RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003; NOT a service smoke —
  there is no fetch here), step by step: (a) under jsdom, render `<WeatherBackground/>`
  with a LOADED **daytime** snapshot (a known sunrise/sunset placing "now" in day + a
  `rain` category, motion permitted) and assert the **day** gradient + the **rain**
  particle layer render; (b) render with a LOADED **nighttime** snapshot and assert the
  **night** gradient renders; (c) OVERRIDE `matchMedia` to `prefers-reduced-motion:
  reduce` → render with a `rain` category and assert the **static gradient ONLY** (no
  particle nodes); (d) assert the layer has **`pointer-events: none`** + `aria-hidden`
  (clicks pass through, decorative); (e) render with a **not-loaded** snapshot and assert
  the calm **neutral day gradient** with no effect and a clean console. Capture the pass
  output as the smoke evidence.
- [x] 6.10 GATED on 6.9 passing: `npx openspec archive add-animated-bg --yes --skip-specs`
  (the baseline `openspec/specs/animated-bg/spec.md` already holds the contract, so the
  delta is NOT re-applied via Option B). Do not archive before the render smoke passes.
