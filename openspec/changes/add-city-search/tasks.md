## 1. Setup (i18n `search.*` namespace)

> No database, no migrations, no auth, no email (ADR-0003). No new deps — `zod`,
> `next`, and `react` are installed. Reuse the LOCKED app-shell conventions:
> `lib/i18n` namespaces + `t()`, the `LocationProvider`/`useLocation()` active-
> location state, the shared `components/ui/Notice.tsx`, the SearchHero search
> slot. This slice introduces NO new color, so nothing for NFR-A11Y-02 here (the
> active-option highlight reuses an existing AA-verified palette token).

- [ ] 1.1 Add a `search` namespace to `lib/i18n/uk.ts` (sibling to `shell.*` —
  never edit `shell.*`), with calm Ukrainian copy, **no exclamation marks**
  (BC-BRAND-01, D8, NFR-I18N-01): `search.label` (input/combobox accessible name +
  visible label), `search.placeholder`, `search.listLabel` (listbox accessible
  name), `search.loading` (a quiet busy label), `search.empty` = the exact literal
  **"Нічого не знайдено"** (FR-SEARCH-05 shipped Ukrainian literal), `search.failed`
  (the search-failed Notice copy), `search.geolocate` ("Use my location" button
  label), `search.geolocationDenied`, `search.geolocationUnavailable`, and (if
  reverse-geocode is used for the name) a coordinate-fallback name key.
- [ ] 1.2 Mirror the same `search.*` keys in `lib/i18n/en.ts` (strict fallback
  subset, identical key shape); `search.empty` = "Nothing found" (the English
  fallback for the FR-SEARCH-05 literal). Same calm tone, no exclamation marks
  (D8, NFR-I18N-01).
- [ ] 1.3 Note in a code comment (D8) that the inert `shell.search.*` slot copy
  (`label`/`placeholder`/`hint`) is now SUPERSEDED by `search.*` (it described the
  stub slot; the real input owns its copy). Leave `shell.search.*` in place
  (removing it is a `shell.*` edit, §3a) but do NOT consume it from `SearchBox`.

## 2. Pure domain logic (`lib/search` — framework-free, TC-PURE-01)

> No `next/*`, no `react`, no DOM globals — 100% unit-testable, total (never
> throws to the UI). Colocated `*.test.ts` with `@trace` ids. Write the section 5
> unit tests FIRST and confirm they FAIL (red) before implementing (test-first per
> AGENTS.md). Mirror the locked `lib/location/validation.ts` `safeParse`
> discipline.

- [ ] 2.1 `lib/search/types.ts` (D2) — `GeoSuggestion = { id: string; name: string;
  admin1?: string; country?: string; countryCode?: string; lat: number; lon:
  number }`, plus the route handler's response contract `GeocodeResult` (success/
  empty `{ suggestions: GeoSuggestion[] }` and a typed error shape, e.g.
  `{ error: "failed" }`). This is the single source of truth for the internal
  contract crossing the Server↔Client boundary.
- [ ] 2.2 `lib/search/validation.ts` (D2, FR-SEARCH-01/02) — a **zod schema for the
  Open-Meteo geocoding response** matching the spec's pinned payload contract
  (`{ results?: Array<{ name: string; latitude: number; longitude: number;
  country?: string; country_code?: string; admin1?: string; id?: number }> }`),
  plus a **total mapper** `parseGeocoding(body: unknown): GeoSuggestion[]` that
  `.safeParse`s the body and projects each result to `GeoSuggestion`
  (`latitude`→`lat`, `longitude`→`lon`, `country_code`→`countryCode`), using the
  Open-Meteo `id` when present else a deterministic synthetic key. TOTAL: a
  malformed / partial / non-object body, or a body whose shape fails the schema,
  returns `[]` and NEVER throws; an absent or empty `results` returns `[]` (valid
  zero results, not a failure). (If the handler needs to distinguish "malformed"
  from "empty" to choose the error vs empty branch, expose that as a small typed
  result rather than throwing.)
- [ ] 2.3 `lib/search/flag.ts` (D2, FR-SEARCH-02 optional flag) — a pure
  `flagEmoji(countryCode?: string): string | null` mapping a valid ISO-3166
  **alpha-2** code (two ASCII letters) to its flag via the Unicode regional-
  indicator offset (`A`→U+1F1E6). TOTAL: an absent, empty, non-two-letter, or
  non-alphabetic code returns `null` so the UI omits the flag with no broken glyph
  or placeholder box.

## 3. Server (`app/api/geocode` Route Handler — fetch + zod + typed result)

> Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
> + `06-fetching-data.md` BEFORE writing. This is the ONLY place the Open-Meteo
> URL/shape and the server `fetch` live (TC-DATA-01). Keyless (TC-STACK-03,
> NFR-COST-01). Honest under failure (NFR-OBS-01): never a raw 500.

- [ ] 3.1 `app/api/geocode/route.ts` (D1, TC-DATA-01) — export an async
  `GET(request: Request)`. Read `q` from the request URL's search params; normalise
  it (trim, hard-cap 120 chars as defence in depth). The handler is NOT cached
  (Next 16 default; do NOT set `dynamic = 'force-static'`).
- [ ] 3.2 Keyless server-side fetch (D1, TC-STACK-03, NFR-COST-01): for a non-empty
  `q`, `fetch` `https://geocoding-api.open-meteo.com/v1/search?name=<encoded q>&count=<N>&language=uk&format=json`
  (no API key, no auth header). The Open-Meteo URL/params live ONLY here.
- [ ] 3.3 Parse + map (D1/D2): parse the upstream body with `lib/search`
  (`parseGeocoding`) and return `Response.json({ suggestions } satisfies
  GeocodeResult)`. The client receives only the minimal `GeoSuggestion[]`, never
  the raw Open-Meteo shape.
- [ ] 3.4 Honest degradation — never a raw 500 (D1/D4, NFR-OBS-01): wrap the body so
  no exception escapes. An empty/whitespace/missing `q` → `{ suggestions: [] }` with
  200 (client treats empty like "no query"). A **non-OK** Open-Meteo status, a
  **thrown** fetch (network), or a **zod-failed** 200 body → a typed error result
  the client maps to the calm error Notice (choose a status so the client `fetch`
  RESOLVES and reads the body — never an unhandled rejection, never partial data).
  Document in a comment why a route handler is used over a client-direct fetch (D1).

## 4. UI (`SearchBox` client component + fill the SearchHero slot)

> `"use client"` — the ONLY place React/`fetch`/`setTimeout`/`navigator.geolocation`/
> keyboard concerns live. Reuse `useLocation()` (setter only), `components/ui/Notice.tsx`,
> the `Input`/`Button` primitives, and the SearchHero slot. Do NOT edit `app/page.tsx`
> beyond the slot file (§3a). All copy from `lib/i18n` `search.*` (no `!`).

- [ ] 4.1 `components/search/SearchBox.tsx` (`"use client"`, D3) — a single text
  input filling the SearchHero search slot; consumes `useLocation()` for
  `setLocation` only (does NOT re-parse the URL — the locked LocationProvider owns
  that). Accessible name + visible label from `search.label`, placeholder from
  `search.placeholder`.
- [ ] 4.2 Debounce + bounded input (D3, FR-SEARCH-01): each keystroke resets a
  300 ms timer; the request to **`/api/geocode?q=`** (the internal route, NEVER
  Open-Meteo directly) fires only after ≥ 300 ms idle. An empty/whitespace-only
  value fires NO request and dismisses the list. Hard-cap the query at 120 chars
  before the request (only the truncated value is sent). Odd characters
  (punctuation/emoji/"50,45") are sent as URL-encoded search text, never as
  coordinates/markup.
- [ ] 4.3 Latest-wins (D3, spec "Latest-wins"): guard overlapping requests with an
  `AbortController` (abort the previous in-flight request) AND a monotonically
  increasing request-id captured per request; apply a response ONLY if its id is
  still the latest issued. A superseded earlier response, or any response that
  resolves after the input was cleared, is DISCARDED and never replaces the newer
  query's suggestions / empty state / error.
- [ ] 4.4 Suggestion list + content (D5, FR-SEARCH-02): render results as a single
  `role="listbox"` (accessible name `search.listLabel`); each suggestion is a
  `role="option"` with a stable `id` showing city name, admin region (`admin1`),
  country, and the optional `flagEmoji(countryCode)` (omitted with no broken glyph
  when null, and the row shows no empty separator when region/country is absent).
- [ ] 4.5 Selection writes the URL via the locked provider (D3, FR-SEARCH-03):
  clicking a suggestion (or selecting the active descendant) calls
  `setLocation({ lat, lon, name })` from `useLocation()` — the LocationProvider
  syncs `?lat=&lon=&name=` (this slice does NOT write the URL itself). On selection
  the list is dismissed.
- [ ] 4.6 Enter on a lone suggestion (D3, FR-SEARCH-04): pressing Enter with exactly
  ONE suggestion and NO active descendant auto-selects it (same active-location +
  URL behavior as a click); Enter with two+ suggestions and no active descendant
  does NOT guess (location unchanged).
- [ ] 4.7 Zero results inline (D4, FR-SEARCH-05): when the response is
  `{ suggestions: [] }` for a NON-empty query, render `<Notice variant="empty">`
  with the literal **"Нічого не знайдено"** (from `search.empty`) IN PLACE OF the
  list — NEVER a toast, never treated as a failure; the input stays focused and
  editable.
- [ ] 4.8 Failure inline (D4, NFR-OBS-01): a network error, a non-OK handler
  response, or a typed-error result renders `<Notice variant="error">` (Ukrainian,
  from `search.failed`, no `!`) with the input still editable to retry — never a
  toast, never an uncaught exception, never a 500 surfaced to the visitor. Do NOT
  console.log caught errors (render the Notice instead); clean up the debounce
  timer and abort the in-flight request on unmount (no "update on unmounted
  component"); keep the console silent on a healthy session.
- [ ] 4.9 Accessible combobox/listbox keyboard (D5, NFR-A11Y-01): the input is
  `role="combobox"` with an accessible name, `aria-expanded` reflecting open/closed
  and `aria-controls` referencing the listbox. Arrow Down/Up move a single active
  descendant — exactly one option is the `aria-activedescendant` on the input and
  carries `aria-selected="true"`; focus STAYS in the input. Enter on the active
  descendant selects it; Escape closes the list and clears the active descendant.
  Tab moves focus PAST the combobox to the "Use my location" button (NOT through
  options). The active-option highlight reuses an existing AA palette token (no new
  color).
- [ ] 4.10 Opt-in "Use my location" (D6, FR-SEARCH-06, BC-PRIVACY-02): a button
  (accessible name `search.geolocate`, visible focus from the `Button` primitive)
  whose CLICK HANDLER is the ONLY place `navigator.geolocation.getCurrentPosition`
  is called — NEVER in an effect, on mount, or on load. On success set the active
  location from the coordinates via `setLocation` (name derived from coordinates,
  optionally reverse-geocoded through the SAME route handler — no Open-Meteo URL on
  the client). On denial / unavailable API / position error show a calm inline
  `<Notice variant="error">` (Ukrainian, from `search.geolocationDenied` /
  `search.geolocationUnavailable`, no `!`); location unchanged; never a toast or
  crash.
- [ ] 4.11 Fill the SearchHero slot (D7, §3a): in `components/shell/SearchHero.tsx`
  REPLACE the inert `<div role="search" data-slot="search" …>` stub (the `readOnly
  disabled` `<Input>` + hint) with the real `<SearchBox/>`, preserving the centered
  `mx-auto w-full max-w-md` focal column, the `role="search"` landmark, and the hero
  title/subtitle. This is the shell's OWN slot file — do NOT edit `app/page.tsx`.

## 5. Tests (Vitest only — unit + jsdom component + route-handler integration; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–4 to
> green. Every test file carries `@trace` ids. Never weaken a test to pass it; if a
> test contradicts the spec, change it deliberately. Use fake timers
> (`vi.useFakeTimers()`) for the debounce and a mocked `fetch`/`navigator.geolocation`
> for the network/geolocation; do NOT hit the real Open-Meteo (keyless, but tests
> are deterministic and offline).

- [ ] 5.1 Unit `lib/search/validation.test.ts` (FR-SEARCH-01/02, D2): feed a
  **real-ish** Open-Meteo geocoding payload (e.g. a "Київ" result with `name`,
  `latitude`, `longitude`, `country`, `country_code`, `admin1`) and assert
  `parseGeocoding` returns the mapped `GeoSuggestion[]` (correct `lat`/`lon`/
  `countryCode`, dropped extra fields, stable `id`). Then feed **malformed** bodies
  (`results` is a string; a result missing `latitude`; a non-object; `null`) and an
  **empty/absent** `results`, and assert each returns `[]` (or the typed
  malformed/empty distinction) and NEVER throws. `@trace FR-SEARCH-01, FR-SEARCH-02`.
- [ ] 5.2 Unit `lib/search/flag.test.ts` (FR-SEARCH-02, D2): assert `flagEmoji` maps
  a valid alpha-2 code (e.g. "UA") to the expected regional-indicator flag, is
  case-insensitive, and returns `null` for absent / empty / one-letter / three-letter
  / non-alphabetic codes (no broken glyph). `@trace FR-SEARCH-02`.
- [ ] 5.3 (OPTIONAL) Unit for any extracted debounce/latest-wins helper: if the
  debounce or request-id/latest-wins logic is extracted into a pure helper, unit-test
  it directly (coalesce within window → one call; a superseded id is discarded).
  If it stays inline in `SearchBox`, cover it via the jsdom tests (5.5/5.6) instead
  and note that here. `@trace FR-SEARCH-01`.
- [ ] 5.4 Integration `app/api/geocode/route.test.ts` (TC-DATA-01, NFR-OBS-01, D1):
  with `global.fetch` MOCKED, call the route's `GET` with `?q=Київ` and a mocked
  real-ish Open-Meteo body → assert it returns `{ suggestions: [...] }` (typed,
  minimal). Mock an **empty** `results` → assert `{ suggestions: [] }` with 200.
  Mock a **non-OK** upstream and a **thrown** fetch and a **zod-failed** 200 body →
  assert each returns the typed error result (NOT a raw 500, NOT partial data) and
  the client-readable status. Assert an empty/missing `q` → `{ suggestions: [] }`
  without calling Open-Meteo. `@trace TC-DATA-01, NFR-OBS-01`.
- [ ] 5.5 jsdom `components/search/SearchBox.test.tsx` — debounce + suggestions +
  selection (FR-SEARCH-01/02/03/04, D3/D5): with fake timers and a mocked `fetch`
  returning a suggestion list, type a city, assert exactly ONE request fires after
  300 ms idle (not per keystroke), and the suggestions render as `role="option"`
  rows with name/region/country (and a flag when the code is present). Click a
  suggestion → assert `setLocation` is called with the right `{lat,lon,name}`
  (mock/spy `useLocation`) and the list dismisses. With exactly one suggestion,
  press Enter → assert it auto-selects; with two+ and no active descendant, press
  Enter → assert NO selection. `@trace FR-SEARCH-01, FR-SEARCH-02, FR-SEARCH-03,
  FR-SEARCH-04`.
- [ ] 5.6 jsdom empty-state + latest-wins + failure (FR-SEARCH-05, NFR-OBS-01,
  D3/D4): a mocked response with empty `suggestions` for a non-empty query → assert
  the inline literal **"Нічого не знайдено"** renders IN PLACE OF the list and NO
  toast, input stays editable. Resolve an earlier request AFTER a newer one → assert
  the newer query's suggestions stand (latest-wins); resolve a request AFTER the
  input was cleared → assert the list stays dismissed. A mocked network error / typed
  error → assert the calm error Notice renders (no toast, no uncaught exception) and
  the console stays clean. `@trace FR-SEARCH-05, NFR-OBS-01`.
- [ ] 5.7 jsdom combobox a11y (NFR-A11Y-01, D5): assert the input has `role="combobox"`,
  an accessible name, `aria-expanded` and `aria-controls`; the list has
  `role="listbox"` with an accessible name and options have `role="option"`. Arrow
  Down sets exactly one `aria-activedescendant`/`aria-selected="true"` with focus
  staying in the input; Enter on the active descendant selects it and clears it;
  Escape closes the list; Tab moves focus to the "Use my location" button (not an
  option). `@trace NFR-A11Y-01`.
- [ ] 5.8 jsdom geolocation opt-in (FR-SEARCH-06, BC-PRIVACY-02, D6): mock
  `navigator.geolocation`. Assert it is NOT called on render/idle (no call on page
  load). After clicking "Use my location" with a granted position → assert
  `setLocation` is called from the coordinates. With permission DENIED (and with the
  API absent) → assert a calm inline Notice (Ukrainian, no `!`) renders, location
  unchanged, no toast. `@trace FR-SEARCH-06, BC-PRIVACY-02`.
- [ ] 5.9 jsdom oversized/odd input (spec bounded-input): paste a 5,000-char string,
  advance past 300 ms → assert at most ONE request and the sent `q` is truncated to
  120 chars and the input stays editable; type "50,45" + an emoji → assert it is
  sent as encoded search text (one request), not interpreted as coordinates/markup.
  `@trace FR-SEARCH-01`.
- [ ] 5.10 EVAL `evals/cases/search-empty-and-geolocation.eval.ts` (FR-SEARCH-05,
  FR-SEARCH-06, NFR-OBS-01, BC-BRAND-01): browser-free cases whose `produce()`
  imports the pure `lib/i18n` dictionary and returns the user-visible copy — one for
  the zero-results message (`search.empty`) and one for the geolocation-denied /
  unavailable messages (`search.geolocationDenied`/`search.geolocationUnavailable`).
  Rubric (mark gating lines `CRITICAL:`): natural fluent Ukrainian; no exclamation
  marks; the empty-state reads as a calm "nothing matched, try another spelling"
  (not an error/dead-end); the geolocation copy is calm, blame-free, explains
  location is unavailable and the search still works, suggests typing a city instead;
  concise, no ALL-CAPS / jargon. Group by `dimension` (e.g. `empty-state-clarity`,
  `error-clarity`), mirror `@trace`. Fail loudly if any key resolves blank. Target
  every dimension ≥ 90. `@trace FR-SEARCH-05, FR-SEARCH-06, NFR-OBS-01, BC-BRAND-01`.

## 6. Validation, docs, and archive prep

- [ ] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red), then
  implement sections 1–4 to green (test-first per AGENTS.md). Never weaken a test to
  pass it; if a test contradicts the spec, change it deliberately, not silently.
- [ ] 6.2 Run `npm run lint` — zero errors/warnings (incl. the import-boundary check:
  `lib/search` has no `next/*`/`react`/DOM imports, TC-PURE-01; no inline UI literals,
  NFR-I18N-01).
- [ ] 6.3 Run `npm run test:run` — all unit + jsdom component + route-handler
  integration tests green.
- [ ] 6.4 Run `npm run build` — production build succeeds; console clean. Confirm
  the `app/api/geocode` route compiles as a Route Handler and the client bundle
  carries NO `geocoding-api.open-meteo.com` reference and no key (TC-DATA-01,
  NFR-COST-01).
- [ ] 6.5 Run `node scripts/check-eval-ratchet.mjs` (the graded-quality bar) — the
  new search eval dimensions are ≥ 90 and the committed score does not drop.
- [ ] 6.6 Run `npx openspec validate add-city-search --strict` — zero errors/warnings
  ("Change 'add-city-search' is valid").
- [ ] 6.7 Run `npx openspec validate --all --strict` — all specs + changes pass.
- [ ] 6.8 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-city-search` implemented/validated/archived, and record the conventions for
  downstream reuse: the `search.*` i18n namespace (and that `shell.search.*` is now
  superseded); the **`app/api/geocode` Route Handler** data path (geocoding goes
  server-side, keyless, zod-parsed, typed-result — the pattern `add-forecast` will
  reuse, TC-DATA-01); `lib/search/{validation,flag,types}.ts` as the pure geocoding
  layer (`parseGeocoding` total, `flagEmoji`, `GeoSuggestion`); `components/search/SearchBox.tsx`
  as the combobox/geolocation widget filling the SearchHero slot; plus the exact next
  step (Wave 3: `add-forecast` + `add-map`, both consuming the active location this
  slice writes).
- [ ] 6.9 SERVICE/INTEGRATION smoke over MOCKED geocoding (NOT a DB smoke — there is
  no DB, ADR-0003), step by step: (a) with `global.fetch` mocked to a real-ish
  Open-Meteo body, call the `app/api/geocode` `GET` with `?q=Київ` and assert it
  returns typed `{ suggestions: [...] }` (minimal `GeoSuggestion[]`, no raw
  Open-Meteo shape); (b) mock an EMPTY `results` and assert `{ suggestions: [] }`
  (zero results, 200, not an error); (c) mock a non-OK / thrown / zod-failed upstream
  and assert the typed error result (NOT a raw 500); (d) under jsdom with fake timers
  and a mocked `fetch`, render `<SearchBox/>`, type a city, advance 300 ms, and assert
  one request fires and the suggestions render; (e) render with an empty-results mock
  and assert the inline "Нічого не знайдено" Notice (no toast); (f) assert
  `navigator.geolocation` is NOT called on render and the console stays clean. Capture
  the pass output as the smoke evidence.
- [ ] 6.10 GATED on 6.9 passing: `npx openspec archive add-city-search --yes
  --skip-specs` (the baseline `openspec/specs/city-search/spec.md` already holds the
  contract, so the delta is NOT re-applied via Option B). Do not archive before the
  service/integration smoke passes.
