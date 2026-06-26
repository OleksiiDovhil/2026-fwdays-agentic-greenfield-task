## Context

`add-animated-bg` is the **Wave 4** slice (capability plan §4.8, §6) off the archived
`add-app-shell` foundation and the implemented-and-validated `add-forecast`. It is on
the **critical path** (`app-shell → city-search → forecast → animated-bg →
weekend-compare`). The shell shipped the slot this slice fills: `app/page.tsx` renders
an inert `<WeatherBackground/>` (`components/shell/WeatherBackground.tsx`) — a fixed,
decorative, `pointer-events: none`, `aria-hidden` stub. This slice replaces that stub
with a real condition-driven background and adds the small shared `WeatherContext` it
reads from.

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no auth,
no email; keyless; no second weather fetch.** Tests are **Vitest** only — pure unit
tests + jsdom component tests — **no Playwright** (TC-STACK-05, ADR-0004). The
per-slice "smoke" is a **render smoke** (a `WeatherBackground` render), not a DB smoke.
The pure layer (`lib/animated-bg`) is **framework-free** (TC-PURE-01): no `next/*`, no
`react`, no DOM — 100% unit-testable.

The locked conventions reused **verbatim**, not re-built:

- **The active-location state** — `components/providers/LocationProvider.tsx`, whose
  `useLocation() → {location, setLocation}` exposes the validated active location.
  Animated-bg **reads** it indirectly (through the forecast it consumes) and does not
  re-parse the URL.
- **The forecast capability** — `lib/forecast/weather-code.ts` `describeWeather(code)`
  returns a day/night-**agnostic** `category` (`clear | cloudy | fog | drizzle | rain |
  snow | thunder`); the `DailyForecast` shape carries `weatherCode`, `sunrise`, `sunset`
  for the active location's **today** (`days[0]`). `ForecastSection` already fetches and
  validates this. Animated-bg consumes today's `category` + sun times — it does **not**
  re-fetch, re-validate, or re-map (it reuses `describeWeather`).
- **The ARCHITECTURE LESSON** (current-state) — `app/page.tsx` is statically
  prerendered, so anything depending on the active location OR the visitor's clock MUST
  be **client-driven**; `WeatherBackground` is therefore `"use client"` (it reads
  `useWeather()` context state + `matchMedia` + the current instant on the client).
- **i18n** — `t("namespace.key")` (UK default → EN fallback → ""); the existing
  `shell.background.label` (or a sibling `animatedBg.*`), never reaching into `shell.*`.
  No runtime i18n library (NFR-I18N-01); no exclamation marks (BC-BRAND-01).
- **`matchMedia` mock** — `vitest.setup.ts` provides an inert `matchMedia` returning
  `matches: false`; jsdom tests override `matches: true` per-case to assert the
  reduced-motion branch (the same mechanism `prefers-color-scheme` uses in
  `ThemeProvider`).

## Goals / Non-Goals

**Goals:**

- Render a calm, full-bleed **background layer behind the app** that reflects today's
  weather and sky for the **active location**: a day-or-night base gradient plus, when
  motion is permitted, exactly one rain / snow / cloud-drift effect (FR-ANIM-01).
- Choose day vs night by the **active location's own sunrise / sunset** (FR-ANIM-02) —
  never the visitor's clock or timezone — using a pure, total helper.
- Honour **`prefers-reduced-motion: reduce`** (FR-ANIM-03): a static gradient only, no
  particles, no animation; day-vs-night selection still applies.
- **Never intercept interaction** (FR-ANIM-04): `pointer-events: none`, positioned
  behind content, no focusable elements, decorative for AT (`aria-hidden`,
  NFR-A11Y-01).
- Issue **no weather request of its own** (spec "Data dependency and inputs",
  TC-DATA-01, NFR-COST-01): consume the `forecast` capability's already-fetched,
  validated daily payload through a shared `WeatherContext` (no duplicate Open-Meteo
  fetch).
- **Degrade honestly** (NFR-OBS-01): no location / no forecast / failed-or-invalid
  fetch → a deterministic **calm neutral day gradient** with no effect; never throw,
  never log; the console stays silent on a healthy session.
- Stay **light** (NFR-PERF-03, NFR-DX-01): CSS gradients + a small number of CSS/SVG
  particles; **no canvas / WebGL / animation library; no new dependency.**
- Keep the pure layer (`lib/animated-bg`) framework-free and 100% unit-testable
  (TC-PURE-01); React / DOM / `matchMedia` concerns live only in `WeatherBackground` and
  `WeatherProvider`.

**Non-Goals (explicit Exclusions — see the spec):**

- Any **readable data** in the background (temperature / precip / wind / comfort /
  forecast detail — owned by `forecast` / `comfort-score`).
- **Locale or oversized-value handling** — the layer renders no user-facing value, so
  there is nothing to localise, truncate, or bound here (deliberate, per the spec's
  Exclusions).
- A **second weather fetch** or any `current_weather` / `is_day` / hourly-condition
  input — the background is a pure consumer of the single validated daily payload.
- **Per-frame realism**, physics, lightning, fog-density modelling, audio; **user
  controls** to toggle / theme / customise; **twilight / golden-hour / multi-stage**
  transitions (the base is a binary day-or-night choice); **marine / aviation /
  agriculture** conditions.
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom component tests; the smoke is a render smoke.

## Decisions

### D1 — Cross-slice data: a shared `WeatherContext` the forecast PUBLISHES and the background CONSUMES (ADR-WORTHY)

This is the central design decision and the one **flagged as ADR-worthy**. The
animated background needs, for the **active location**: today's weather **category**
and today's **sunrise / sunset** (FR-ANIM-01/02). The `forecast` capability already
fetches and validates exactly these (`ForecastSection` → `/api/forecast` →
`days[0].weatherCode` + `days[0].sunrise`/`days[0].sunset`), and TC-DATA-01 +
NFR-COST-01 mandate that the **only** weather fetch in the product lives in `forecast`.
So the background must obtain these values **without issuing a second fetch**.

- **Chosen approach — a small shared `WeatherContext`
  (`components/providers/WeatherProvider.tsx`, `"use client"`):**
  - It exposes the active location's today-weather summary and a setter:
    ```
    type WeatherSnapshot = {
      todayCategory: WeatherCategory | null;  // from lib/forecast/weather-code
      sunrise: string | null;                 // days[0].sunrise (location-local ISO)
      sunset: string | null;                  // days[0].sunset  (location-local ISO)
      isLoaded: boolean;                       // a validated forecast is available
    };
    type WeatherContextValue = {
      weather: WeatherSnapshot;
      publish: (next: WeatherSnapshot) => void;
    };
    ```
  - **`ForecastSection` PUBLISHES** (a minimal additive edit): when its validated
    forecast for the active location is ready it calls
    `publish({ todayCategory: describeWeather(days[0].weatherCode).category,
    sunrise: days[0].sunrise, sunset: days[0].sunset, isLoaded: true })`; on no
    location / no forecast / failed-or-invalid fetch it publishes the **not-loaded
    default** (`{ todayCategory: null, sunrise: null, sunset: null, isLoaded: false }`).
    The publish is a `useEffect` keyed on the derived snapshot so it fires only when the
    snapshot changes (no render-loop). It changes **none** of the forecast fetch / cache
    / render logic — all existing `ForecastSection` tests stay green.
  - **`WeatherBackground` CONSUMES** via `useWeather()` and renders the gradient +
    particles from the snapshot (D2). Outside a provider `useWeather()` returns the
    not-loaded default (a stray consumer never crashes — honest empty state, mirroring
    `useLocation`/`useTheme`).
  - **Mount point — `app/layout.tsx`, inside the existing `LocationProvider`.** This is
    forced by the component tree: in `app/page.tsx`, `<WeatherBackground/>` and
    `<ShellContent/>` (which renders `<ForecastSection/>`) are **siblings** — neither is
    an ancestor of the other — so a provider mounted in `ShellContent` could not reach
    `WeatherBackground`. The provider must wrap **both**, which is the `{children}`
    subtree of `app/layout.tsx`. `layout.tsx` is the **providers' home** (it already
    mounts `ThemeProvider` + `LocationProvider`); adding `WeatherProvider` there is the
    analogous, minimal edit. It is **not** the `app/page.tsx` composition serialize
    point (§3a) the task forbids editing — that file stays untouched. `WeatherProvider`
    nests **inside** `LocationProvider` (no dependency on it directly, but it logically
    belongs with the location-derived state and keeps the static server content above it
    static).
  - **In-memory only (ADR-0003):** the snapshot lives in React state; no cookies, no
    localStorage, no server store. It holds **no fetch** — it is a passive relay from
    the forecast that already fetched.
- **Why this over the alternative (the documented duplicate):** the alternative is
  **`WeatherBackground` fetching `/api/forecast` itself** off `useLocation()` (the same
  route the forecast uses). That keeps animated-bg self-contained and avoids touching
  `ForecastSection`, BUT it issues a **second, duplicate request** for data the page
  already has — wasteful, a second loading race to manage, two caches to keep
  consistent, and (mildly) at odds with "the only weather fetch lives in `forecast`"
  (TC-DATA-01). The shared-context approach reuses the **single** validated payload, is
  cheaper (zero extra network), keeps the day/night + category in lockstep with the
  forecast the user sees, and the only cost is a **deliberate additive coupling**:
  animated-bg edits `ForecastSection` to publish, and a shared provider is mounted in
  the layout. We accept that coupling and **recommend the shared-context approach**.
- **Why ADR-worthy:** it is a deliberate **cross-slice integration** — a Wave-4 slice
  additively reaches into the Wave-3 forecast component and introduces a new shared
  provider in the root layout, establishing a small "publish-derived-weather-to-a-shared-
  context" pattern that `add-weekend-compare` could also touch. That is a standing
  architectural choice (which slice owns the fetch; how decorative consumers read it)
  worth recording, alongside the documented alternative and this recommendation.
- **Trade-off (summary):** shared context = zero duplicate fetch + one snapshot of truth
  + an additive cross-slice edit (the cost); duplicate fetch = self-contained
  animated-bg + a wasted request + two races/caches + a TC-DATA-01 smell. Chosen: shared
  context.

### D2 — `WeatherBackground` (`"use client"`): a fixed, behind-content, pointer-events-none layer (FR-ANIM-01/04)

- **`components/shell/WeatherBackground.tsx`** is marked **`"use client"`**: it reads
  `useWeather()` context state, `matchMedia` (reduced motion, D5), and the **current
  instant** (to place "now" against the location's sun times, D4) — all client-only per
  the ARCHITECTURE LESSON.
- It renders a **fixed, full-viewport layer BEHIND content**: `fixed inset-0 -z-10`
  (the existing stub's positioning) with **`pointer-events: none`** so clicks, taps,
  hovers, scrolls, and focus all pass through to the UI above it (FR-ANIM-04 — a jsdom
  test asserts the class / computed `pointer-events`). It contains **no focusable
  elements** and is exposed as **decorative** (`aria-hidden="true"`, NFR-A11Y-01), so it
  never receives focus and adds no AT noise.
- **Composition (FR-ANIM-01):**
  1. A **base gradient** layer — a `day` OR `night` gradient chosen by `isDaytime(...)`
     against the active location's sunrise/sunset (D4). The two gradient palettes are
     defined as CSS (Tailwind classes or `app/globals.css` utilities keyed off the
     theme tokens; no new color that needs an AA check, since the layer is decorative —
     NFR-A11Y-02 governs readable text, not the ambient backdrop). `conditionToScene`
     (D3) maps the category to a gradient KIND (e.g. clear vs overcast tint) layered on
     top of / blended with the day/night base.
  2. When **motion is permitted** (not reduced) and today's category maps to an effect,
     exactly **one particle layer** — **rain**, **snow**, or **drifting clouds** —
     selected by `conditionToScene(category).particle` (D3). The particle layer is a
     small set of CSS/SVG-animated elements (D6).
- **Snapshot-driven, reactive:** when the active location changes or its forecast
  updates, `ForecastSection` publishes a new snapshot (D1) and the background re-renders
  with the new gradient + effect; no effect from the previous location remains (the
  render is a pure function of the current snapshot + day/night + reduced-motion).
- **The fallback (NFR-OBS-01):** when `isLoaded` is `false` (no location, no forecast,
  or a failed/invalid fetch — the forecast published the not-loaded default), the
  background renders the **calm neutral day gradient** with **no effect**; it never
  throws and never logs. `conditionToScene(null)` → `none`, and `isDaytime` with null
  sun times → `true` (day), so a `null` snapshot deterministically yields the neutral
  day gradient.
- **Trade-off:** rendering as a pure function of `(snapshot, nowLocal, reducedMotion)`
  (vs imperative DOM/animation control) keeps it declarative, SSR-safe (the server can
  render the neutral default; the client refines after mount), and jsdom-testable; the
  cost is that "now" is read on the client (a `useState`/`useEffect` mount read), which
  the ARCHITECTURE LESSON already requires.

### D3 — Pure `conditionToScene(category)`: category → { gradient, particle }, total (TC-PURE-01, FR-ANIM-01)

- **`lib/animated-bg/scene.ts`** — a pure, framework-free
  `conditionToScene(category: WeatherCategory | null | undefined):
  { gradient: GradientKind; particle: ParticleKind }` where
  `ParticleKind = "rain" | "snow" | "clouds" | "none"` and `GradientKind` names the
  base-gradient family (e.g. `"clear" | "cloudy" | "fog" | "storm"`). The mapping:
  - `rain` → `{ particle: "rain" }`; the spec's rain family also covers `drizzle` and
    `thunder` (thunder has no separate effect — no lightning, per Exclusions — so it
    maps to **rain** particles over a stormier gradient tint). `drizzle` → `rain`
    particles (a light rain), or `none` over a cloudy gradient — **decision: `drizzle`
    and `thunder` map to `rain` particles**, so the three spec effect families (rain /
    snow / clouds) cover the precipitation categories; a `storm`/`overcast` gradient
    tint conveys the difference without a fourth effect.
  - `snow` → `{ particle: "snow" }`.
  - `cloudy` → `{ particle: "clouds" }` (drifting clouds).
  - `fog` → `{ particle: "clouds" }` over a `fog` gradient (a soft drift; no separate
    fog-density effect, per Exclusions) — **or** `none`; **decision: `fog` → `clouds`**
    (a calm drift reads better than a static gradient and stays within the three
    families).
  - `clear` → `{ particle: "none" }` (gradient only, the spec's clear scenario).
  - **unknown / absent** (`null`/`undefined` or any future category) → the neutral
    default `{ gradient: "clear", particle: "none" }` (gradient only — the spec's
    "unknown or missing weather code degrades to gradient" scenario). **Total:** every
    input yields a defined scene; no throw, no blank.
- The exact category→family table is pinned in code + the unit test (representative:
  `clear`→none, `cloudy`→clouds, `fog`→clouds, `drizzle`→rain, `rain`→rain, `snow`→snow,
  `thunder`→rain, unknown→none).
- **Trade-off:** collapsing the seven `WeatherCategory` values onto **three** effect
  families (+ none) keeps the layer calm and light (the spec mandates exactly rain /
  snow / clouds) and avoids a per-code effect zoo; the gradient KIND carries the finer
  distinction (clear vs cloudy vs fog vs storm) without animation. Keeping the mapping
  pure (not inline in the component) makes it unit-tested deterministically across every
  category incl. unknown (TC-PURE-01).

### D4 — Day/night from the active location's sun times: `isDaytime(nowLocal, sunrise, sunset)`, total (FR-ANIM-02)

- **`lib/animated-bg/day-night.ts`** — a pure, framework-free, **total**
  `isDaytime(nowLocal: Date | number, sunrise: string | null, sunset: string | null):
  boolean` that decides day vs night **in the active location's local frame**, never
  the visitor's clock or timezone.
- **The local-frame decision (the spec's day/night requirement):** Open-Meteo returns
  today's `sunrise`/`sunset` already expressed in the active location's **own** time
  zone (`timezone=auto`), as ISO-local strings WITHOUT a zone suffix (e.g.
  `"2026-06-26T04:51"`). The current instant is converted to that same local frame using
  the offset those timestamps carry — concretely, the helper compares **wall-clock
  components**: it derives the location-local "now" wall time (the component renders
  `nowLocal` as the value to compare; the pure helper parses the sunrise/sunset
  wall-clock via a **fixed parse** of the ISO-local string, the SAME `Date.UTC`/
  `Date.parse`-of-local discipline `lib/forecast/format.ts localWeekday` and
  `lib/scoring/comfort.ts parseLocalDate` use — never `new Date("…Z")`, never
  `toISOString`). **When the location-local time is at/after sunrise and before sunset
  → `true` (day); otherwise → `false` (night).**
  - The component passes the location-local "now" so the comparison is in the location's
    frame. Because both the sun times and the compared "now" are expressed as the
    location's local wall clock (the sun strings carry the location's offset; the
    component derives the location-local now from those same offset-bearing strings), the
    **visitor's own timezone and device clock are never consulted** (the spec's
    "visitor's local clock does not override" scenario). The unit test proves this: with
    sun times placing "now" in daytime at the location, the result is `true` **even when
    the test sets a visitor clock at a nighttime hour**.
- **Total fallback (NFR-OBS-01):** a **null / missing / malformed** sunrise or sunset
  (e.g. polar day/night where Open-Meteo returns `null`, an absent field, or no
  validated forecast at all → `isLoaded: false`) → the helper returns **`true` (day)**
  as the deterministic fallback (the spec's "missing sun times fall back to the day
  gradient"). No throw, no log.
- **Trade-off:** comparing local wall-clock components (vs constructing absolute
  instants with an explicit numeric offset) avoids any dependency on the host's timezone
  database and stays framework-free + deterministic in unit tests, matching the locked
  date discipline; the cost is that the helper reasons about wall-clock strings, which a
  focused unit test pins across the sunrise boundary, the sunset boundary, and the
  visitor-clock-does-not-win case.

### D5 — Reduced motion: a static gradient only under `prefers-reduced-motion: reduce` (FR-ANIM-03)

- `WeatherBackground` reads **`window.matchMedia("(prefers-reduced-motion: reduce)")`**
  on the client (guarded for SSR/jsdom: `typeof window !== "undefined" &&
  window.matchMedia`, the same guard `ThemeProvider.systemTheme()` uses). When it
  matches, the layer renders the **static base gradient only** — **no particles, no
  animation** (FR-ANIM-03). The **day-vs-night gradient selection still applies** (D4):
  reduced motion suppresses motion, not the day/night choice (the spec's "reduced motion
  still respects day vs night" scenario).
- When reduced motion is **not** requested and today's category maps to an effect, that
  effect **renders** over the gradient — animation is **required** in that case, not
  optional (the spec's "no reduced-motion preference renders the mapped effect"
  scenario): the component does not gate the effect on anything but reduced-motion +
  the category mapping.
- **Testability:** `vitest.setup.ts` mocks `matchMedia` returning `matches: false`
  (motion permitted) by default; a jsdom test **overrides** `window.matchMedia` to
  return `matches: true` for the reduced-motion query and asserts the static branch (no
  particle nodes), and the default (`matches: false`) case asserts the particle layer
  renders for a rain/snow/cloud category.
- **Trade-off:** reading `matchMedia` at render (mount-read into state) vs a CSS-only
  `@media (prefers-reduced-motion)` guard: a CSS-only guard would still SHIP the particle
  DOM (just not animate it), whereas reading the preference lets the component **omit the
  particle nodes entirely** under reduced motion (lighter, and the test can assert their
  absence). We read the preference; a CSS `@media` guard MAY additionally back-stop the
  animations as defence in depth (belt-and-braces), but the authoritative branch is the
  JS read so the test is deterministic.

### D6 — Performance: CSS gradients + a few CSS/SVG particles; no new dep (NFR-PERF-03)

- The background is **CSS gradients** (the day/night/condition base) plus a **small,
  bounded number** of **CSS/SVG-animated** particles for rain / snow / clouds — **no
  canvas, no WebGL, no animation library, no new dependency** (NFR-PERF-03, NFR-DX-01,
  NFR-COST-01). Concretely the budget:
  - Gradients: pure CSS `linear-gradient`/`radial-gradient` utilities — zero JS cost,
    zero added bytes beyond a few class names.
  - Particles: a **fixed small count** (e.g. ≈ 12–24 rain streaks / snowflakes, or
    2–3 drifting cloud shapes) rendered as positioned `div`/SVG elements animated with
    CSS keyframes (`transform`/`opacity` only — GPU-friendly, no layout thrash). The
    count is a constant, not data-driven, so it never scales with payload size.
  - No per-frame JS, no `requestAnimationFrame` loop, no timers driving the animation
    (CSS keyframes run on the compositor). The only JS is the render decision (gradient
    kind, particle kind, reduced-motion) computed once per snapshot change.
- Because the layer adds **no dependency** and ships a handful of class names + a small
  particle markup, it does not move the initial-JS budget (NFR-PERF-03 ≤ 200 KB gz) and
  has no SSR/CLS hazard (it is `fixed inset-0` behind content — it occupies no flow).
- **Trade-off:** CSS/SVG particles are less photorealistic than a canvas/WebGL
  simulation, but the spec mandates **calm, ambient** effects (no per-frame realism,
  Exclusions) and the project bars cost/weight (no new dep, NFR-PERF-03). The CSS
  approach is the right calm-and-light trade; the cost is hand-authored keyframes, which
  are small and live with the component.

### D7 — i18n + a11y: decorative, an optional reused label, no exclamation marks

- The layer renders **no readable data** (spec Exclusions), so it carries **no
  user-facing strings** beyond an optional accessible label. Because it is decorative
  (`aria-hidden="true"`), the label is **not announced**; it exists only as a
  non-essential descriptor on the container.
- **Decision:** reuse the existing **`shell.background.label`** ("Тло з погодою" / EN
  "Weather backdrop") that the stub already references, OR add a sibling
  **`animatedBg.label`** to `lib/i18n/{uk,en}.ts` (never reaching into `shell.*`) if a
  distinct descriptor reads better. Either way the copy is calm and carries **no
  exclamation marks** (BC-BRAND-01, enforced across both locales by the existing
  `lib/i18n/i18n.test.ts` sweep — any added key is covered automatically). No runtime
  i18n library (NFR-I18N-01).
- An EVAL is **LOW-VALUE** here (a decorative layer with no graded copy): the only
  candidate string is a non-announced label. The slice **MAY** add a tiny eval for that
  label's tone or **SKIP** with a documented note (the i18n no-`!` test + the existing
  copy already cover it). The plan records SKIP-with-note as acceptable.

### D8 — Fill the shell's `WeatherBackground` slot; do NOT edit `app/page.tsx` (§3a)

- This slice fills the **`components/shell/WeatherBackground.tsx`** slot file (§3a) — it
  replaces the inert stub's body with the real layer. It does **not** edit the shared
  `app/page.tsx` composition serialize point (the stub is already mounted there; this
  slice only changes the slot component's internals).
- The one **shared-file** edit is mounting `<WeatherProvider>` in `app/layout.tsx`
  (D1) — the providers' home, inside `LocationProvider`, wrapping `{children}` so it
  spans both the background and the shell (forced by the sibling tree). This is the
  analogous edit to how `ThemeProvider`/`LocationProvider` are mounted and is **not** the
  `app/page.tsx` edit the task forbids.
- The additive **publish** edit to `components/forecast/ForecastSection.tsx` (D1) is the
  forecast component's own file, touched additively (a publish side-effect) with all its
  tests kept green.

## Data model

No persistent data, no DB, no schema (ADR-0003). State is ephemeral and in-memory: the
active location lives in the **URL** (owned by the locked LocationProvider); the
forecast's validated payload lives **in the forecast component** (owned by
`add-forecast`); animated-bg adds **one in-memory snapshot** in `WeatherContext` (D1) —
a passive relay, no fetch, no persistence. The shapes:

- **`WeatherSnapshot`** (`components/providers/WeatherProvider.tsx`) — `{ todayCategory:
  WeatherCategory | null; sunrise: string | null; sunset: string | null; isLoaded:
  boolean }`. `WeatherCategory` is **imported** from the locked
  `lib/forecast/weather-code.ts` (the cross-capability contract); animated-bg does NOT
  redefine it.
- **`GradientKind`** / **`ParticleKind`** (`lib/animated-bg/scene.ts`) — the pure
  mapping's output: `ParticleKind = "rain" | "snow" | "clouds" | "none"`; `GradientKind`
  names the base-gradient family. Internal to the slice.
- **In-component (`WeatherBackground`):** the location-local "now" (a mount-read into
  state, refreshed as needed) and the `matchMedia` reduced-motion boolean (a mount-read
  into state) — both client-only, both in-memory.

The pure surface (`lib/animated-bg`): `isDaytime(nowLocal, sunrise, sunset): boolean`
(total) and `conditionToScene(category): { gradient, particle }` (total). Both
framework-free, both deterministic in unit tests.

## Error handling strategy

- **Honest degradation everywhere (NFR-OBS-01).** The background has **no error path of
  its own** (it issues no fetch); every "absence" reduces to the **calm neutral day
  gradient with no effect**:
  - No location selected → the forecast publishes the not-loaded default → `isLoaded:
    false` → neutral day gradient, no effect.
  - Forecast fetch failed / payload failed validation → the forecast publishes the
    not-loaded default (it already shows its own calm error Notice) → neutral day
    gradient, no effect (the spec's "failed or invalid upstream forecast still renders a
    gradient" scenario).
  - Today's weather code unknown / absent → `conditionToScene(null)` → `none` → gradient
    only (the spec's "unknown or missing weather code degrades to gradient").
  - Sunrise / sunset null / missing → `isDaytime(..., null, null)` → `true` (day) →
    neutral **day** gradient (the spec's "missing sun times fall back to the day
    gradient").
- **Pure helpers are total:** `isDaytime` and `conditionToScene` are defined for every
  input (null / malformed included) and **never throw** to the UI (TC-PURE-01).
- **Console silence (NFR-OBS-01):** no `console.*` on any path; no warning on a healthy
  session. The reduced-motion `matchMedia` read and the "now" read are guarded for
  SSR/jsdom (no "window is not defined", no unhandled access). A test asserts the console
  stays clean across the fallback and the happy paths.
- **No interaction interception (FR-ANIM-04) is a correctness property, not an error
  path:** `pointer-events: none` + `aria-hidden` + behind-content z-index are asserted
  by a jsdom test (the class / computed style), so a regression that made the layer
  capture clicks is caught.

## Risks / Trade-offs

- **Cross-slice coupling to `ForecastSection` (the central risk, D1):** adding a publish
  side-effect to the forecast component could regress its fetch / cache / render or break
  its tests. Mitigation — the edit is **additive only** (a `useEffect` publishing a
  derived snapshot; no change to the fetch / cache / latest-wins logic), **all existing
  `ForecastSection` tests are kept green**, and a **new** test asserts the publish fires
  correctly (loaded snapshot on success; not-loaded default on no-location / error). The
  coupling is documented + flagged ADR-worthy with the alternative.
- **A duplicate Open-Meteo fetch (TC-DATA-01, NFR-COST-01):** the rejected alternative
  (background fetches `/api/forecast` itself) would issue a second request for data the
  page already has. Mitigation — the **shared `WeatherContext`** (D1) reuses the single
  validated payload; **zero** new network, **zero** new keys; a review/grep confirms
  animated-bg adds no `fetch`/`api.open-meteo.com` reference.
- **Day/night computed from the visitor's clock instead of the location (FR-ANIM-02, the
  highest correctness risk):** using `new Date()` against UTC-parsed sun times, or
  `new Date("…Z")`, would show the visitor's day/night, not the location's. Mitigation —
  `isDaytime` reasons in the **location's local wall-clock frame** via the **fixed
  ISO-local parse** the locked `localWeekday`/`parseLocalDate` use (no `toISOString`, no
  `…Z`); a unit test **proves** a daytime location reads as day **even when the visitor's
  clock is set to night**.
- **Reduced motion not honoured (FR-ANIM-03, NFR-A11Y-01):** shipping particles under
  `prefers-reduced-motion: reduce` would violate the setting. Mitigation — the component
  **reads** the preference (`matchMedia`) and **omits** the particle nodes entirely under
  reduced motion (not just pauses them); a jsdom test (override `matches: true`) asserts
  the static-gradient-only branch, and the default (`matches: false`) asserts the effect
  renders.
- **The layer intercepting interaction (FR-ANIM-04):** a missing `pointer-events: none`
  or a wrong z-index would let the backdrop swallow clicks/focus. Mitigation —
  `pointer-events: none` + `-z-10` + `aria-hidden` + no focusable children, asserted by a
  jsdom test; the container is the only element and it is inert.
- **Performance regression (NFR-PERF-03):** a heavy particle system or a new
  canvas/WebGL dep would blow the budget. Mitigation — **CSS gradients + a fixed small
  count of CSS/SVG particles**, **no new dependency**, no per-frame JS (D6); the budget is
  documented and the build adds no chunk.
- **SSR / hydration / console noise:** reading `matchMedia` or "now" during SSR (where
  `window` is absent) would throw or mismatch. Mitigation — both reads are **guarded**
  (`typeof window !== "undefined"`, the `ThemeProvider` pattern) and happen on the client;
  the server renders the neutral default, the client refines after mount; a test asserts
  the console stays clean.
- **Scope creep:** the temptation to add twilight stages, lightning for thunder,
  fog-density, audio, a settings toggle, or a readable-data overlay is resisted — those
  are explicit **Exclusions** / owned elsewhere; this slice renders the gradient + one
  calm effect, driven solely by today's category, the location's sun times, and
  `prefers-reduced-motion`.

## ADR note

The **shared-`WeatherContext` cross-slice integration** (D1) is the decision worth
recording as an **ADR** (flagged ADR-worthy): it establishes who owns the single weather
fetch (the `forecast` capability, per TC-DATA-01) and how decorative consumers obtain
derived weather **without** a duplicate request (a small provider the forecast publishes
into and the background consumes), documents the alternative (the background fetching
`/api/forecast` itself — a duplicate), and recommends the shared-context approach. The
**client-driven** `WeatherBackground` (reading the active-location-derived snapshot +
`matchMedia` + "now" on the client) is the **ARCHITECTURE LESSON** already recorded in
`docs/current-state.md` (location/clock-dependent work must be client-driven because
`app/page.tsx` is statically prerendered) — an applied decision, not a new one. The
**day/night-from-the-location's-sun-times** rule (D4) is mandated by FR-ANIM-02 +
AGENTS.md (day-bound logic uses the active location's local times, never the visitor's
clock) and reuses the locked fixed-ISO-local-parse discipline — also applied, not new.
The **CSS-gradient + CSS/SVG-particle, no-new-dep** performance approach (D6) is the
standing way to honour NFR-PERF-03 for a decorative layer and is documented here rather
than as a standalone ADR.
