## Why

`add-weekend-compare` is the **Wave 5** slice (capability plan §4.9, §6) — the
**LAST capability slice** and the terminus of the critical path
(`app-shell → city-search → forecast → animated-bg → weekend-compare`). It owns
**FR-COMPARE-01..03** and lets an anonymous visitor weigh up to **three** cities
side by side for the upcoming weekend so they can decide where a trip is worth
taking: pin a few places into a small chip row above the forecast, flip a
**"Compare weekend"** toggle, and read a Saturday/Sunday table — hi/lo, precip
chance, and the comfort score — one column per city, then make any column the
active location with one click.

It is a **pure composer** of three LOCKED upstreams and writes **no new
cross-cutting machinery** — no new endpoint, no new data fetch path, no new
scoring, no DB:

- **The active location** — `useLocation()` from the locked `LocationProvider`.
  A "pin" pins the **current active location** (`useLocation().location`); a
  column's **"make active"** calls `setLocation(city)` — the SAME setter
  `city-search` and `map` write — so the main forecast / map / background follow
  that place. This slice does NOT re-parse the URL.
- **The `forecast` capability** — each pinned city's weekend data comes from the
  **SAME keyless `app/api/forecast?lat=&lon=` route handler** (reused — **no new
  endpoint**, TC-DATA-01, NFR-COST-01), returning the validated
  `Forecast`/`DailyForecast` shape. All pinned cities are fetched **in parallel**
  (`Promise.all`, no waterfall) and cached **per city in memory** (ADR-0003); the
  fetch + latest-wins discipline mirror `ForecastSection`. This slice does NOT
  re-validate, re-shape, or re-fetch beyond reusing that route.
- **The `comfort-score` capability** — the upcoming Saturday + Sunday are selected
  from each city's `DailyForecast` `time` dates via the locked `upcomingWeekend`
  (and the local `time` calendar dates), **never `toISOString` / the viewer's
  clock**; the per-day score is `comfortScore(toComfortInput(day))`; the number is
  shown via the locked **`ComfortBadge`** (value + accessible UA band label,
  color-not-only). This slice does NOT recompute weather or scoring.

The bar is high on the qualities the spec pins. Pinned-city state lives **in
memory only** (no DB, no cookies, no localStorage — ADR-0003, BC-PRIVACY-03) and
**resets on reload**. The cap is **exactly 3** (a fourth is refused with a calm
Ukrainian message, never silently dropped, never a toast); pinning the same city
twice does not duplicate it (dedupe by `lat`/`lon`). It is **honest under
failure** (NFR-OBS-01): zero pinned cities → a calm empty state guiding the user
to pin a city; a city whose forecast fails / is still loading → a calm
per-cell/per-column placeholder (an em dash) and a calm Notice, **never** a crash,
a 500, or a blank, while the other columns keep rendering; a weekend not in the
7-day window reuses comfort-score's calm out-of-range handling. The table is a
**real, semantically structured table** with sticky per-column headers, `scope`d
column headers, `aria-current` on the active column **plus a visible non-color
cue** (NFR-A11Y-01/02), and every control (chip unpin, the toggle, each "make
active") is keyboard-operable, named, and focus-visible. All copy is a small
`compare.*` namespace in `lib/i18n/{uk,en}.ts`, Ukrainian-first, calm, with **no
exclamation marks** (NFR-I18N-01, BC-BRAND-01). It fills the shell's
`ShellContent` compare slot; it does **NOT** edit `app/page.tsx` (§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email; keyless; in-memory only; Vitest only (no Playwright);** the pure
layer is framework-free (TC-PURE-01). The per-slice "smoke" is a **service/render
smoke over mocked forecast payloads** (the compare-row model from a mocked
`Forecast`; the chip row + table render; the empty state), **not** a DB smoke.

## What Changes

- **Pin state — a client `PinProvider` + `usePins()` hook
  (`components/providers/PinProvider.tsx`, `"use client"`, D1):** a tiny in-memory
  context holding an ordered list of up to **3** pinned cities (`{ lat, lon,
  name }`, reusing the locked `Location` shape) plus `pin(city)` / `unpin(key)`
  actions and a derived `isPinned`/`atCap`. **Dedupe by a rounded `lat`/`lon`
  key** (the SAME `keyOf` identity `ForecastSection` uses), **enforce max 3** (a
  fourth pin is a no-op that surfaces the calm cap message — never a throw, never
  a silent drop), **no persistence** (React state only — no cookies / localStorage
  / server store, ADR-0003; resets on reload). `usePins()` returns a safe
  **empty-list default** outside a provider so a stray consumer never crashes
  (mirroring `useLocation`/`useTheme`). **Mount point — `app/layout.tsx`, inside
  the existing `LocationProvider`** so BOTH the chip row and the compare table
  (which live in `ShellContent`, but conceptually could be siblings) read the same
  list — the analogous edit to how `WeatherProvider`/`ThemeProvider`/
  `LocationProvider` are mounted. Do **NOT** edit `app/page.tsx` (§3a).
- **Pin button placement (D1):** the **"Pin this city"** action pins the current
  active location (`useLocation().location`); it lives in the compare area
  (the `CompareSection`'s chip-row header, beside the toggle) so a located visitor
  can pin the place they are viewing without leaving the forecast. The button is
  disabled (with the calm cap copy as its accessible hint) at the 3-city cap and
  when there is no active location to pin. The decision + rationale are recorded in
  `design.md` D1.
- **Pure framework-free `lib/compare/` (TC-PURE-01, D3):** `weekend.ts` —
  `selectWeekend(forecast): { saturday: DailyForecast | null; sunday:
  DailyForecast | null }`, a **total** pure helper picking the upcoming Saturday
  (weekday 6) and its consecutive Sunday from a `Forecast`'s `days` by the
  location-local `time` date (the SAME fixed-`Date.UTC` discipline as
  `comfort-score`'s `upcomingWeekend` / `lib/forecast/format.ts localWeekday` —
  never `toISOString`, never the viewer's clock); a missing/short/out-of-window
  day → `null`. `row.ts` — `buildCompareRow(city, forecast | null | "loading" |
  "failed"): CompareRow`, a **total** pure model builder turning a city + its
  forecast-load state into the exact display model the table renders (per Sat/Sun:
  `tempMax`/`tempMin`/`precipProbability` carried as nullable numbers + the
  `comfortScore(toComfortInput(day)).value`), with a `status` of `ok | loading |
  failed | out-of-range` so the component renders calm placeholders without any
  branching of its own. No `next/*`, no `react`, no DOM — colocated `*.test.ts`.
- **Client compare UI fills the shell's compare slot
  (`components/compare/CompareSection.tsx` + subcomponents, `"use client"`, D2):**
  replaces the inert `<div data-slot="compare" aria-hidden="true" />` stub in
  `ShellContent` with the real chip row + toggle + table:
  - a **chip row** above the forecast — one chip per pinned city (city name + a
    keyboard-operable, named unpin control), hidden entirely when nothing is
    pinned; the **"Pin this city"** button + the **"Compare weekend"** toggle;
  - on toggle-on, a **3-column sticky table** (one column per pinned city) showing
    Saturday and Sunday hi/lo °C, precipitation %, and a **`ComfortBadge`** per
    day, fed by `buildCompareRow`; each column has a **sticky header** with the
    city name (truncated-but-AT-available) and a **"make active"** button
    (`setLocation(city)`); the active column carries `aria-current` + a visible
    non-color cue;
  - **empty / loading / error states**: zero pins → a calm `<Notice variant=
    "empty">` with the EVAL-GRADED "pin a city" copy; a still-loading or failed
    city → calm per-cell em-dash placeholders (and, for a wholly-failed column, a
    calm `<Notice>`), never a crash / 500 / blank, with the other columns intact.
  - **Per-city forecast fetch (D4):** on the set of pinned cities changing, fetch
    each city's `/api/forecast?lat=&lon=` **in parallel** (`Promise.all`, no
    waterfall), with an `AbortController` + captured-identity latest-wins discard
    (a city removed mid-flight is dropped), caching each city's validated
    `Forecast` in an in-memory **per-city** map (ADR-0003). Reuses the route — **no
    new endpoint**.
- **i18n — a small `compare.*` namespace (D6):** added to `lib/i18n/{uk,en}.ts`
  (sibling to `forecast.*`/`comfort.*`/`shell.*`, never reaching into `shell.*`):
  the toggle label + on/off state text, the table headers (Saturday/Sunday, hi/lo,
  precip, comfort), the "make active" label, the active-column marker text, the
  unpin label, the **pin button** label, the **pin-count / cap** message, the
  **empty-state** copy, and the **per-cell/column error** copy. Calm, practical,
  **no exclamation marks** (BC-BRAND-01, enforced across both locales by the
  existing `lib/i18n/i18n.test.ts` sweep). City names come from the resolved
  location data, not `i18n`; comfort `rationale` stays owned by `comfort-score`.

## Capabilities

### New Capabilities

- `weekend-compare`: a keyless, calm, Ukrainian-first side-by-side weekend
  comparison. The visitor pins up to **3** cities (a chip row above the forecast,
  dedupe by `lat`/`lon`, the cap surfaced with a calm message, in-memory only —
  ADR-0003) and flips a **"Compare weekend"** toggle to a **sticky 3-column
  Sat/Sun table** showing, per city, hi/lo °C, precipitation %, and the comfort
  score (a `ComfortBadge`). It is a **pure composer**: weekend data comes from the
  reused `forecast` `/api/forecast` route (the validated `Forecast`/`DailyForecast`
  shape, all cities fetched **in parallel**, cached per city in memory — **no new
  endpoint**, TC-DATA-01); the upcoming Saturday/Sunday + the score come from the
  `comfort-score` capability (`upcomingWeekend` by the location-local `time` date,
  `comfortScore(toComfortInput(day))` — never the viewer's clock); a column's
  **"make active"** sets the active location via the locked `setLocation` so the
  rest of the app follows. It degrades **honestly** (NFR-OBS-01): a calm empty
  state with no pins, calm per-cell/column placeholders for a missing/failed city,
  the other columns intact, the console silent. The table is a **real semantic
  table** (sticky headers, `scope`d column headers, `aria-current` + a non-color
  cue on the active column, keyboard-operable named focus-visible controls —
  NFR-A11Y-01/02). Pure framework-free `lib/compare` (`selectWeekend`,
  `buildCompareRow`, total) carries the Sat/Sun selection + the row model; the
  client `CompareSection` fills the shell's compare slot.

### Modified Capabilities

<!-- None at the spec level. This change introduces the weekend-compare capability;
it COMPOSES the locked `forecast` capability (the `app/api/forecast` route, REUSED
with NO new endpoint, + the `Forecast`/`DailyForecast` shape + `toComfortInput`), the
locked `comfort-score` capability (`upcomingWeekend`, `comfortScore`, `ComfortBadge`),
and the locked active-location state (`useLocation`/`setLocation`), and fills the
shell's `ShellContent` compare slot. It does NOT change any other capability's spec.
The only shared-file touches are: mounting `<PinProvider>` once in `app/layout.tsx`
(the providers' home, inside `LocationProvider`); replacing the inert compare-slot
stub inside `components/shell/ShellContent.tsx` with `<CompareSection/>`; and adding
the `compare.*` namespace to `lib/i18n/{uk,en}.ts`. It does NOT edit `app/page.tsx`
(§3a serialize point). No upstream component (`ForecastSection`, the route handler,
`comfort.ts`) is modified — they are consumed as-is. -->

## Impact

- **Specs:** the baseline `openspec/specs/weekend-compare/spec.md` already exists
  (adopted at G2, 7 requirements — FR-COMPARE-01..03 + the NFR-A11Y-01 /
  NFR-I18N-01 / NFR-OBS-01 requirements that travel with this slice). The delta
  under `specs/weekend-compare/spec.md` restates that contract as `## ADDED
  Requirements` for the record and for `openspec validate add-weekend-compare
  --strict`; archive runs with `--skip-specs` because the baseline already holds it
  (OpenSpec Option B is not re-applied).
- **Code (new):** `components/providers/PinProvider.tsx` (the in-memory
  `PinContext` + `usePins()` hook, client); `lib/compare/{weekend,row}.ts`
  (framework-free) with colocated `lib/compare/*.test.ts`;
  `components/compare/CompareSection.tsx` and its small subcomponents (the chip
  row, the toggle, the sticky 3-column table, the per-column header with "make
  active") — the slot fill; jsdom tests for the chip row / toggle / table / empty /
  error states; an eval case grading the empty-state + error copy quality
  (`evals/cases/compare-copy.eval.ts`, target ≥ 90).
- **Code (extended):** `components/shell/ShellContent.tsx` — the inert
  `<div data-slot="compare" aria-hidden="true" />` stub is replaced with
  `<CompareSection/>` (filling the slot the shell reserved, §3a; no other shell
  change). `app/layout.tsx` — mounts `<PinProvider>` once inside the existing
  `<LocationProvider>` (the providers' home, NOT the `app/page.tsx` composition
  serialize point). `lib/i18n/{uk,en}.ts` — gains the `compare.*` namespace
  (sibling to the others).
- **Dependencies:** **none added** (NFR-PERF-03, NFR-DX-01) — the table is plain
  HTML + Tailwind sticky utilities; it reuses the existing `ComfortBadge`, `Card`,
  `Button`, `Notice`, and `cn()` primitives. **No database, no auth, no email**
  (ADR-0003). **No new external call and no new endpoint** — each pinned city's
  weekend data comes from the **reused** `forecast` `/api/forecast` route, so
  **zero** new keys (NFR-COST-01, TC-STACK-03). **No Playwright** (TC-STACK-05);
  verification is **Vitest** only — pure unit tests for `selectWeekend`
  (Sat/Sun selection from a `Forecast`, incl. short/out-of-window) and
  `buildCompareRow` (ok / loading / failed / out-of-range, extreme negatives,
  present-`0%` vs absent precip), and jsdom component tests for the chip row
  (renders / removes pins / hidden-when-empty / cap message / dedupe), the toggle
  (switches to the table, exposes on/off state), the table (3 columns with
  hi/lo/precip/comfort from a mocked **parallel** `/api/forecast`, sticky headers,
  `aria-current` + non-color cue, "make active" calls `setLocation`), the empty
  state, and a calm error on a failed city + a silent console. The per-slice
  "smoke" is a **service/render smoke over mocked forecast payloads** (the
  compare-row model from a mocked `Forecast`; the chip row + table render; the
  empty state), **not** a DB smoke.
- **Out of scope (see the spec's Exclusions):** pinning more than 3 cities,
  reordering chips, or saving comparison sets (the cap is exactly 3); persisting
  pins / the toggle / the active column across reloads (in-memory only, ADR-0003,
  BC-PRIVACY-03); comparing days other than the upcoming Saturday and Sunday (no
  7-day side-by-side, no historical/climate comparison); metrics beyond hi/lo,
  precipitation, and comfort (no wind / UV / sunrise-sunset / hourly columns —
  those stay in `forecast`); computing comfort or fetching/caching forecasts inside
  this capability beyond reusing the route + the pure scorer; selecting/searching
  cities from scratch (owned by `city-search` / `map` — this pins already-resolved
  locations); exporting / printing / sharing the comparison (no shareable
  comparison URL); browser-rendered evidence (videos, live axe, vision) — env-gated
  per ADR-0004; rendering is covered by jsdom tests; the smoke is a service/render
  smoke. All intentionally excluded so testers do not report them as defects.
