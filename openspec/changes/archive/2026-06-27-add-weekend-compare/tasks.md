## 1. Setup (`compare.*` i18n + the `PinProvider`/`usePins` hook + mount + pin-button placement)

> No database, no migrations, no auth, no email (ADR-0003). **No new deps** — the
> table is plain HTML + Tailwind sticky utilities, reusing the existing
> `ComfortBadge`/`Card`/`Button`/`Notice`/`cn()` primitives (NFR-PERF-03,
> NFR-DX-01). Reuse the LOCKED conventions: `lib/i18n` namespaces + `t()`,
> `useLocation()`/`setLocation`, the `app/api/forecast` route + the
> `Forecast`/`DailyForecast` shape + `toComfortInput`, `comfortScore`/
> `upcomingWeekend`/`ComfortBadge`, and the shell's `data-slot="compare"` slot. No
> exclamation marks anywhere (BC-BRAND-01, NFR-I18N-01).

- [x] 1.1 i18n (D6): add a small sibling `compare.*` namespace to `lib/i18n/uk.ts`
  + `lib/i18n/en.ts` (sibling to `forecast.*`/`comfort.*` — never edit `shell.*`),
  Ukrainian-first, calm, **no exclamation marks**: `compare.toggle.label` (+ on/off
  state text if not derived from `aria-pressed`), `compare.header.{saturday,sunday,
  hiLo,precip,comfort}` (table headers), `compare.makeActive`, `compare.active` (the
  active-column marker), `compare.unpin` (chip remove, name-templated for the
  accessible label), `compare.pin` (the pin button), `compare.cap` (the calm 3-city
  cap message), `compare.empty.{title,description}` (the EVAL-GRADED empty "pin a
  city" copy, target ≥ 90), `compare.error.*` (the per-cell/column error copy). The
  neutral missing-data placeholder REUSES the existing `forecast.precipPlaceholder`
  ("—") — do NOT add a new one. Mirror every key in `en.ts` (strict fallback subset,
  identical shape). The existing `lib/i18n/i18n.test.ts` no-`!` sweep covers the
  added keys automatically.
- [x] 1.2 `components/providers/PinProvider.tsx` (`"use client"`, D1) — a tiny
  in-memory `PinContext` exposing `{ pins: PinnedCity[]; pin: (city) => void; unpin:
  (key: string) => void; isPinned: (key: string) => boolean; atCap: boolean }` where
  `PinnedCity` is the LOCKED `Location` (`{ lat, lon, name }`) IMPORTED from
  `lib/location/types.ts` (do NOT redefine it). Hold the list in React state
  (in-memory ONLY — no cookies / localStorage / server store, ADR-0003; resets on
  reload). **Dedupe by the rounded `keyOf(loc) = "${lat.toFixed(4)},${lon.toFixed
  (4)}"` identity** (the SAME identity `ForecastSection` uses — colocate a tiny
  `keyOf` helper or import a shared one); pinning an already-pinned city is a
  **no-op**. **Enforce max 3**: `pin` past 3 is a no-op (the UI surfaces the cap, D2)
  — never throw, never silently swallow without the UI explaining. Export a
  `usePins()` hook returning the context value, or a safe **empty-list default**
  (`{ pins: [], pin: () => {}, unpin: () => {}, isPinned: () => false, atCap: false }`)
  outside a provider so a stray consumer never crashes (mirroring `useLocation`/
  `useTheme`).
- [x] 1.3 Mount `<PinProvider>` once in `app/layout.tsx` (D1) — **inside** the
  existing `<LocationProvider>`, wrapping `{children}`, so the pin list is in scope
  for the whole located subtree (the chip row + the table). `app/layout.tsx` is the
  providers' home (it already mounts `ThemeProvider` + `LocationProvider`); this is
  the analogous minimal edit. Do **NOT** edit `app/page.tsx` (§3a serialize point).
- [x] 1.4 Decide + record the **pin-button placement** (D1): the "Pin this city"
  button pins `useLocation().location` and lives in the **compare/chip-row area**
  (beside the "Compare weekend" toggle), NOT in the search box or each day card.
  Record the decision in a code comment in `CompareSection`. The button is disabled
  (with `compare.cap` as its accessible hint) at the cap and when there is no active
  location to pin.

## 2. Pure domain logic (`lib/compare` — framework-free, TC-PURE-01)

> No `next/*`, no `react`, no DOM globals — 100% unit-testable, **total** (never
> throws to the UI). Colocated `*.test.ts` with `@trace` ids. Write the §5 unit
> tests FIRST and confirm they FAIL (red) before implementing (test-first per
> AGENTS.md). Mirror the LOCKED fixed-ISO-local date discipline (`comfort-score`
> `upcomingWeekend`, `lib/forecast/format.ts localWeekday`) — never `toISOString`,
> never `new Date("YYYY-MM-DD")`, never the viewer's clock (AGENTS.md, FR-COMFORT-05).
> Import `Forecast`/`DailyForecast` from `lib/forecast/types.ts` and `comfortScore`/
> `toComfortInput` from the locked modules (do NOT redefine).

- [x] 2.1 `lib/compare/weekend.ts` (D3, FR-COMPARE-02) — a pure, **total**
  `selectWeekend(forecast: Forecast | null | undefined): { saturday: DailyForecast |
  null; sunday: DailyForecast | null }` that finds the upcoming **Saturday**
  (weekday 6) in `forecast.days` and its **consecutive Sunday** (Saturday + 1
  calendar day) by the location-local `time` date via a FIXED `Date.UTC(y, m-1, d)`
  parse (the locked discipline — no `toISOString`, no `new Date("YYYY-MM-DD")`).
  Degrade calmly: no Saturday but a Sunday tail → `{ saturday: null, sunday:
  <first Sunday> }`; neither in the window (short / out-of-range `days`) →
  `{ saturday: null, sunday: null }`. Never throws. Returns the `DailyForecast`
  objects so the row builder reads their fields (consistent with `upcomingWeekend`).
- [x] 2.2 `lib/compare/row.ts` (D3, FR-COMPARE-02) — a pure, **total**
  `buildCompareRow(city: Location, state: CityForecastState): CompareRow` where
  `CityForecastState = { status: "loading" } | { status: "failed" } | { status:
  "ok"; forecast: Forecast }`, `DayCells = { tempMax: number | null; tempMin: number
  | null; precipProbability: number | null; comfortValue: number | null } | null`,
  and `CompareRow = { key: string; name: string; status: "ok" | "loading" |
  "failed" | "out-of-range"; saturday: DayCells; sunday: DayCells }`. For `ok`, call
  `selectWeekend(forecast)`; if BOTH Sat and Sun are `null` → `status:
  "out-of-range"`. Carry each present day's **nullable** numbers as-is (a present `0`
  precip stays `0`; an absent precip stays `null` — no fabricated 0) and
  `comfortValue = comfortScore(toComfortInput(day)).value`. For `loading`/`failed`,
  set the matching `status` and not-ready (`null`) cells. Never throws.

## 3. Server

> None. This slice issues **no new endpoint and no new fetch path** (spec
> Exclusions, TC-DATA-01) — each pinned city's weekend data comes from the **REUSED**
> `app/api/forecast?lat=&lon=` Route Handler the `forecast` capability owns (§4.x).
> Do NOT add a route, do NOT call Open-Meteo directly, do NOT add a batch endpoint.
> No API key (NFR-COST-01). (Section intentionally empty.)

## 4. UI (`CompareSection` client: chip row + toggle + sticky 3-column table; fill the slot)

> `"use client"` for `CompareSection` — it reads `usePins()`/`useLocation()`, fetches
> `/api/forecast` per city, and renders the table (the ARCHITECTURE LESSON:
> pin/location-dependent work is client-driven). REPLACE the inert `<div
> data-slot="compare" aria-hidden="true" />` stub inside
> `components/shell/ShellContent.tsx` with `<CompareSection/>`; do **NOT** edit
> `app/page.tsx` (§3a). All copy from `compare.*` (no `!`); the placeholder is
> `forecast.precipPlaceholder`.

- [x] 4.1 `components/compare/CompareSection.tsx` (`"use client"`, D2) — the slot
  fill. Read `usePins()` + `useLocation()`. Render: a **chip row** above the
  forecast (one chip per pinned city: the resolved city name + a keyboard-operable,
  **named** unpin control `aria-label` from `compare.unpin`), the **"Pin this city"**
  button (D1, pins `location`; disabled at the cap / no-location), and the **"Compare
  weekend"** toggle. The chip row is **NOT rendered** while `pins` is empty (the
  spec's "hidden when nothing is pinned"). Then in §4.3 REPLACE the `ShellContent`
  compare-slot stub with `<CompareSection/>` (the only shell edit; no other shell
  change; do NOT edit `app/page.tsx`).
- [x] 4.2 Per-city forecast fetch — **parallel, reused route, per-city cache** (D4,
  TC-DATA-01, NFR-COST-01): on the **set of pinned cities** changing, fetch each
  not-yet-cached city's `/api/forecast?lat=&lon=` **in parallel** (`Promise.all` /
  `Promise.allSettled` so one failure does not reject the batch — **no waterfall**),
  each with an `AbortController` + a captured-identity latest-wins discard (a city
  unpinned mid-flight is dropped on resolve). Hold each city's `CityForecastState`
  (`loading | failed | ok` + `Forecast`) in an in-memory **per-city** map
  (`keyOf → state`, ADR-0003); a cached city is not re-fetched. Validate the body
  with the client belt `ForecastSection` uses (typed `{ error }` / unreadable /
  zero-day → `failed`). REUSE the route — add **no** endpoint, no direct Open-Meteo
  call.
- [x] 4.3 The **"Compare weekend" toggle** (D2, FR-COMPARE-02): a real toggle
  exposing its on/off state to AT (`aria-pressed` on a `<button>` or a labelled
  `role="switch"`). OFF → the normal forecast view (the table is NOT shown), pins
  intact; ON → the table (§4.4). Toggling off keeps the chip row + pins unchanged.
- [x] 4.4 The **sticky 3-column table** (D2/D6, FR-COMPARE-02/03): a real `<table>`
  — one `<th scope="col">` per pinned city in a **sticky header** (`sticky top-0`),
  `<th scope="row">` row headers for Saturday / Sunday × (hi/lo, precip, comfort).
  Build each column from `buildCompareRow(city, state)` (§2.2). Cells: hi/lo °C via
  the locked `roundAwayFromZero` + `forecast.minus` + `forecast.unit.celsius` (sign
  preserved, extreme values without overflow); precip a present `0` → "0%" vs an
  absent `null` → `forecast.precipPlaceholder` (NEVER a misleading "0%"); a
  **`ComfortBadge`** per present day. Up to three columns; a single pin → a
  one-column table (still valid, not empty/error).
- [x] 4.5 Per-column **sticky header + "make active"** (D5, FR-COMPARE-03,
  NFR-A11Y-01/02): each header shows the city name **constrained to the column**
  (`truncate` + a `title`/`aria-label` carrying the FULL name so a long name like
  `Кам'янець-Подільський` does not overflow or hide the button) and a **"make
  active"** button (`aria-label` from `compare.makeActive`, name-templated) that
  calls **`setLocation(city)`** (the locked setter; the main forecast/map/background
  follow). The **active** column (its `keyOf` equals the active location's) carries
  **`aria-current="true"`** on its header `<th>` **and** a visible **non-color** cue
  (a textual/icon marker from `compare.active` and/or the "make active" control shown
  disabled/`aria-pressed`), so it is identifiable without color. Making the active
  city active again is a **no-op** (disable the active column's button); the cue MUST
  move to the new column when another is made active. Do not unpin / close the table
  on make-active.
- [x] 4.6 **Empty / loading / error states** (D2, NFR-OBS-01): zero pins → a calm
  `<Notice variant="empty">` with the EVAL-GRADED `compare.empty.*` copy guiding the
  visitor to pin a city (not an empty table). A still-loading or failed city → calm
  per-cell `forecast.precipPlaceholder` ("—") placeholders, and for a wholly-failed
  column a calm `<Notice>` / labelled cell — **never** a crash / 500 / blank, the
  OTHER columns rendering normally. A weekend out of the 7-day window
  (`status: "out-of-range"`) → a calm out-of-range cell/label. Keep the console
  **silent** on every path (no `console.*`; guard late/aborted/unmounted resolutions).

## 5. Tests (Vitest only — unit + jsdom component; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement §§1–4 to green.
> Every test file carries `@trace` ids. Never weaken a test to pass it; if a test
> contradicts the spec, change it deliberately. Mock `fetch` (returning a mocked
> `{ forecast }` body per city) and seed `useLocation()`/`PinProvider`; do NOT call a
> real network. Use stable `data-slot`/`data-testid`/`role` hooks so assertions are
> objective.

- [x] 5.1 Unit `lib/compare/weekend.test.ts` (FR-COMPARE-02, D3): from a mocked
  `Forecast`, assert `selectWeekend` picks the **upcoming Saturday + its consecutive
  Sunday** by the location-local `time` date; assert the **location-not-viewer-clock**
  basis (a `time` set so a naive `new Date(string)` would shift the day still selects
  the correct Sat/Sun — fixed-`Date.UTC` parse); assert the degrade cases (Sunday
  tail only → `{ saturday: null, sunday: <Sunday> }`; short / out-of-window `days` →
  `{ null, null }`); no throw. `@trace FR-COMPARE-02`.
- [x] 5.2 Unit `lib/compare/row.test.ts` (FR-COMPARE-02, D3): assert `buildCompareRow`
  builds the model for `ok` (Sat/Sun cells with the nullable numbers + `comfortValue`
  from `comfortScore`), `loading`, `failed`, and `out-of-range` (both Sat/Sun null);
  assert a **present `0%` stays `0`** while an **absent precip stays `null`** (the
  zero-vs-absent rule); assert an **extreme negative** hi/lo is carried with its sign
  (e.g. `tempMax: -12`, `tempMin: -20`); no throw on any input. `@trace FR-COMPARE-02`.
- [x] 5.3 Unit `components/providers/PinProvider.test.tsx` (FR-COMPARE-01, D1):
  drive `usePins()` (a test harness component) and assert **add** (pin → `pins`
  contains the city), **dedupe** (pinning the same `lat`/`lon` twice → one entry),
  **max-3** (a fourth pin is a no-op; `pins.length` stays 3, `atCap` true), and
  **remove** (unpin by key → the city is gone). Assert the safe empty-list default
  outside a provider. `@trace FR-COMPARE-01`.
- [x] 5.4 jsdom `components/compare/CompareSection.test.tsx` — **chip row** renders /
  removes pins / hidden-when-empty (FR-COMPARE-01, D2): seed `PinProvider` with
  cities and assert one chip per city (city name + a named unpin control); clicking
  unpin removes that chip; with zero pins the chip row is **not rendered** and the
  empty state shows. Assert the cap message appears (and the pin button is disabled)
  at 3 pins. `@trace FR-COMPARE-01`.
- [x] 5.5 jsdom **toggle switches to the table** (FR-COMPARE-02, D2): with cities
  pinned and `fetch` mocked, assert OFF shows the normal view (no table) and ON shows
  the comparison `<table>`; assert the toggle exposes its on/off state to AT
  (`aria-pressed`/`role="switch"`); toggling off keeps the pins. `@trace FR-COMPARE-02`.
- [x] 5.6 jsdom **table shows 3 columns from a PARALLEL `/api/forecast`**
  (FR-COMPARE-02, D4): mock `fetch` to return a distinct `{ forecast }` per city
  (`lat`/`lon` keyed); pin three cities, toggle on, and assert the table renders
  **three columns** each with Saturday + Sunday **hi/lo °C**, **precip %**, and a
  **comfort** `ComfortBadge` from that city's mocked payload. Assert the fetches run
  **in parallel** (all three requests issued before any resolves — e.g. assert the
  mock saw 3 calls with no awaited dependency / via deferred promises resolved out of
  order). Assert a **present `0%`** renders "0%" and an **absent precip** renders the
  "—" placeholder; assert a **negative** hi/lo renders with its sign + `°C`. `@trace
  FR-COMPARE-02`.
- [x] 5.7 jsdom **"make active" calls `setLocation`** + active-column cue
  (FR-COMPARE-03, D5): mock `useLocation()` with a spy `setLocation`; pin three
  cities, toggle on, press a column's "make active" and assert `setLocation` was
  called with THAT city; assert the active column's header carries `aria-current` +
  a visible non-color cue (a marker and/or a disabled "make active" control) and that
  the cue **moves** when another column is made active; assert all three stay pinned.
  Assert a **long city name** is truncated but its FULL name is AT-available
  (`title`/`aria-label`) and the button stays operable. `@trace FR-COMPARE-03`.
- [x] 5.8 jsdom **empty state** + **calm error on a failed city** + console silence
  (NFR-OBS-01, FR-COMPARE-02, D2): with zero pins assert the calm `<Notice variant=
  "empty">` "pin a city" copy (no table); then with cities pinned and ONE city's
  `fetch` rejecting / returning a typed `{ error }`, assert that column shows calm
  "—" placeholders (and a calm Notice/label), the OTHER columns render their values,
  **no** error toast / uncaught exception, and the console stays clean (no
  `console.error`/`console.warn`) across pin → cap → unpin → toggle → make-active.
  `@trace NFR-OBS-01, FR-COMPARE-02`.
- [x] 5.9 EVAL `evals/cases/compare-copy.eval.ts` (D6, the empty-state + error copy
  quality, target ≥ 90): a `scenario` + async `produce()` that returns the
  user-visible **empty-state** copy (`compare.empty.*`) and the **per-cell/column
  error** copy (`compare.error.*`) — driving the i18n layer / a pure helper, NOT the
  React tree — plus a `rubric` marking the gating lines `CRITICAL:` (calm,
  practical, Ukrainian, guides the user to pin a city, no exclamation marks). Group
  by the copy-quality `dimension`. The maker does NOT self-grade (maker≠checker —
  the eval-suite judge grades it in Phase 6). `@trace FR-COMPARE-01, FR-COMPARE-02`.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the §5 tests FIRST and confirm they FAIL (red) for the right reason
  (missing modules / unimplemented branches, not weak assertions), then implement
  §§1–4 to green (test-first per AGENTS.md). Never weaken a test to pass it; if a
  test contradicts the spec, change it deliberately, not silently.
- [x] 6.2 Run `npm run lint` — zero errors/warnings. The `lib/compare`
  framework-free boundary (no `next/*`/`react`/DOM imports, TC-PURE-01) is NOT a
  dedicated eslint rule in this repo — it is upheld by the `lib/` convention, by
  review, and by the colocated PURE unit tests (`weekend.test.ts`/`row.test.ts` run
  framework-free over mocked input, so a stray React/DOM import would surface there).
  Likewise verified by review/grep, not a custom lint rule: no inline UI literals
  (NFR-I18N-01); **no new dependency** added (NFR-PERF-03/DX-01); and **no `fetch` to
  `api.open-meteo.com` and no new route** in compare — the `/api/forecast` route is
  REUSED (TC-DATA-01/NFR-COST-01), confirmed by `grep` over `.next/static` +
  `.next/server/app/api`.
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green, INCLUDING
  the new `lib/compare`, `PinProvider`, and `CompareSection` tests (+ the per-city
  abort/strand + failed-retry regression tests), and the existing suites unchanged.
  The shared `keyOf` was MOVED to `lib/location/key.ts` (a pure move; `lib/compare/
  key.ts` re-exports it and `ForecastSection` imports it — all forecast + compare
  tests stay green); no other upstream behavior changed (the route, `comfort.ts`,
  `ComfortBadge` are consumed as-is).
- [x] 6.4 Run `npm run build` — production build succeeds; console clean. Confirm
  `app/page.tsx` stays **static** (the ARCHITECTURE LESSON — `CompareSection` is a
  client island under the static page), the client bundle carries **no new
  dependency** and **no new `api.open-meteo.com` reference / key / route** from
  compare (NFR-COST-01, NFR-PERF-03), and no significant new chunk is added (plain
  HTML table + reused primitives).
- [x] 6.5 Run `node scripts/check-eval-ratchet.mjs` (the graded-quality bar) — no
  dimension regresses. The §5.9 compare-copy eval is graded by the eval-suite judge
  (maker≠checker); the maker does NOT self-grade — record the eval case as authored,
  and if `evals/results/latest.json` is absent record SKIP-with-note (the ratchet
  must not drop on existing dimensions).
- [x] 6.6 Run `npx openspec validate add-weekend-compare --strict` — zero
  errors/warnings ("Change 'add-weekend-compare' is valid").
- [x] 6.7 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [x] 6.8 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-weekend-compare` implemented/validated, and record the conventions for the
  record (it is the LAST capability slice): the in-memory **`PinProvider`** +
  `usePins()` (dedupe by `keyOf`, max 3, no persistence — ADR-0003; the pin button
  pins the active location and lives in the compare/chip-row area; "make active"
  calls `setLocation`); `lib/compare/{weekend,row}.ts` as the pure layer
  (`selectWeekend` total, location-local `time` date, never the viewer's clock;
  `buildCompareRow` total, zero-vs-absent precip + extreme-negative handling +
  `out-of-range`); the client `CompareSection` filling the shell compare slot (chip
  row + toggle + sticky 3-column table with `ComfortBadge` + make-active, empty/
  loading/error states); the **parallel per-city forecast fetch over the REUSED
  `/api/forecast` route** (no new endpoint, cached per city in memory); and that
  **all capability slices are complete** (next: the Phase-6 eval-suite grading +
  the remaining gates).
- [x] 6.9 SERVICE/RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003), step by
  step, over **mocked forecast payloads**: (a) build the compare-row model from a
  **mocked `Forecast`** — call `buildCompareRow(city, { status: "ok", forecast })`
  and assert the Sat/Sun cells carry the expected hi/lo (incl. a negative), the
  present-`0%`-vs-absent precip, and the `comfortValue`; (b) under jsdom, seed
  `PinProvider` with three cities + mock `fetch` per city, render `<CompareSection/>`,
  toggle on, and assert the **chip row + 3-column table** render with each city's
  values (parallel fetch) and a `ComfortBadge` per day; (c) render with **zero pins**
  and assert the calm **empty "pin a city"** state (no table); (d) render with one
  city's `fetch` failing and assert that column's calm "—" placeholders with the
  others intact and a clean console. Capture the pass output as the smoke evidence.
- [x] 6.10 GATED on 6.9 passing: `npx openspec archive add-weekend-compare --yes
  --skip-specs` (the baseline `openspec/specs/weekend-compare/spec.md` already holds
  the contract, so the delta is NOT re-applied via Option B). Do not archive before
  the service/render smoke passes.
