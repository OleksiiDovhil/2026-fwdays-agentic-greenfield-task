## Why

`add-city-search` is the **Wave 2** slice on top of the now-archived
`add-app-shell` foundation (capability plan §4.5, §6). It is the first slice on
the **critical path** (`app-shell → city-search → forecast → animated-bg →
weekend-compare`) and the first to make the app interactive: it fills the inert
**search slot** the shell reserved in `components/shell/SearchHero.tsx`
(`data-slot="search"`, the centered first-load focal point, FR-SHELL-03) with a
real, debounced, keyless city search plus an opt-in "Use my location" control. It
owns FR-SEARCH-01..06.

The slice reuses the shell's LOCKED conventions verbatim and writes no new
cross-cutting machinery: the **active-location state** (`lib/location/*` pure
parse/validate + `components/providers/LocationProvider.tsx`, whose
`useLocation() → {location, setLocation}` syncs `?lat=&lon=&name=` — city-search
**writes** it, downstream reads it), the shared **calm inline error/empty
primitive** `components/ui/Notice.tsx`, and the centralised `lib/i18n` dictionary
with the per-domain namespacing convention (it adds `search.*`, never reaching
into `shell.*`).

The bar is high on the qualities the spec pins. Search is **keyless** Open-Meteo
geocoding (TC-STACK-03, NFR-COST-01) — no API key anywhere, and the Open-Meteo
URL/response shape is kept **server-side** behind a Route Handler so the client
bundle never embeds the upstream contract (TC-DATA-01). Every error path —
network failure, a non-OK response, a malformed payload, zero results, denied or
unavailable geolocation — degrades to a **calm inline Notice** in Ukrainian, never
an error toast, an uncaught exception, or a 500 (NFR-OBS-01); zero results show
the inline literal "Нічого не знайдено" (FR-SEARCH-05). Geolocation is read **only
on an explicit click**, never on page load (FR-SEARCH-06, BC-PRIVACY-02). The
combobox is fully **keyboard-operable** (arrow keys move a single
`aria-activedescendant`, Enter selects, Escape closes; Tab steps **past** the list,
not through options) with `combobox`/`listbox`/`option` roles and accessible names
(NFR-A11Y-01). All copy is Ukrainian-first with an English fallback, calm, with
**no exclamation marks** (NFR-I18N-01, BC-BRAND-01).

## What Changes

- **Server-side geocoding Route Handler (`app/api/geocode/route.ts`, TC-DATA-01):**
  a Next 16 App Router `GET` handler (read `node_modules/next/dist/docs/01-app/
  01-getting-started/15-route-handlers.md` first) that takes `?q=`, performs the
  **keyless server-side fetch** to
  `https://geocoding-api.open-meteo.com/v1/search?name=&count=&language=uk&format=json`,
  **parses the upstream body with zod** via the pure `lib/search` validator, and
  returns a **typed, minimal** suggestion list (`{ suggestions: GeoSuggestion[] }`).
  The client never sees the Open-Meteo URL or response shape — only this stable
  internal contract. The handler is **honest under failure** (NFR-OBS-01): a
  missing/empty/oversized `q`, a non-OK upstream, a network error, or a body that
  fails the zod schema all return a **typed empty/again result with an OK status**
  (or a small typed error body), never a raw 500 and never partial data. Route
  Handlers are not cached by default (Next 16), which is what we want for a
  per-query lookup.
- **Pure framework-free `lib/search/` (TC-PURE-01):** `validation.ts` holds the
  **zod schema for the Open-Meteo geocoding response** (`{ results?: Array<{ name:
  string; latitude: number; longitude: number; country?: string; country_code?:
  string; admin1?: string; id?: number }> }`) plus a **mapper** to a minimal
  `GeoSuggestion = { id, name, admin1?, country?, countryCode?, lat, lon }`. It is
  **total**: a malformed or empty payload maps to an **empty list, never throws**
  (mirrors the locked `lib/location/validation.ts` `safeParse` discipline). An
  optional pure `flagEmoji(countryCode)` derives a flag from an ISO-3166 alpha-2
  code via regional-indicator codepoints and returns `null` for an absent or
  malformed code (FR-SEARCH-02 optional flag, degrades with no broken glyph). No
  `next/*`, no `react`, no DOM — colocated `*.test.ts`.
- **Client `SearchBox` filling the SearchHero slot (`components/search/SearchBox.tsx`,
  `"use client"`):** a single text input that **debounces (~300 ms)** a query to the
  **internal** `/api/geocode?q=` (never Open-Meteo directly), hard-caps the query at
  **120 characters**, and renders the returned places as a suggestion list (city
  name, admin region, country, optional flag — FR-SEARCH-02). It honours
  **latest-wins** (a superseded in-flight request never overwrites a newer query's
  result, via `AbortController` + a request-id guard). Selecting a suggestion calls
  `setLocation({lat, lon, name})` from `useLocation()`, which the LocationProvider
  syncs into `?lat=&lon=&name=` (FR-SEARCH-03). Pressing **Enter with exactly one
  suggestion** auto-selects it (FR-SEARCH-04); Enter with several and no active
  descendant does not guess. **Zero results** render an inline
  `<Notice variant="empty">` "Нічого не знайдено" (FR-SEARCH-05), and every failure
  renders an inline `<Notice variant="error">` — never a toast or 500. The combobox
  is keyboard-accessible (arrow/enter/escape, `combobox`/`listbox`/`option` roles,
  `aria-activedescendant`/`aria-selected`, accessible names — NFR-A11Y-01).
- **Opt-in "Use my location" (FR-SEARCH-06, BC-PRIVACY-02):** a button that reads
  `navigator.geolocation` **only on explicit click** (never on load, never in an
  effect). On success it sets the active location from the returned coordinates
  (name derived from the coordinates, or optionally reverse-geocoded via the same
  route handler) and updates the URL as for a selection. On **denial or
  unavailability** it shows a calm inline `<Notice>` message, never a crash. The
  geolocation API is never touched until the click handler runs.
- **i18n — a `search.*` namespace:** add `search.*` to `lib/i18n/uk.ts` + `en.ts`
  (sibling to `shell.*`, never reaching into it): input label/placeholder, the
  zero-results literal "Нічого не знайдено", the "Use my location" button label,
  the geolocation-denied / geolocation-unavailable messages, the search-failed
  message, and loading / listbox aria labels. Calm tone, **no exclamation marks**
  (BC-BRAND-01, enforced by the existing i18n test across both locales). The slice
  does **not** edit other namespaces; the inert `shell.search.*` slot copy is left
  in place (removing it is a `shell.*` edit, §3a) and the real input owns its copy
  via `search.*`.

## Capabilities

### New Capabilities

- `city-search`: a debounced, keyless, Ukrainian-first city search plus an opt-in
  "Use my location" control that sets the app's active location — the server-side
  geocoding **Route Handler** (`app/api/geocode/route.ts`) keeping the Open-Meteo
  URL/shape off the client and degrading honestly, the pure framework-free
  `lib/search` zod parse + `GeoSuggestion` mapper + `flagEmoji` (total, malformed →
  empty list, never throws), and the client `SearchBox` (300 ms debounce, 120-char
  cap, latest-wins, suggestion list with name/region/country/flag, click + lone-Enter
  selection writing `?lat=&lon=&name=`, zero-results inline "Нічого не знайдено",
  explicit-click-only geolocation with a calm denial/unavailable Notice, and the
  WAI-ARIA combobox/listbox keyboard interaction).

### Modified Capabilities

<!-- None. This change introduces the city-search capability; no existing spec
changes. The app-shell spec is untouched: this slice only fills the SearchHero
search slot (a slot the shell shipped for exactly this purpose), consumes the
shell's locked LocationProvider/useLocation + Notice + i18n conventions, and adds
a sibling search.* i18n namespace — it does not edit shell.* copy semantics or
app/page.tsx (§3a). The inert shell.search.* slot copy is superseded but left in
place. -->

## Impact

- **Specs:** the baseline `openspec/specs/city-search/spec.md` already exists
  (adopted at G2, 11 requirements). The delta under `specs/city-search/spec.md`
  restates that contract as `## ADDED Requirements` for the record and for
  `openspec validate add-city-search --strict`; archive runs with `--skip-specs`
  because the baseline already holds it (OpenSpec Option B is not re-applied).
- **Code (new):** `app/api/geocode/route.ts` (the server-side geocoding handler);
  `lib/search/validation.ts` (zod schema + `GeoSuggestion` mapper) and
  `lib/search/flag.ts` (`flagEmoji`), framework-free, with colocated
  `lib/search/*.test.ts`; `lib/search/types.ts` for `GeoSuggestion` and the
  handler's response type; `components/search/SearchBox.tsx` (the client widget)
  with a colocated jsdom test `components/search/SearchBox.test.tsx`; an
  integration test for the route handler over a mocked Open-Meteo response; and
  browser-free eval cases `evals/cases/search-empty-and-geolocation.eval.ts`
  grading the zero-results and geolocation-denied copy.
- **Code (extended):** `components/shell/SearchHero.tsx` — the inert search slot
  (the `readOnly disabled` `<Input>` stub) is replaced with the real `<SearchBox/>`
  (filling the slot the shell reserved; the shell's own slot file, **not** an
  `app/page.tsx` edit, §3a). `lib/i18n/uk.ts` + `lib/i18n/en.ts` gain a `search.*`
  namespace (sibling to `shell.*`; the inert `shell.search.*` slot copy is
  superseded but left in place).
- **Dependencies:** none added — `zod` is already installed and `next`/`react`
  ship the Route Handler + client primitives. **No database, no auth, no email**
  (ADR-0003); the only external call is the **keyless** Open-Meteo geocoding GET
  from the server, **zero paid keys** (NFR-COST-01, TC-STACK-03). **No Playwright**
  (TC-STACK-05); verification is **Vitest** only — pure unit tests for the zod
  parse/mapper/flag, a jsdom component test for `SearchBox`, and an integration
  test for the route handler over a mocked fetch. The per-slice "smoke" is a
  **service/integration smoke over MOCKED geocoding responses** (route handler →
  typed suggestions; empty payload → empty; `SearchBox` renders + empty-state),
  **not** a DB smoke.
- **Out of scope (see the spec's Exclusions):** reverse-geocoding a map click into
  a place (owned by `map`, FR-MAP-03); fetching or rendering any forecast for the
  selected location (owned by `forecast`, FR-FORECAST-*; this slice only **sets**
  the active location); persisting search history, recents, or favorites (no
  database, no cookies — BC-PRIVACY-03); pinning or comparing multiple cities
  (owned by `weekend-compare`, FR-COMPARE-*); localisation of place names beyond
  what Open-Meteo returns or of UI strings beyond Ukrainian + English labels
  (NFR-I18N-01) — all intentionally excluded so testers do not report them as
  defects.
