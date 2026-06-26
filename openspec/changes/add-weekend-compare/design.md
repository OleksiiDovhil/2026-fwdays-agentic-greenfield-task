## Context

`add-weekend-compare` is the **Wave 5** slice (capability plan §4.9, §6) — the
**LAST capability slice** and the terminus of the critical path
(`app-shell → city-search → forecast → animated-bg → weekend-compare`). It depends
on three archived/locked upstreams: `add-city-search` (the active location),
`add-forecast` (the `/api/forecast` route + the `Forecast`/`DailyForecast` shape),
and `add-comfort-score` (`upcomingWeekend`, `comfortScore`, `ComfortBadge`). The
shell shipped the slot this slice fills: `components/shell/ShellContent.tsx`
renders an inert `<div data-slot="compare" aria-hidden="true" />` in the located
layout. This slice replaces that stub with a real chip row + "Compare weekend"
toggle + sticky 3-column Sat/Sun table, and adds the small in-memory
`PinProvider` it reads from.

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email; keyless; in-memory only; no new endpoint.** Tests are **Vitest**
only — pure unit tests + jsdom component tests — **no Playwright** (TC-STACK-05,
ADR-0004). The per-slice "smoke" is a **service/render smoke over mocked forecast
payloads** (the compare-row model + the chip row / table render / empty state), not
a DB smoke. The pure layer (`lib/compare`) is **framework-free** (TC-PURE-01): no
`next/*`, no `react`, no DOM — 100% unit-testable.

The locked conventions reused **verbatim**, not re-built:

- **The active-location state** — `components/providers/LocationProvider.tsx`,
  whose `useLocation() → {location, setLocation}` exposes the validated active
  location. A "pin" pins `location`; a column's "make active" calls
  `setLocation(city)` — the SAME setter city-search/map write. This slice does NOT
  re-parse the URL (spec: downstream reads the validated state).
- **The `forecast` capability** — the keyless `app/api/forecast?lat=&lon=` Route
  Handler (the only weather fetch path, TC-DATA-01) returning the validated
  `Forecast` (`{ days: DailyForecast[]; hourly }`). This slice **reuses that route
  per pinned city** (no new endpoint), reuses `toComfortInput(day)`, and mirrors
  `ForecastSection`'s `AbortController` + captured-identity latest-wins discipline
  + `keyOf` ({lat,lon} rounded) cache key — but caches **per city** (a map), not a
  single slot.
- **The `comfort-score` capability** — `comfortScore(daily)` (pure/total),
  `upcomingWeekend(days)` (the Sat + its consecutive Sunday by the location-local
  `time` date), and `ComfortBadge` (value + accessible UA band label,
  color-not-only). This slice does NOT recompute scoring.
- **The ARCHITECTURE LESSON** (current-state) — `app/page.tsx` is statically
  prerendered, so anything depending on the active location MUST be
  **client-driven**; `CompareSection` is therefore `"use client"` (it reads
  `usePins()`/`useLocation()` and fetches `/api/forecast` on the client off the
  pinned-city set).
- **i18n** — `t("namespace.key")` (UK default → EN fallback → ""); a small sibling
  `compare.*` namespace, never reaching into `shell.*`. No runtime i18n library
  (NFR-I18N-01); no exclamation marks (BC-BRAND-01).
- **The shared error/empty primitive** — `components/ui/Notice.tsx` (`error` →
  role alert, `empty`/`info` → role status), reused for the empty state and a
  failed-column Notice; and `forecast.precipPlaceholder` ("—") as the calm
  per-cell placeholder.

## Goals / Non-Goals

**Goals:**

- Let the visitor **pin up to 3 cities** into a chip row above the forecast
  (dedupe by `lat`/`lon`, the cap surfaced calmly, in-memory only — FR-COMPARE-01).
- Provide a **"Compare weekend" toggle** to a **3-column Sat/Sun table** showing,
  per pinned city, hi/lo °C, precipitation %, and the comfort score
  (FR-COMPARE-02), reusing `forecast` + `comfort-score` — never recomputing.
- **Sticky per-column headers** with the city name (truncated-but-AT-available)
  and a **"make active"** button that calls `setLocation(city)`; the active column
  marked with `aria-current` + a visible **non-color** cue (FR-COMPARE-03,
  NFR-A11Y-01/02).
- Fetch each pinned city's weekend forecast from the **reused** `/api/forecast`
  route **in parallel** (`Promise.all`, no waterfall), cached per city in memory
  (ADR-0003, TC-DATA-01, NFR-COST-01).
- **Degrade honestly** (NFR-OBS-01): zero pins → a calm empty "pin a city" state;
  a still-loading/failed city → calm per-cell em-dash placeholders (+ a calm Notice
  for a wholly-failed column), the other columns intact; a weekend out of the 7-day
  window → comfort-score's calm out-of-range handling. Never a crash / 500 / blank;
  the console stays silent.
- Keep the pure layer (`lib/compare`) framework-free and 100% unit-testable
  (TC-PURE-01); React / DOM / `fetch` concerns live only in `CompareSection` and
  `PinProvider`.
- All copy from a calm Ukrainian-first `compare.*` namespace, **no exclamation
  marks** (NFR-I18N-01, BC-BRAND-01).

**Non-Goals (explicit Exclusions — see the spec):**

- **More than 3 pins**, reordering chips, or saving comparison sets — the cap is
  exactly 3.
- **Persisting** pins / the toggle / the active column across reloads — in-memory
  only, no DB, no cookies/localStorage (ADR-0003, BC-PRIVACY-03).
- **Days other than the upcoming Saturday and Sunday** (no 7-day side-by-side, no
  historical/climate comparison) — comparison is weekend-only.
- **Metrics beyond hi/lo, precipitation, and comfort** (no wind / UV /
  sunrise-sunset / hourly columns) — those stay in `forecast`.
- **Computing comfort or adding a new fetch/endpoint** — scores come from
  `comfort-score`, weekend data from the **reused** `forecast` route.
- **Selecting/searching cities from scratch** (owned by `city-search` / `map` —
  this pins already-resolved locations); **exporting / printing / sharing** the
  comparison (no shareable comparison URL).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom tests; the smoke is a service/render smoke.

## Decisions

### D1 — Pin state: a small in-memory `PinProvider` + `usePins()`, dedupe by lat/lon, max 3, no persistence (FR-COMPARE-01)

The chip row and the compare table both read the pinned-city list, and "pin"
operates on the **current active location** — so the list needs a small shared,
in-memory home.

- **Chosen approach — `components/providers/PinProvider.tsx` (`"use client"`):**
  exposes
  ```
  type PinnedCity = Location;            // {lat, lon, name} — the LOCKED shape, reused
  type PinContextValue = {
    pins: PinnedCity[];                  // ordered, length 0..3
    pin: (city: PinnedCity) => void;     // pins; dedupe by keyOf; no-op past the cap
    unpin: (key: string) => void;        // remove by the rounded {lat,lon} key
    isPinned: (key: string) => boolean;
    atCap: boolean;                      // pins.length >= 3
  };
  ```
  - **Dedupe by a rounded `lat`/`lon` key** — the SAME `keyOf(loc) =
    "${lat.toFixed(4)},${lon.toFixed(4)}"` identity `ForecastSection` uses, so the
    pin list, the per-city forecast cache (D4), and the table columns all key on
    one identity. Pinning an already-pinned city is a no-op (no duplicate chip).
  - **Enforce max 3** — `pin` past 3 is a **no-op** that the UI surfaces as the
    calm cap message (the button is disabled with the cap copy as its accessible
    hint, D2); the provider never throws and never silently swallows without the UI
    explaining (NFR-OBS-01). The cap is **exactly 3** (Exclusions).
  - **In-memory only (ADR-0003):** the list lives in React state; **no cookies, no
    localStorage, no server store**; it **resets on reload** (the spec's
    "do not persist across reload" scenario, BC-PRIVACY-03).
  - `usePins()` returns a safe **empty-list default** (`{ pins: [], pin: () => {},
    unpin: () => {}, isPinned: () => false, atCap: false }`) outside a provider so a
    stray consumer never crashes (mirroring `useLocation`/`useTheme`/`useWeather`).
- **Mount point — `app/layout.tsx`, inside the existing `LocationProvider`.** The
  providers' home already mounts `ThemeProvider` + `LocationProvider` (+
  `WeatherProvider` once animated-bg lands); `PinProvider` joins them so the pin
  list is in scope for the whole located subtree (the chip row + the table, whether
  they render together in `CompareSection` or are split). It is **not** the
  `app/page.tsx` composition serialize point (§3a) — that file stays untouched.
- **Pin button placement — in the compare area (the chip-row header).** The "Pin
  this city" button pins `useLocation().location`; it lives **beside the "Compare
  weekend" toggle**, in the `CompareSection`'s chip-row header above the forecast,
  so a located visitor pins the place they are viewing without leaving the
  forecast. **Decision: the pin button lives in the compare/chip-row area, not in
  the search box or each day card** — it keeps the pin/compare affordances together
  and the search box single-purpose (city selection). It is disabled (with the cap
  copy as its accessible hint) at the cap and when there is no active location.
- **Trade-off:** a tiny provider + hook (vs local state inside `CompareSection`)
  adds one mount in the layout, but it keeps the pin list available even if the
  chip row and table are ever split into sibling slots, mirrors the established
  provider pattern, and gives `usePins()` a safe default — at the cost of one more
  context. Dedupe/cap live in the provider (not the component) so they are
  unit-tested deterministically (TC-PURE-able reducer logic) and the component
  cannot bypass them.

### D2 — `CompareSection` (`"use client"`): chip row + toggle + sticky table, fills the slot (FR-COMPARE-01/02/03)

- **`components/compare/CompareSection.tsx`** is marked **`"use client"`**: it
  reads `usePins()` + `useLocation()` and fetches `/api/forecast` per pinned city
  on the client (the ARCHITECTURE LESSON — pin/location-dependent work is
  client-driven). It **replaces the inert `<div data-slot="compare">` stub** inside
  `components/shell/ShellContent.tsx` (the slot fill, §3a); it does **NOT** edit
  `app/page.tsx`.
- **Composition:**
  1. A **chip row** above the forecast — one chip per pinned city (the resolved
     city name + a keyboard-operable, **named** unpin control, e.g. `aria-label`
     "Відкріпити {name}"). The row is **not rendered at all** while `pins` is empty
     (the spec's "chip row hidden when nothing is pinned"). Alongside it: the **"Pin
     this city"** button (D1) and the **"Compare weekend"** toggle.
  2. The **"Compare weekend" toggle** — a real toggle exposing its on/off state to
     AT (`aria-pressed` on a button, or a labelled `role="switch"`/checkbox). Off →
     the normal forecast view (the table is not shown), pins intact; on → the table.
  3. On toggle-on, the **sticky 3-column table** — a real `<table>`: one
     `<th scope="col">` per pinned city in a **sticky header** (`position: sticky;
     top: 0` via Tailwind `sticky top-0`), and `<th scope="row">` row headers for
     Saturday / Sunday × (hi/lo, precip, comfort). Each column header shows the city
     name (constrained to the column — `truncate` + a `title`/`aria-label` carrying
     the full name so a long name like `Кам'янець-Подільський` does not overflow or
     hide the button, the spec's long-name scenario) and a **"make active"** button
     (D5). Cells render hi/lo °C, precip %, and a **`ComfortBadge`** per day, all
     from `buildCompareRow` (D3). Up to three columns; a single pin → a one-column
     table (still valid, not empty/error).
  4. **Empty / loading / error states (D... NFR-OBS-01):** zero pins → a calm
     `<Notice variant="empty">` with the EVAL-GRADED `compare.empty.*` copy guiding
     the visitor to pin a city; a still-loading or failed city → calm per-cell
     `forecast.precipPlaceholder` ("—") placeholders, and for a wholly-failed column
     a calm `<Notice>` / labelled cell, **never** a crash / 500 / blank, with the
     other columns rendering normally.
- **Reactivity:** the table is a pure function of `(pins, per-city forecast cache,
  active location, toggle)`; unpinning a city removes its column, pinning adds one,
  "make active" re-renders the active-column cue. Console silent on every path (no
  `console.*`).
- **Trade-off:** a single `CompareSection` owning the chip row + toggle + table +
  the per-city fetch (vs splitting the chip row into its own sibling slot) keeps the
  fetch/cache and the toggle state in one place and fills the **one** reserved
  compare slot; the cost is a slightly larger component, mitigated by extracting the
  pure model (`lib/compare`, D3) and small presentational subcomponents (chip,
  header, cell) so the file stays legible and the logic is unit-tested off-component.

### D3 — Pure `lib/compare`: `selectWeekend` + `buildCompareRow`, total (TC-PURE-01, FR-COMPARE-02)

- **`lib/compare/weekend.ts`** — `selectWeekend(forecast: Forecast | null |
  undefined): { saturday: DailyForecast | null; sunday: DailyForecast | null }`, a
  pure, **total** helper that finds the upcoming **Saturday** (weekday 6) in
  `forecast.days` and its **consecutive Sunday** (Saturday + 1 calendar day) by the
  location-local `time` date — the SAME fixed-`Date.UTC(y, m-1, d)` discipline as
  `comfort-score`'s `upcomingWeekend` / `lib/forecast/format.ts localWeekday`
  (**never `toISOString`, never `new Date("YYYY-MM-DD")`, never the viewer's
  clock**, AGENTS.md/FR-COMFORT-05). Degrades calmly: no Saturday but a Sunday tail
  → `{ saturday: null, sunday: <first Sunday> }`; neither in the window (short /
  out-of-range `days`) → `{ saturday: null, sunday: null }`. It returns the
  `DailyForecast` objects (the row builder reads their display + comfort fields), so
  the Sat/Sun selection stays consistent with the forecast the user sees and with
  `upcomingWeekend`'s pairing.
- **`lib/compare/row.ts`** — `buildCompareRow(city: Location, state:
  CityForecastState): CompareRow`, a pure, **total** model builder where
  `CityForecastState = { status: "loading" } | { status: "failed" } | { status:
  "ok"; forecast: Forecast }`. It produces the exact display model the table
  renders:
  ```
  type DayCells = {
    tempMax: number | null;          // °C, sign preserved; null → placeholder
    tempMin: number | null;
    precipProbability: number | null;// present 0 stays 0 (shown "0%"); null → placeholder
    comfortValue: number | null;     // comfortScore(toComfortInput(day)).value, or null
  } | null;                          // null when that day is out of the window
  type CompareRow = {
    key: string;                     // keyOf(city)
    name: string;
    status: "ok" | "loading" | "failed" | "out-of-range";
    saturday: DayCells;
    sunday: DayCells;
  };
  ```
  - For `status: "ok"`, it calls `selectWeekend(forecast)`; if BOTH Sat and Sun are
    `null` → `status: "out-of-range"` (the spec's out-of-window case, reusing the
    calm handling). For each present day it carries the **nullable** numbers as-is
    (no fabricated 0) and the comfort value from `comfortScore(toComfortInput(day))`
    — so a present `0%` precip stays `0` (rendered "0%") while an **absent** precip
    stays `null` (rendered the em-dash placeholder, the spec's zero-vs-absent
    scenario). Negative temps are carried through with their sign (the component
    formats via the locked `roundAwayFromZero` + `forecast.minus` + `forecast.unit
    .celsius`, so `-12°C` renders, never `12`/`0`/blank — the extreme-value
    scenario).
  - For `loading` / `failed`, `saturday`/`sunday` are the not-ready model the
    component renders as placeholders; **never throws**.
- **Why pure helpers (not inline in the component):** the Sat/Sun selection + the
  zero-vs-absent + extreme-negative handling + the out-of-range branch are exactly
  the objectively-checkable behaviours the spec pins, so they live in `lib/compare`
  with colocated tests over a mocked `Forecast` (TC-PURE-01) and the component only
  formats + lays out. **Trade-off:** one extra model type (`CompareRow`) vs the
  component reading `Forecast` directly — but it makes the missing/zero/extreme
  rules unit-tested deterministically and keeps the table dumb.

### D4 — Parallel per-city forecast fetch over the REUSED `/api/forecast` route, cached per city (TC-DATA-01, NFR-COST-01)

This is a key decision. Each pinned city needs its weekend forecast, and the spec
mandates **no waterfall** and **no new endpoint**.

- **Reuse the route — no new endpoint.** Each city's weekend data comes from the
  SAME keyless `GET /api/forecast?lat=&lon=` Route Handler the `forecast` capability
  owns (TC-DATA-01 keeps the only weather fetch there; NFR-COST-01 keeps it
  keyless). `CompareSection` calls it **once per pinned city** with that city's
  `lat`/`lon` — it does NOT add a route, does NOT call Open-Meteo directly, and does
  NOT re-validate beyond the client belt `ForecastSection` already uses
  (`readForecast`-style: a typed `{ error }` / unreadable / zero-day body → the
  failed state).
- **Parallel, not waterfall.** On the **set of pinned cities** changing, fetch the
  cities **not already cached** with **`Promise.all`** (or `Promise.allSettled` so
  one city's failure does not reject the batch) — all in flight at once, no
  awaiting one before starting the next (the spec/plan §4.9 risk: "composing
  multiple cities' fetches without waterfalls"). Each fetch carries an
  `AbortController`; a city removed (unpinned) mid-flight is **discarded** on
  resolve via a captured-identity guard (the latest-wins discipline
  `ForecastSection`/`SearchBox` use), so a late response for a no-longer-pinned city
  is never cached/rendered.
- **Cache per city in memory.** A `Map<string /* keyOf */, CityForecastState>` (or
  a `Record` in state) holds each city's `loading | failed | ok` state +
  `Forecast`. A city already in the cache is not re-fetched on a re-render (only a
  newly-pinned city triggers a fetch); the cache is **in-memory only** (ADR-0003),
  resets on reload. Re-pinning a previously-unpinned city re-fetches (its cache
  entry was dropped on unpin, or is simply re-requested).
- **Trade-off:** a per-city map + N parallel requests (vs a single combined
  request) means up to 3 concurrent calls to the existing route, but it reuses the
  one validated route with **zero** new endpoints/keys, keeps each city
  independently cacheable + abortable, and lets one city fail calmly without
  affecting the others (per-column placeholders). The cost — N requests instead of
  one — is bounded at 3 and is the explicit anti-waterfall choice; a batch endpoint
  is rejected (it would be a new endpoint, against the reuse mandate).

### D5 — "Make active": each column header's button calls `setLocation(city)` (FR-COMPARE-03)

- Each column's sticky header carries a **"make active"** button (a real
  `<button>`, keyboard-operable, with an accessible name identifying the city, e.g.
  `aria-label` "Зробити активним {name}"). Pressing it calls
  **`setLocation(city)`** from the locked `useLocation()` — the SAME setter
  city-search/map write — so the main forecast, map, and background follow that
  place. It does **not** unpin the city or change the other pins, and it does not
  close the comparison (all columns remain).
- **The active column is distinguished beyond color (NFR-A11Y-01/02):** the column
  whose `keyOf` equals the active location's `keyOf` carries **`aria-current="true"`
  on its header `<th>`** (AT announces it as current) **and** a visible **non-color
  cue** — a textual/icon marker (e.g. a checkmark or an "активно" label) and/or the
  active column's "make active" control shown in a distinct **pressed/disabled**
  state (`aria-pressed="true"` / `disabled`) — so the active column is identifiable
  without perceiving color, in addition to any color highlight. Making the active
  city active again is a **no-op** (the button may be disabled when already active;
  the spec's no-op scenario): no error, no reset of the other pins.
- **Trade-off:** disabling the active column's "make active" button gives the
  non-color cue for free (a clearly inert control) and makes "active-again" a
  natural no-op; the cost is that the active column's button is not focusable as a
  control — acceptable because activating the already-active city is a no-op anyway,
  and `aria-current` + a textual marker still convey the state to AT.

### D6 — i18n (`compare.*`) + a11y: a calm namespace, a real semantic table, no exclamation marks

- A small **`compare.*`** namespace in `lib/i18n/{uk,en}.ts` (sibling to
  `forecast.*`/`comfort.*`/`shell.*`, never reaching into `shell.*`) carries every
  user-visible static string: `compare.toggle.label` + on/off state text,
  `compare.header.{saturday,sunday,hiLo,precip,comfort}` (table headers),
  `compare.makeActive` + `compare.active` (the active-column marker),
  `compare.unpin` (chip remove), `compare.pin` (the pin button),
  `compare.cap` (the calm 3-city cap message), `compare.empty.{title,description}`
  (the EVAL-GRADED empty "pin a city" copy), and `compare.error.*` (the
  per-cell/column error copy). The neutral missing-data placeholder reuses the
  existing `forecast.precipPlaceholder` ("—"). Calm, practical tone; **no
  exclamation marks** (BC-BRAND-01, enforced across both locales by the existing
  `lib/i18n/i18n.test.ts` sweep — any added key is covered automatically). City
  names come from the **resolved location data**, not `i18n` (exempt); comfort
  `rationale` stays owned by `comfort-score`. `en.ts` mirrors the shape (strict
  fallback subset).
- **A11y:** the table is a **real `<table>`** with `<th scope="col">` per city and
  `<th scope="row">` per metric/day, so AT announces each value with its city +
  day. Every control (chip unpin, the toggle, each "make active") has an accessible
  name + a visible focus style + is keyboard-operable (NFR-A11Y-01). The toggle
  exposes its on/off state (`aria-pressed`/`role="switch"`). The empty/error states
  use the locked `Notice` (role status/alert). The `ComfortBadge` already conveys
  the band beyond color (its accessible label). Contrast is governed by the locked
  AA-verified tokens (no new readable color introduced — NFR-A11Y-02).
- **Trade-off:** a real semantic `<table>` (vs a div-grid) is slightly more markup
  but is mandated by the spec ("a real, semantically structured table") and gives
  `scope`d headers + sticky positioning for free; the cost is careful sticky-header
  CSS, pinned by the spec's vertical + horizontal scroll scenarios (covered by the
  sticky utilities; jsdom asserts the structure/attributes, the live scroll is
  visual and env-gated per ADR-0004).

## Data model

No persistent data, no DB, no schema (ADR-0003). State is ephemeral and in-memory:
the active location lives in the **URL** (owned by the locked LocationProvider); the
per-city weekend forecasts live **in `CompareSection`** (a per-city cache map, owned
by this slice); the pinned-city list lives in **`PinContext`** (this slice). The
shapes:

- **`PinnedCity`** = the locked `Location` (`{ lat, lon, name }`, reused — not
  redefined). `pins: PinnedCity[]` (length 0..3, ordered, deduped by `keyOf`), in
  `PinContext` (`components/providers/PinProvider.tsx`).
- **`CityForecastState`** (`lib/compare/row.ts`) — `{ status: "loading" } |
  { status: "failed" } | { status: "ok"; forecast: Forecast }`; the per-city cache
  in `CompareSection` maps `keyOf(city) → CityForecastState`. `Forecast` /
  `DailyForecast` are **imported** from the locked `lib/forecast/types.ts` (not
  redefined).
- **`CompareRow`** / **`DayCells`** (`lib/compare/row.ts`) — the pure model builder's
  output the table renders (per Sat/Sun: nullable `tempMax`/`tempMin`/
  `precipProbability` + the `comfortValue`; `null` cells for an out-of-window day);
  `status: "ok" | "loading" | "failed" | "out-of-range"`. Internal to the slice.

The pure surface (`lib/compare`): `selectWeekend(forecast): { saturday, sunday }`
(total) and `buildCompareRow(city, state): CompareRow` (total). Both framework-free,
both deterministic in unit tests.

## Error handling strategy

- **Honest degradation everywhere (NFR-OBS-01).** Every "absence" reduces to a calm
  visible state, never a crash / 500 / blank:
  - **Zero pins** → the chip row is not rendered and the comparison shows a calm
    `<Notice variant="empty">` with the EVAL-GRADED "pin a city" copy (not an empty
    table, the spec's empty scenarios).
  - **A pinned city's forecast still loading** → its column's cells show the calm
    `forecast.precipPlaceholder` ("—") placeholder; the other columns render.
  - **A pinned city's forecast failed** (network / non-OK / malformed —
    `/api/forecast` returns the typed `{ error }`, never a raw 500) → that column's
    cells show the placeholder and a calm labelled state / `<Notice>`; **no error
    toast, no uncaught exception**, the other columns intact (the spec's
    missing/failed scenario).
  - **Weekend out of the 7-day window** (short `days`) → `selectWeekend` returns
    `null` Sat/Sun → `buildCompareRow` → `status: "out-of-range"` → a calm
    out-of-range cell/label (reusing comfort-score's calm out-of-range posture);
    never a fabricated value.
  - **The pin cap** → a fourth pin is refused with the calm `compare.cap` message
    (the button disabled with the cap copy as its hint), **never** silently dropped,
    **never** a toast.
- **Pure helpers are total:** `selectWeekend` and `buildCompareRow` are defined for
  every input (null / short / failed / loading / malformed `time`) and **never
  throw** to the UI (TC-PURE-01).
- **Number formatting is total (FR-COMPARE-02):** hi/lo via the locked
  `roundAwayFromZero` + `forecast.minus` + `forecast.unit.celsius` (sign preserved:
  `-12°C`, never `12`/`0`/blank; extreme values round without overflow); precip a
  present `0` → "0%" vs an absent `null` → the em-dash placeholder (never a
  misleading `0%`); within `0%..100%`, the `%` unit, the Ukrainian-first locale.
- **Console silence (NFR-OBS-01):** no `console.*` on any path; the per-city fetch
  guards a late/aborted/unmounted resolution (no stale `setState`, no warning); a
  test asserts the console stays clean across a healthy session (pin → cap → unpin →
  toggle → make-active) and the failed-city path.
- **No interaction regression:** every control is a real focusable element with an
  accessible name; the toggle's state and the active column's `aria-current` +
  non-color cue are asserted by jsdom tests, so a regression that lost the state cue
  is caught.

## Risks / Trade-offs

- **Waterfall fetching multiple cities (the central risk, plan §4.9, D4):** awaiting
  each city's forecast before starting the next would serialize up to 3 round-trips.
  Mitigation — the pinned cities are fetched **in parallel** (`Promise.all` /
  `allSettled`, no waterfall), each abortable, cached per city; a jsdom test asserts
  the parallel fetch (all cities' columns populate from a mocked `/api/forecast`
  without a serialized dependency).
- **A duplicate / new endpoint (TC-DATA-01, NFR-COST-01):** adding a batch
  "compare" endpoint or calling Open-Meteo directly would violate the reuse mandate.
  Mitigation — each city reuses the **existing** `GET /api/forecast?lat=&lon=`
  route; a review/grep confirms compare adds **no route** and no
  `api.open-meteo.com`/key reference.
- **Weekend computed from the viewer's clock instead of the location (FR-COMFORT-05,
  a correctness risk):** selecting Sat/Sun via `toISOString()` / `new Date("YYYY-MM-
  DD")` would shift the weekend for a west-of-UTC viewer. Mitigation — `selectWeekend`
  reads the location-local `time` dates via the **fixed `Date.UTC` parse** the locked
  `upcomingWeekend` / `localWeekday` use (never `toISOString`, never the viewer's
  clock); a unit test pins the Sat + consecutive-Sunday selection from a mocked
  `Forecast`.
- **Zero-vs-absent precipitation mis-rendered (FR-COMPARE-02):** treating an absent
  precip as `0%` (or hiding a real `0%`) would mislead. Mitigation — `buildCompareRow`
  carries a present `0` as `0` (rendered "0%") and an absent value as `null`
  (rendered the em-dash placeholder); a unit test asserts both.
- **Extreme/negative temps clipped or mis-signed (FR-COMPARE-02):** a Ukrainian-
  winter `-20°C` rendered as `20`/`0`/blank, or clipped. Mitigation — the locked
  `roundAwayFromZero` + `forecast.minus` + the column `truncate`/wrap keep the sign
  and digits within the column; a test asserts the negative hi/lo renders with sign +
  unit.
- **The active column not distinguishable without color (NFR-A11Y-02):** a
  color-only highlight fails low-vision users. Mitigation — `aria-current` + a
  textual/icon marker and/or a disabled "make active" control on the active column,
  asserted by a jsdom test (the cue moves when another column is made active).
- **A long city name breaking the sticky header (FR-COMPARE-03):** an untruncated
  long name overflowing or hiding the button. Mitigation — the name is `truncate`d
  (with a `title`/`aria-label` carrying the full name) and constrained to its
  column; the button stays visible/operable; a test asserts the full name is
  AT-available.
- **In-memory pins lost on reload surprising the user:** this is **intended**
  (ADR-0003, BC-PRIVACY-03) and an explicit Exclusion; the empty state guides
  re-pinning. No mitigation needed beyond the calm empty state.
- **Scope creep:** a 7-day side-by-side, a 4th pin, wind/UV columns, persistence, or
  a shareable comparison URL are resisted — explicit **Exclusions** / owned
  elsewhere; this slice pins, lays out the Sat/Sun table, and toggles, reusing
  `forecast` + `comfort-score`.

## ADR note

This slice introduces **no new ADR**. It is a **pure composer** that applies the
already-accepted decisions:

- **In-memory-only pinned-city state** (no DB, no cookies/localStorage) is mandated
  by **ADR-0003** (which names "pinned compare cities, FR-COMPARE-01" as the
  in-memory example) and BC-PRIVACY-03 — applied, not new.
- **Reusing the single `/api/forecast` route per city** (no new endpoint, keyless)
  is mandated by **TC-DATA-01** + NFR-COST-01 — applied, not new.
- The **client-driven** `CompareSection` (reading the active-location/pin state +
  fetching on the client) is the **ARCHITECTURE LESSON** already recorded in
  `docs/current-state.md` — applied, not new.
- **Selecting the weekend from the location's local `time` dates** (never the
  viewer's clock) is mandated by **FR-COMFORT-05 / AGENTS.md** and reuses the locked
  fixed-ISO-local-parse discipline — applied, not new.

The shared **`PinProvider`** (a small in-memory context the chip row + table read,
mounted in `app/layout.tsx` inside `LocationProvider`) follows the established
provider pattern (`Theme`/`Location`/`Weather`) and needs no standalone ADR — it is
a routine application of the in-memory-state decision. The maker should still record
the `lib/compare` + `PinProvider` + reuse conventions in `docs/current-state.md` for
the record at archive (it is the last capability slice).
