## Context

`add-city-search` is the **Wave 2** slice (capability plan §4.5, §6) off the
archived `add-app-shell` foundation, and the first slice on the **critical path**
(`app-shell → city-search → forecast → animated-bg → weekend-compare`). The shell
already shipped the file this slice fills: `components/shell/SearchHero.tsx`
renders an **inert centered search slot** (`data-slot="search"`, a `readOnly
disabled` `<Input>` stub explicitly "the city-search slice fills it later"). This
slice replaces that stub with a real `SearchBox` and adds a sibling `search.*`
i18n namespace — it touches no other shell file and does **not** edit the shared
`app/page.tsx` serialize point (§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email**. The only external dependency is **keyless** Open-Meteo geocoding
(TC-STACK-03, NFR-COST-01) — no API key anywhere in the repo or the bundle. Tests
are **Vitest** only — pure unit tests, a jsdom component test, and a route-handler
integration test over a **mocked** `fetch` — **no Playwright** (TC-STACK-05,
ADR-0004). The per-slice "smoke" is a **service/integration smoke over MOCKED
geocoding responses**, not a DB smoke. Because this is the first interactive,
network-touching slice, the Next.js 16 App Router **Route Handler** boundary and
the Server↔Client data path apply: read `node_modules/next/dist/docs/01-app/
01-getting-started/15-route-handlers.md` and `06-fetching-data.md` before writing
any handler/client-fetch code.

The locked conventions reused **verbatim**, not re-built:

- **Active-location state** — `lib/location/{types,validation,url}.ts` (pure,
  total, `Location = {lat, lon, name}`, dot-decimal only, malformed → `null`) and
  `components/providers/LocationProvider.tsx`, whose `useLocation() →
  {location, setLocation}` syncs `?lat=&lon=&name=` via `router.replace`.
  City-search **writes** the location (`setLocation(...)`); downstream
  forecast/map/animated-bg/weekend-compare read it. This slice does **not**
  re-parse the URL and does **not** add a second URL-sync path.
- **Shared inline error/empty primitive** — `components/ui/Notice.tsx`
  (`error` → `role="alert"`; `empty`/`info` → `role="status"`; calm i18n copy; no
  exclamation marks). Every search/geolocation failure and the zero-results state
  render a `<Notice>`, never a toast or 500.
- **i18n** — the `t("namespace.key")` dotted accessor (UK default → EN fallback →
  ""); add a `search.*` namespace to `uk.ts` + `en.ts`, never reaching into
  `shell.*`. No runtime i18n library (NFR-I18N-01).
- **UI primitives** — `components/ui/{Input,Button}.tsx` (cva + `cn()`); palette
  tokens already AA-verified. This slice introduces **no new color**, so
  NFR-A11Y-02 (contrast) has nothing new to verify beyond reusing the existing
  tokens for the suggestion list / highlight (verify the active-option highlight
  uses an existing AA token).

## Goals / Non-Goals

**Goals:**

- Fill the SearchHero search slot with a debounced (300 ms), keyless,
  Ukrainian-first city search whose suggestion list shows name/region/country and
  an optional flag, and whose selection sets the active location and writes
  `?lat=&lon=&name=` (FR-SEARCH-01, 02, 03).
- Keep the **Open-Meteo URL and response shape server-side** behind a Route
  Handler so the client bundle carries only a stable internal contract and no key
  is implied (TC-DATA-01, NFR-COST-01).
- Auto-select the **lone** suggestion on Enter; never guess among several
  (FR-SEARCH-04).
- Show the inline literal "Нічого не знайдено" for zero results, never a toast
  (FR-SEARCH-05).
- Provide an opt-in "Use my location" button that reads geolocation **only on an
  explicit click**, never on load, with a calm denial/unavailable Notice
  (FR-SEARCH-06, BC-PRIVACY-02).
- Degrade **every** error path (network, non-OK, malformed payload, denied
  permission) to a calm inline Notice with a **silent console** on a healthy
  session (NFR-OBS-01); the route handler never returns a raw 500 on bad
  input/upstream.
- Implement the WAI-ARIA **combobox/listbox** keyboard pattern (arrow/enter/escape,
  `aria-activedescendant`/`aria-selected`, Tab steps past the list) with accessible
  names (NFR-A11Y-01).
- Keep the pure layer (`lib/search`) framework-free and 100% unit-testable
  (TC-PURE-01); React/DOM/`fetch`/geolocation concerns live only in the client
  component and the route handler.

**Non-Goals (explicit Exclusions — see the spec):**

- Reverse-geocoding a **map click** into a place — owned by `map` (FR-MAP-03).
- Fetching or rendering any **forecast** for the selection — owned by `forecast`
  (FR-FORECAST-*); this slice only **sets** the active location.
- Persisting **search history / recents / favorites** — no database, no cookies
  (BC-PRIVACY-03).
- **Pinning / comparing** multiple cities — owned by `weekend-compare`
  (FR-COMPARE-*).
- Localising place names beyond what Open-Meteo returns, or UI strings beyond
  Ukrainian + English (NFR-I18N-01).
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom component tests.

## Decisions

### D1 — Data path: a server-side geocoding Route Handler, not a client-direct fetch (TC-DATA-01)

- **`app/api/geocode/route.ts`** is a Next 16 App Router **Route Handler** that
  exports an async `GET(request: Request)`. It reads `?q=` from `request`'s URL,
  performs the **keyless server-side** `fetch` to
  `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=<N>&language=uk&format=json`,
  parses the upstream body with the pure `lib/search` zod schema, maps it to
  `GeoSuggestion[]`, and returns `Response.json({ suggestions })`. The client
  `SearchBox` calls **`/api/geocode?q=<query>`** — the internal, stable contract —
  and never sees the Open-Meteo URL, query params (`count`/`language`/`format`),
  or raw response shape.
- **Why a Route Handler over a client-direct `fetch` to Open-Meteo (the core data
  decision, ADR-worthy):**
  1. **The upstream contract stays server-side (TC-DATA-01).** The Open-Meteo
     endpoint, its query-param shape, and its verbose response schema (and any
     future tuning of `count`/`language`) live in one server file behind a minimal
     internal DTO. The client bundle carries only `GeoSuggestion` and `/api/geocode`
     — swapping or augmenting the geocoder later never touches the client.
  2. **No key implied in the bundle (NFR-COST-01, "keyless" honesty).** Open-Meteo
     geocoding is genuinely keyless, but routing through the server keeps the
     established **"external calls live in `queries.ts`/server, parsed by zod
     before they reach the UI"** convention (AGENTS.md module conventions) and
     leaves a single, auditable place where any header/key would ever be added —
     so a code review can assert zero keys reach the client.
  3. **One honest-degradation choke point (NFR-OBS-01).** zod validation, the
     non-OK-upstream branch, the network-error branch, and the empty-`q` branch all
     resolve in the handler to a **typed result**, so the client receives a uniform
     `{ suggestions }` (or a small typed error) and never has to interpret a raw
     upstream body or a CORS/opaque failure.
  4. **Same-origin, CORS-free, encoding-controlled.** The client hits a same-origin
     route, so there is no cross-origin/CORS surface; the handler does the
     URL-encoding of `q` (and the 120-char cap as defence in depth) deterministically.
- **Trade-off:** a route handler adds one server hop (client → our route →
  Open-Meteo) versus the client calling Open-Meteo directly (one hop). For a
  human-typed, debounced search the extra hop is negligible (Open-Meteo is the slow
  leg either way) and buys the four properties above. A direct client fetch would
  hardcode the Open-Meteo URL/shape into the client bundle, scatter the zod parse
  and error handling into the component, and expose a cross-origin call — all of
  which this design deliberately avoids. Route Handlers are **not cached by default**
  in Next 16, which is correct for a per-query lookup (we do **not** set
  `dynamic = 'force-static'`); a future optimisation could add a short server-side
  cache keyed on the normalised `q`, out of scope here.
- **Handler honest-degradation contract (NFR-OBS-01):** the handler **never throws
  to a 500** on bad input or a bad upstream. Concretely: an empty/whitespace/missing
  `q` → `{ suggestions: [] }` with `200` (the client treats empty like "no query",
  never an error); a **non-OK** Open-Meteo status or a **thrown** fetch (network) →
  a small typed error body the client maps to the calm error Notice (status chosen
  so the client `fetch` resolves and reads it, never an unhandled rejection); a
  **200 body that fails the zod schema** → treated exactly like a failed fetch
  (typed error, never partial data). The whole handler body is wrapped so no
  unexpected throw escapes as a raw 500.

### D2 — Pure framework-free `lib/search`: zod parse + `GeoSuggestion` mapper, total (TC-PURE-01)

- **`lib/search/validation.ts`** holds the **zod schema for the Open-Meteo
  geocoding response** and a **mapper**. The schema mirrors the spec's pinned
  payload contract: `{ results?: Array<{ name: string; latitude: number;
  longitude: number; country?: string; country_code?: string; admin1?: string;
  id?: number }> }`. Following the locked `lib/location/validation.ts` discipline it
  uses `.safeParse` and is **total**: a malformed, partial, or non-object payload, or
  a `200` body whose shape fails the schema, maps to an **empty list** (or a typed
  "invalid" signal the handler turns into an error) and **never throws** to the UI.
  An **absent or empty `results`** is **valid** and means zero results (not a
  failure) — the spec is explicit that empty ≠ error.
- **The mapper** projects each validated result to the minimal
  `GeoSuggestion = { id, name, admin1?, country?, countryCode?, lat, lon }`
  (`latitude`→`lat`, `longitude`→`lon`, `country_code`→`countryCode`), dropping
  every other Open-Meteo field. A result missing a required field (`name`,
  `latitude`, `longitude`) is rejected by the schema (so the whole 200 is treated as
  malformed, per the spec) rather than silently producing a half-suggestion. `id`
  is the Open-Meteo place id when present, else a deterministic synthetic key
  (e.g. `${lat},${lon},${name}`) so React list keys are stable.
- **`lib/search/flag.ts`** — an optional pure `flagEmoji(countryCode?: string):
  string | null` (FR-SEARCH-02 optional flag). It maps a valid ISO-3166 **alpha-2**
  code (two ASCII letters) to its flag by offsetting each letter into the
  Unicode **regional-indicator** range (`A`→U+1F1E6). It is **total**: an absent,
  empty, non-two-letter, or non-alphabetic code returns **`null`**, so the UI omits
  the flag with **no broken glyph or placeholder box** (the spec's "missing flag
  degrades cleanly" scenario). Pure: no `next/*`, no `react`, no DOM.
- **`lib/search/types.ts`** — `GeoSuggestion` and the route handler's response
  type (`GeocodeResult = { suggestions: GeoSuggestion[] }` and a typed error shape),
  shared by the handler and the client so the internal contract is one source of
  truth.
- **Trade-off:** keeping the zod parse + mapper + flag in a framework-free module
  (rather than inline in the route handler or the component) means they are
  **unit-tested deterministically** against a real-ish payload and against
  malformed/empty inputs without spinning up a server or jsdom (TC-PURE-01), and the
  same validator is reused by the handler and any future server caller. The small
  cost is one extra module boundary, which the locked module convention already
  mandates (`validation.ts` parses every external payload).

### D3 — Client `SearchBox`: debounce, latest-wins, suggestions, selection (FR-SEARCH-01..04)

- **`components/search/SearchBox.tsx`** is marked **`"use client"`**: it needs
  `useState`/`useEffect`/`useRef`, `fetch`, `setTimeout` (debounce), `navigator.geolocation`,
  and keyboard handlers — none of which belong in a server component. It fills the
  SearchHero slot (D7) and consumes `useLocation()` for the setter only.
- **Debounce (300 ms, FR-SEARCH-01):** each keystroke resets a 300 ms timer; the
  geocoding request to `/api/geocode?q=` fires only after the input has been **idle
  for ≥ 300 ms**. An **empty or whitespace-only** value fires **no** request and
  dismisses the list. The query is **hard-capped at 120 characters** before the
  request (a `maxLength`-equivalent truncation; only the truncated value is sent) so
  an oversized paste cannot produce an unbounded request (the spec's truncation
  scenario). Odd characters (punctuation, emoji, the locale number "50,45") are sent
  as ordinary URL-encoded search text, never interpreted as coordinates or markup.
- **Latest-wins (the spec's dedicated requirement):** debounced typing can still
  leave more than one request in flight. The component guards with **both** an
  `AbortController` (abort the previous in-flight request when a new one starts)
  **and** a monotonically increasing **request-id** captured per request: when a
  response resolves, it is applied **only if** its id is still the latest issued.
  A superseded earlier response — or any response that resolves **after the input
  was cleared** — is **discarded** and never replaces the newer query's suggestions,
  empty state, or error (the two latest-wins scenarios). The belt-and-braces (abort
  **and** id-guard) covers the case where an aborted request's late
  resolution/rejection still reaches the handler.
- **Selection (FR-SEARCH-03):** clicking a suggestion (or selecting the active
  descendant) calls `setLocation({ lat, lon, name })` from `useLocation()`. The
  LocationProvider's `setLocation` does the URL sync (`?lat=&lon=&name=` via
  `router.replace`) — this slice **does not** write the URL itself, it delegates to
  the locked provider (single URL-sync path). On selection the list is **dismissed**.
  The `name` written is the suggestion's display name; coordinates are the validated
  numeric `lat`/`lon`.
- **Enter on a lone suggestion (FR-SEARCH-04):** pressing Enter when the list holds
  **exactly one** suggestion **and** no option is the active descendant auto-selects
  that sole suggestion (same active-location + URL behavior as a click). Enter with
  **two or more** suggestions and **no** active descendant does **not** guess (no
  selection, location unchanged). When an option **is** the active descendant (the
  visitor used Arrow keys), Enter selects **that** option (D5).
- **Trade-off:** combining `AbortController` with an id-guard is slightly redundant
  (the id-guard alone would discard stale results), but abort also **cancels the
  network work** for a superseded request and the id-guard covers a late
  resolution/rejection that slips past the abort — together they make the
  latest-wins guarantee hold deterministically in the jsdom test (which drives
  resolution order explicitly), which a single mechanism does not.

### D4 — Honest degradation: every error path is a calm inline Notice, never a toast/500 (NFR-OBS-01)

- The component reduces every outcome to one of four **inline** UI states, reusing
  the shared `components/ui/Notice.tsx`: (a) **suggestions** — the listbox; (b)
  **zero results** — `<Notice variant="empty">` with the literal "Нічого не
  знайдено" (FR-SEARCH-05), shown **in place of** the list, input stays focused and
  editable, **never** an error toast and **never** treated as a failure; (c)
  **failure** — `<Notice variant="error">` for a network error, a non-OK handler
  response, or a malformed/zod-failed payload (the handler already collapses these
  to a typed error), with the input still editable to retry; (d) **idle/empty
  query** — no list, no message. There is **no toast** anywhere and **no path** that
  surfaces a raw 500 or an uncaught exception to the visitor.
- The **route handler** (D1) is the first line: a bad `q`, a non-OK upstream, a
  network throw, or a zod failure all resolve there to a typed result, so the
  client's `fetch` always resolves to a readable body and the client branches on the
  typed shape — there is no unhandled rejection and no opaque body to misread.
- **Console silence (NFR-OBS-01):** on a healthy session (successful search,
  selection, successful geolocation) **no** warning or error is emitted. The
  component avoids the usual culprits: it cleans up its debounce timer and aborts the
  in-flight request on unmount (no "state update on unmounted component"); it does
  not log caught errors to the console (it renders the Notice instead); and the
  mount-time render emits no client-only markup that would mismatch hydration (the
  input is server-renderable; suggestions appear only after a user-driven fetch).
- **Trade-off:** reusing the single shared `Notice` (vs a bespoke search-error UI)
  keeps the calm tone, the a11y roles (`alert`/`status`), and the no-exclamation copy
  consistent app-wide and is exactly the "build the inline-error pattern once, reuse
  everywhere" mandate; the cost is that the empty/error copy must read well **in the
  search context**, which the `search.*` overrides (passed as `title`/`description`)
  handle, and which the eval grades.

### D5 — Accessible combobox/listbox keyboard interaction (NFR-A11Y-01)

- The input is a **`role="combobox"`** with an accessible name (`search.label`),
  `aria-expanded` reflecting whether the list is open, and `aria-controls`
  referencing the listbox. The suggestion list is a **single `role="listbox"`**
  element with an accessible name (`search.listLabel`); each suggestion is a
  **`role="option"`** with a stable `id`.
- **Keyboard focus stays in the input.** **Arrow Down / Arrow Up** move a single
  **active descendant**: exactly one option is the highlighted active descendant,
  referenced by **`aria-activedescendant`** on the input and carrying
  **`aria-selected="true"`** (giving the highlight a concrete, testable definition).
  **Enter** while an option is the active descendant selects **that** option (D3
  selection behavior); with no active descendant, Enter follows the lone-suggestion
  rule (D3). **Escape** closes the list and clears the active descendant. **Tab**
  does **not** step through options — it moves focus **past** the combobox to the
  **"Use my location" button** (the next control). The highlight uses an existing
  AA-verified palette token (no new color, NFR-A11Y-02).
- The **"Use my location" button** has an accessible name (`search.geolocate`) and a
  visible focus style (the locked `Button` primitive's focus ring).
- **Trade-off:** the WAI-ARIA **activedescendant** combobox pattern (focus stays in
  the input, options are virtually highlighted) is chosen over a **roving-tabindex**
  pattern (focus physically moves to each option) because the spec pins
  `aria-activedescendant`/`aria-selected` and "Tab moves past, not through" — the
  activedescendant pattern matches that contract exactly and keeps the typed query
  uninterrupted while arrowing; the cost is managing the active-descendant id in
  state by hand (vs the browser moving focus), which the component owns.

### D6 — Opt-in "Use my location": geolocation only on explicit click (FR-SEARCH-06, BC-PRIVACY-02)

- The "Use my location" button's **click handler is the only place**
  `navigator.geolocation.getCurrentPosition(...)` is ever called. It is **not**
  called in an effect, **not** on mount, and **not** on page load — so a fresh load
  triggers **no** geolocation read and **no** permission prompt (the spec's "never
  read on page load" scenario; BC-PRIVACY-02).
- **On success:** the coordinates set the active location via
  `setLocation({ lat, lon, name })` (URL synced by the provider, as for a selection).
  The `name` is derived from the coordinates — the minimal MVP derives a calm label
  from the coordinates (e.g. a localized "Моє місце"/short coordinate label sourced
  from `search.*`), with an **optional** reverse-geocode through the **same route
  handler** to obtain a place name; either way no Open-Meteo URL touches the client.
- **On denial or unavailability:** if permission is **denied**, or the browser
  **does not expose** `navigator.geolocation`, or the position errors, the component
  shows a **calm inline `<Notice variant="error">`** with a Ukrainian message (no
  exclamation marks, from `search.geolocationDenied` / `search.geolocationUnavailable`),
  **never** an error toast and **never** a crash; the active location is **unchanged**.
- **Trade-off:** gating geolocation strictly behind the click (vs a "request on
  focus/load to pre-warm the permission") is a deliberate **privacy** choice mandated
  by BC-PRIVACY-02 — the small UX cost (one extra click, no pre-warmed prompt) is
  the point: the visitor is never surprised by a permission dialog. Deriving the name
  from coordinates (with reverse-geocode optional) keeps the slice's scope to "set
  the active location" and avoids coupling to a second always-on network call.

### D7 — Fill the SearchHero search slot (§3a, not an app/page.tsx edit)

- Replace the inert stub in `components/shell/SearchHero.tsx` (the `<div
  role="search" data-slot="search" …>` wrapping the `readOnly disabled` `<Input>`
  and the hint) with the real **`<SearchBox/>`**, preserving the surrounding hero
  layout (the centered `mx-auto w-full max-w-md` focal column, the `role="search"`
  landmark, the hero title/subtitle). This is the shell's **own** slot file, shipped
  for exactly this purpose — **not** an edit to the shared `app/page.tsx` serialize
  point (§3a). `SearchBox` renders the input (now interactive), the suggestion
  listbox, the "Use my location" button, and the inline Notice states within that
  centered column.
- **Trade-off:** editing `SearchHero.tsx` (vs a brand-new top-level slot) is the
  intended design — the shell created the inert slot specifically so this slice fills
  it; `SearchHero` is not a multi-slice serialize point the way `app/page.tsx` is, so
  a one-file swap is correct and minimizes churn.

### D8 — i18n: a `search.*` namespace; supersede the inert `shell.search.*` slot copy

- Add a **`search.*`** namespace to `lib/i18n/uk.ts` + `en.ts` (sibling to
  `shell.*`, never reaching into it) carrying every user-visible string: `label`
  (input/combobox accessible name + visible label), `placeholder`, `listLabel`
  (listbox accessible name), `loading` (a quiet busy label), `empty` (the literal
  **"Нічого не знайдено"** zero-results message), `failed` (the search-failed Notice
  copy), `geolocate` (the "Use my location" button label), `geolocationDenied`,
  `geolocationUnavailable`, and (if reverse-geocode is used) a coordinate fallback
  name. Calm tone, **no exclamation marks** (BC-BRAND-01, enforced by the existing
  `lib/i18n/i18n.test.ts` sweep across both locales).
- The shell shipped inert placeholder copy under **`shell.search.*`** (`label:
  "Пошук міста"`, `placeholder: "Введіть назву міста"`, `hint`). Those described the
  **stub** slot; the real input owns its copy via **`search.*`**. We **leave the
  `shell.search.*` keys in place** (removing them is a `shell.*` edit, §3a, and risks
  the typed-key surface other code/tests assert) but they become **unused** by the
  live search. (A reviewer may prune the now-dead `shell.search.*` in a follow-up;
  out of scope here to keep the shell serialize point untouched.)
- **FR-SEARCH-05 literal:** the **shipped** zero-results literal is the Ukrainian
  **"Нічого не знайдено"** (the product is Ukrainian-first); the English "Nothing
  found" is the `en.ts` fallback. This deliberate override of the FR's English quote
  is already logged in `docs/requirements-clarifications.md` and asserted by the
  baseline spec — the test asserts the exact Ukrainian literal renders.
- **Trade-off:** owning a fresh `search.*` namespace (vs reusing `shell.search.*`)
  keeps the slice's copy in its own domain per the locked convention and lets the
  search copy read well in context (graded by the eval); the small cost is a couple
  of near-duplicate label keys, some of which are now dead in the shell.

## Data model

No persistent data, no DB, no schema (ADR-0003). State is ephemeral: the active
location lives in the **URL** (`?lat=&lon=&name=`, owned by the locked
LocationProvider) and the search UI's transient state is in-component. The
**internal data contract** (the one thing that crosses the Server↔Client boundary)
and the in-component state:

- **`GeoSuggestion`** (`lib/search/types.ts`) — `{ id: string; name: string;
  admin1?: string; country?: string; countryCode?: string; lat: number; lon:
  number }`. The minimal projection of an Open-Meteo geocoding result; the only
  shape the client knows.
- **`GeocodeResult`** — the route handler's response: `{ suggestions:
  GeoSuggestion[] }` on success / empty; a small typed error shape (e.g.
  `{ error: "failed" }`) on a non-OK upstream / network / zod failure. (Empty
  `suggestions` = zero results, NOT an error.)
- **In-component (`SearchBox`):** `query: string` (capped 120); `suggestions:
  GeoSuggestion[]`; `status: "idle" | "loading" | "ready" | "empty" | "error"`;
  `activeId: string | null` (the active-descendant option id, or null);
  `geoStatus` for the geolocation Notice. Plus refs: the debounce `timeout`, the
  in-flight `AbortController`, and the latest **request-id**.

The pure surface (`lib/search`): the zod **geocoding-response schema**, the
**mapper** `parseGeocoding(body: unknown): GeoSuggestion[]` (total; malformed/empty
→ `[]`), and `flagEmoji(countryCode?): string | null` (total).

## Error handling strategy

- **Two layers, both calm (NFR-OBS-01).** The **route handler** (D1) collapses
  every server-side fault to a typed result: empty/oversized/missing `q` →
  `{ suggestions: [] }`; non-OK Open-Meteo / network throw / zod-failed body → a
  typed error body. It **never** lets an exception escape as a raw 500 (the whole
  body is guarded). The **client** (D4) maps the typed result to an inline state:
  `{ suggestions: [...] }` (ready), `{ suggestions: [] }` for a non-empty query
  (the empty Notice "Нічого не знайдено"), or the typed error (the error Notice).
  A `fetch` rejection on the client side (e.g. the route itself unreachable) is
  caught and shown as the same calm error Notice.
- **Zod is the gate (the spec's payload contract).** The Open-Meteo body is parsed
  by the `lib/search` schema **before** any suggestion exists; a 200 whose body
  fails the schema is treated **exactly like a failed fetch** — discarded, error
  Notice shown, never rendered as partial data. An **absent/empty `results`** is
  valid (zero results, not an error).
- **Geolocation (D6).** Denied permission, an unavailable API, or a position error
  → a calm inline error Notice (Ukrainian, no `!`), location unchanged, no toast, no
  throw. The geolocation API is never called outside the click handler.
- **Latest-wins (D3).** A superseded or post-clear response is discarded (abort +
  id-guard), so a stale result never overwrites the current state or resurrects a
  dismissed list.
- **Untrusted URL params** are already handled by the locked `lib/location`
  validation (non-numeric / out-of-range / comma-decimal / oversized `name` →
  `null`, calm empty state, no throw); this slice relies on that and adds no second
  parse path.

## Risks / Trade-offs

- **Key/URL leaking to the client (highest, TC-DATA-01/NFR-COST-01):** a
  client-direct Open-Meteo fetch would bake the upstream URL/shape into the bundle
  and scatter parsing/error handling. Mitigation — the **Route Handler** (D1): the
  client only knows `/api/geocode` + `GeoSuggestion`; a review/grep asserts no
  `geocoding-api.open-meteo.com` and no key in the client bundle. The route-handler
  integration test drives it over a **mocked** Open-Meteo `fetch`.
- **Silent partial data on a malformed 200 (NFR-OBS-01):** rendering an
  unvalidated body could show half-suggestions or crash. Mitigation — **zod parse
  before render** (D2); a 200 that fails the schema is treated as a failed fetch
  (error Notice, no partial data). Unit tests feed a real-ish payload (→ mapped
  suggestions) and malformed/empty payloads (→ empty list / error).
- **Stale results overwriting the current query (spec latest-wins):** debounced
  typing leaves overlapping requests. Mitigation — **AbortController + request-id
  guard** (D3); a jsdom test resolves an earlier request **after** a newer one and
  asserts the newer query's suggestions stand, and resolves a request **after the
  input was cleared** and asserts the list stays dismissed.
- **Geolocation read on load / surprise prompt (BC-PRIVACY-02):** an effect or
  mount-time geolocation call would prompt unbidden. Mitigation — geolocation is
  called **only** inside the button click handler (D6); a jsdom test mocks
  `navigator.geolocation` and asserts it is **not** called on render/idle and **is**
  called only after the click, and that a denied permission shows the calm Notice.
- **Screen-reader-hostile suggestions (NFR-A11Y-01):** a div-soup list or
  Tab-through options would be unusable by keyboard/AT. Mitigation — the WAI-ARIA
  **combobox/listbox** pattern with `aria-activedescendant`/`aria-selected`, focus
  staying in the input, and Tab moving **past** the list (D5); jsdom tests assert the
  roles/names, the arrow-key active descendant, Enter-selects-active, and
  Tab-to-button.
- **Oversized / odd input (spec bounded-input):** a 5,000-char paste or
  emoji/comma-number could blow up the request or be mis-parsed as coordinates.
  Mitigation — the **120-char cap** before the request and treating all input as
  URL-encoded search text (D3); a test pastes an oversized value and asserts a single
  truncated request and an editable input.
- **Console noise on unmount:** an un-cleared debounce timer or un-aborted fetch
  resolving after unmount warns about state updates on an unmounted component.
  Mitigation — the effect clears the timer and aborts the in-flight request on
  unmount (D4); the healthy-session test asserts the console stays clean.
- **Copy quality (the delivery bar, eval ≥ 90):** the zero-results and
  geolocation-denied copy are graded, not just asserted. Mitigation — calm,
  blame-free Ukrainian in `search.*` (D8); browser-free eval cases grade the
  empty-results and geolocation-denied copy against the rubric, targeting every
  dimension ≥ 90.
- **Scope creep:** the temptation to fetch a forecast on selection, reverse-geocode
  a map click, or persist recents is resisted — those are explicit **Exclusions**;
  this slice only **sets** the active location (D1–D8).

## ADR note

The **server-side Route Handler data path** (D1) and the **active-location URL
contract** it writes through are the architecturally load-bearing decisions of
this slice. The active-location contract is already an accepted, locked convention
(established in `add-app-shell`, plan §4.1). The **"geocoding goes through
`app/api/geocode` so the upstream URL/shape and any key stay server-side"** rule
(TC-DATA-01) is the reusable pattern the next data slice (`add-forecast`, §4.6,
which also fetches Open-Meteo via a server/route handler) will follow; if a
reviewer judges it merits a standalone ADR, this design section is the basis — but
it is a faithful application of the already-accepted ADR-0003 (keyless/stateless)
and the AGENTS.md module convention ("external calls live server-side, parsed by
zod before the UI"), so no new ADR is mandated by this slice alone.
