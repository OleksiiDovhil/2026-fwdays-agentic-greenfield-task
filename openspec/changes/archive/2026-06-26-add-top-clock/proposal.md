## Why

`add-top-clock` is a Wave 1 leaf slice on top of the now-archived `add-app-shell`
foundation. It fills the inert **clock slot** the shell reserved in
`components/shell/AppHeader.tsx` with a real, live, accessible local-time clock
(FR-CLOCK-01). The clock shows the visitor's **own device-local time** — a small,
reassuring sign of life in the header — and keeps ticking while the page stays
open. It is a self-contained client-only widget: it owns no weather data, makes
no network call, persists nothing, and depends only on the shell's locked
conventions (the `t()` i18n accessor, the AppHeader clock slot).

The slice is deliberately narrow but the bar is high on two cross-cutting
qualities the spec pins: the widget must expose an **accessible name** so a
screen reader announces a clock, not bare digits (NFR-A11Y-01), and it must
**never cause layout shift** as the digits change, since a live-updating header
widget is a recurring Cumulative Layout Shift source (NFR-PERF-02). Both are
first-class concerns here, not afterthoughts.

## What Changes

- **Client-only live clock (`components/clock/TopClock.tsx`, `"use client"`):**
  a small React client component that renders the visitor's device-local time
  and updates live at least once per second (FR-CLOCK-01). It reads the **device
  clock and time zone** via `Date`/`Intl`, NOT the active weather location and
  NOT a server clock. A single `setInterval` drives the tick; the component reads
  the live `Date` on each tick (rather than incrementing a stored counter) so it
  **resyncs** correctly after the tab was backgrounded/throttled or the system
  clock / time zone changed (including a DST transition). The interval is
  **cleared on unmount** so no callback runs after the component leaves and no
  "update on unmounted component" warning appears.
- **No hydration mismatch (Next 16):** the server cannot know the client clock,
  so server-render / first-paint a **stable reserved-footprint placeholder**, then
  fill the time only after mount. We use a **mount-gate** (`useState(false)` flipped
  in `useEffect`): the server and the first client render emit the identical
  placeholder markup, so there is no hydration mismatch and the console stays
  silent on a healthy session.
- **No layout shift (NFR-PERF-02):** the time is rendered with **tabular
  numerals** (`tabular-nums`, `font-variant-numeric`) **and** a fixed `min-width`
  sized to the canonical eight-character `HH:MM:SS` string, so per-glyph width
  differences (e.g. `1`→`8`, `09`→`10`) never reflow the header. The pre-hydration
  placeholder reserves the **same footprint**, so filling in the time causes no
  shift. The clock's CLS contribution is zero.
- **Pinned 24-hour `HH:MM:SS` format:** the displayed value is canonical 24-hour
  `HH:MM:SS` — two zero-padded ASCII digits each for hours/minutes/seconds, a
  literal `:` separator, no AM/PM and no locale digit shaping — produced by a tiny
  framework-free formatting helper so it does **not** vary by visitor locale. This
  canonical string is the single width contract the layout reserves against.
- **Accessible name without announcement flooding (NFR-A11Y-01):** the clock
  carries a Ukrainian **accessible label** (e.g. "Поточний місцевий час") so
  assistive tech announces a clock rather than unlabeled digits. The per-second
  ticking node is a **quiet status** — it is NOT an `aria-live="polite"` region —
  so the once-a-second changes do not flood or interrupt a screen reader; the time
  is announced on demand.
- **i18n:** the clock's accessible label lives in a `clock.*` namespace in
  `lib/i18n/uk.ts` + `en.ts` (sibling to `shell.*`, never reaching into it);
  calm tone, no exclamation marks (BC-BRAND-01, test-enforced). The existing inert
  `shell.clock.*` placeholder copy ("Місцевий час обраного міста зʼявиться тут")
  is **superseded**: that text described a now-rejected "weather-location time"
  idea; this slice shows the **device** clock, so it owns its own `clock.*` strings.

## Capabilities

### New Capabilities

- `top-clock`: an accessible, client-only, live device-local-time clock in the
  application header — the pinned 24-hour `HH:MM:SS` display that ticks at least
  once per second and resyncs after throttling/clock changes, its reserved
  no-layout-shift footprint, its Ukrainian accessible name that does not flood
  screen readers, and its hydration-safe (no-mismatch, console-silent) rendering.

### Modified Capabilities

<!-- None. This change introduces the top-clock capability; no existing spec changes. The app-shell spec is untouched: this slice only fills the AppHeader clock slot (a slot the shell shipped for exactly this purpose) and adds a sibling clock.* i18n namespace — it does not edit shell.* copy semantics or app/page.tsx. -->

## Impact

- **Specs:** the baseline `openspec/specs/top-clock/spec.md` already exists
  (adopted at G2). The delta under `specs/top-clock/spec.md` restates that
  contract as `## ADDED Requirements` for the record and for
  `openspec validate add-top-clock --strict`; archive runs with `--skip-specs`
  because the baseline already holds it (Option B is not re-applied).
- **Code (new):** `components/clock/TopClock.tsx` (the client widget), an
  optional tiny framework-free time-format helper (e.g. `lib/clock/format.ts`
  `formatClock(date)` → `HH:MM:SS`) with a colocated `*.test.ts`, plus colocated
  component tests `components/clock/TopClock.test.tsx`.
- **Code (extended):** `components/shell/AppHeader.tsx` — the inert clock slot is
  replaced with the real `<TopClock/>` (filling the slot the shell reserved; this
  is the shell's own slot, not an `app/page.tsx` edit, §3a). `lib/i18n/uk.ts` +
  `lib/i18n/en.ts` gain a `clock.*` namespace (sibling to `shell.*`).
- **Dependencies:** none added — react is already installed. **No database, no
  auth, no email, no network** (ADR-0003); the clock fetches nothing and reads
  only the device clock. **No Playwright** (TC-STACK-05); verification is Vitest
  jsdom component tests with fake timers, and the per-slice "smoke" is a **render
  smoke** (mount the widget under jsdom + fake timers), not a DB smoke.
- **Out of scope (see the spec's Exclusions):** showing the active weather
  location's time or any non-device time zone; a time-zone picker / 12-24h toggle /
  locale-format selector; date or day-of-week display; persisting any clock
  preference (keyless/stateless); server-side or network-sourced (NTP/API) time;
  sub-second / millisecond precision — all intentionally excluded so testers do
  not report them as defects.
