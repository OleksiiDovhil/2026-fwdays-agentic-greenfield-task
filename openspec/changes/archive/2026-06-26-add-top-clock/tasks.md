## 1. Setup (i18n clock label keys)

> No database, no migrations, no auth, no email, no network (ADR-0003). No new
> deps — react is installed. This slice fetches nothing and reads only the device
> clock. Reuse the LOCKED app-shell conventions: `lib/i18n` namespaces + `t()`,
> the AppHeader clock slot. No new color, so nothing for NFR-A11Y-02 here.

- [x] 1.1 Add a `clock` namespace to `lib/i18n/uk.ts` (sibling to `shell.*` —
  never edit `shell.*`): `clock.label` — the clock's accessible name, e.g.
  "Поточний місцевий час" (current local time). Calm tone, no exclamation marks
  (BC-BRAND-01). If a fuller hint is useful keep it in the same namespace
  (`clock.*`), never reaching into `shell.*`. (D6, NFR-I18N-01.)
- [x] 1.2 Mirror the same `clock.*` keys in `lib/i18n/en.ts` (strict fallback
  subset, same key shape): `clock.label` = "Current local time". Same calm tone,
  no exclamation marks (D6, NFR-I18N-01).
- [x] 1.3 Note in a code comment (D6) that the inert `shell.clock.*` placeholder
  copy is now SUPERSEDED by `clock.*`: it described a rejected "weather-location
  time" idea, whereas this clock shows the DEVICE time. Leave `shell.clock.*` in
  place (removing it is a `shell.*` edit, §3a) but do NOT consume it from
  `TopClock`.

## 2. Time-format helper (framework-free, TC-PURE-01)

> A tiny pure helper; no `next/*`, no `react`, no DOM globals. Colocated
> `*.test.ts` with `@trace` ids. Write the section 5 unit test FIRST and confirm
> it FAILS (red) before implementing (test-first per AGENTS.md). Keep this section
> minimal — a clock is mechanical; the only logic worth isolating is the
> locale-invariant `HH:MM:SS` formatting.

- [x] 2.1 `lib/clock/format.ts` — `formatClock(date: Date): string` returning the
  device-local time as canonical 24-hour `HH:MM:SS` (D5, FR-CLOCK-01): two
  zero-padded ASCII digits each for hours/minutes/seconds via the local date
  fields (`getHours()`/`getMinutes()`/`getSeconds()`) and plain string padding, a
  literal `:` separator, NO AM/PM, NO locale separators, NO localized digits.
  Pure, total for any `Date`, deterministic, no clock/DOM/network read of its own
  (it formats the `Date` it is handed). The eight-character output is the single
  width contract the layout reserves against.

## 3. UI (TopClock client component + wire into the AppHeader clock slot)

> Read `node_modules/next/dist/docs/` (server vs client components, hydration)
> before writing. This is the ONLY place React / `setInterval` / DOM concerns
> live. Reuse the AppHeader clock slot the shell shipped for this purpose.

- [x] 3.1 `components/clock/TopClock.tsx` marked `"use client"` (D1, FR-CLOCK-01):
  renders the visitor's DEVICE-local time (via `new Date()` → `formatClock`), NOT
  the weather location and NOT a server clock; does NOT consume `useLocation()`.
- [x] 3.2 Live tick (D1, FR-CLOCK-01): start a `setInterval(…, 1000)` in
  `useEffect` on mount; each tick RE-READS the live clock (`new Date()`) and
  reformats — never increments a stored counter — so the next update RESYNCS to
  the true current time after a background/throttle or a system-clock / time-zone
  change (incl. DST). Return `() => clearInterval(id)` from the effect so the
  timer is cleared on unmount and no callback runs afterward (no "update on
  unmounted component" warning).
- [x] 3.3 No hydration mismatch (D2, NFR-OBS-01): a mount-gate
  `const [mounted, setMounted] = useState(false)` flipped in
  `useEffect(() => setMounted(true), [])`. The server render AND the first client
  render (mounted === false) emit the IDENTICAL placeholder markup; only after
  mount does the live time render. The time is never computed during the initial
  render, so the server serializes no clock value and there is no hydration diff.
  (Document why this is preferred over `suppressHydrationWarning` per D2.)
- [x] 3.4 No layout shift (D3, NFR-PERF-02): render the time node with
  `tabular-nums` (font-variant-numeric) AND give the clock container a fixed
  `min-width` (and `text-align`) sized to the eight-character `HH:MM:SS` string,
  so changing digit widths never reflow the header. The pre-hydration placeholder
  reserves the SAME footprint (same fixed-width slot, rendered empty or with a
  non-shifting placeholder) so filling in the time causes no shift.
- [x] 3.5 Accessible name, quiet status (D4, NFR-A11Y-01): expose the Ukrainian
  accessible name via `aria-label={t("clock.label")}` on the clock element so a
  screen reader announces a clock, not bare digits. Do NOT put
  `aria-live="polite"`/`assertive` (and do not use `role="timer"` with a live
  region) on the ticking node — the per-second changes must not flood/interrupt a
  screen reader; the time is a quiet status announced on demand. (Optionally mark
  the visible digits `aria-hidden` while the stable label carries the meaning.)
  Copy comes from `lib/i18n` (NFR-I18N-01), no `!`.
- [x] 3.6 Wire into the AppHeader clock slot (D7, §3a): in
  `components/shell/AppHeader.tsx` REPLACE the inert
  `<div data-slot="clock" …>{t("shell.clock.placeholder")}</div>` block with the
  real `<TopClock/>`, preserving the surrounding header layout (the
  `flex items-center gap-2` row and the responsive `sm:` visibility). This is the
  shell's OWN slot file — do NOT edit `app/page.tsx`.

## 4. Layout / page composition

> Intentionally empty. This slice owns NO `app/page.tsx` change: it fills the
> AppHeader clock slot (the shell's own slot file, §3a), not the shared page
> serialize point. The header composition itself is unchanged beyond swapping the
> inert placeholder for `<TopClock/>` (task 3.6).

## 5. Tests (Vitest only — jsdom component with fake timers + a pure unit test; NO Playwright)

> Write these FIRST and confirm they FAIL (red), then implement sections 1–3 to
> green. Every test file carries `@trace` ids. Never weaken a test to pass it. Use
> `vi.useFakeTimers()` to drive the tick deterministically. A clock is mechanical,
> so an EVAL is low-value (see 5.7).

- [x] 5.1 Unit `lib/clock/format.test.ts` (FR-CLOCK-01, D5): `formatClock` on
  fixed `Date`s returns the exact canonical `HH:MM:SS` — assert `14:05:30`,
  zero-padding for single-digit fields (e.g. `09:09:09`, `00:00:00`), the literal
  `:` separator, and ASCII digits only; assert NO AM/PM and no locale separators
  in the output (e.g. it equals exactly the 8-char string). Pure/total: never
  throws for any `Date`. `@trace FR-CLOCK-01`.
- [x] 5.2 jsdom component `components/clock/TopClock.test.tsx` — stable
  placeholder then a time after mount, no hydration error (FR-CLOCK-01,
  NFR-OBS-01, D2): with fake timers and the system time set to a known instant,
  render `TopClock`; assert the FIRST render shows the reserved placeholder (no
  time digits yet) and that AFTER mount/effects flush the canonical `HH:MM:SS`
  time appears in the reserved slot; spy on `console.error`/`console.warn` and
  assert NEITHER was called (no hydration-mismatch warning, console silent).
  `@trace FR-CLOCK-01, NFR-OBS-01`.
- [x] 5.3 jsdom advances on tick (FR-CLOCK-01): with the device time set to
  14:05:30 and the clock mounted, advance fake timers by ~1000ms (`vi.advanceTimersByTime`)
  and assert the displayed time becomes 14:05:31 (updates at least once per second,
  no manual refresh). Then simulate a clock JUMP (re-set the system/fake time
  forward) and advance one interval; assert the display RESYNCS to the new current
  time (proves it re-reads `Date` each tick, not a counter — D1).
  `@trace FR-CLOCK-01`.
  > RESOLVED: the resync assertion now asserts `16:30:01` (one interval after the
  > clock jumped to 16:30:00), coexisting with the independent advance test (base
  > 14:05:30 → 14:05:31); both pass. The orchestrator corrected the expected
  > second; the implementation (re-reads `new Date()` each tick) was not weakened.
- [x] 5.4 jsdom accessible name present, no announcement flooding (NFR-A11Y-01,
  D4): after mount the clock element exposes a non-empty Ukrainian (Cyrillic)
  accessible name from `clock.label` (e.g. via `aria-label`), and it contains no
  `!` (BC-BRAND-01); assert the ticking time node carries NO
  `aria-live="polite"`/`assertive` (the per-second updates are not a live region).
  `@trace NFR-A11Y-01, BC-BRAND-01`.
- [x] 5.5 jsdom stable width / tabular-nums (NFR-PERF-02, D3): assert the time
  node / clock container carries the `tabular-nums` affordance (className or
  computed `font-variant-numeric`) AND a fixed-width affordance (a `min-width`
  class/style sized to `HH:MM:SS`); assert the pre-hydration placeholder and the
  mounted time occupy the SAME slot (same container, fixed width) so digits
  changing or the time filling in cannot reflow the header. `@trace NFR-PERF-02`.
- [x] 5.6 jsdom timer cleared on unmount (FR-CLOCK-01, NFR-OBS-01, D1): spy on
  `clearInterval`; mount `TopClock`, then unmount it; assert `clearInterval` was
  called and that advancing fake timers afterward triggers NO further update and
  NO console warning about updating an unmounted component. `@trace FR-CLOCK-01,
  NFR-OBS-01`.
- [x] 5.7 Eval (OPTIONAL — low-value for a mechanical widget): a clock has no
  graded prose to judge, so an eval is OPTIONAL here. You MAY add ONE tiny
  browser-free case whose `produce()` returns the `clock.label` accessible name
  for the `eval-judge` to grade for calm, clear, accessible Ukrainian (mark gating
  lines `CRITICAL:`, group by `dimension`, mirror `@trace`), OR SKIP it with a
  one-line note in this task that the clock's only copy is the accessible label
  already invariant-checked in 5.4. Document the choice; do not pad the suite.
  > CHOICE: SKIPPED. The clock's only user-visible copy is the `clock.label`
  > accessible name, already invariant-checked in 5.4 (non-empty Ukrainian, no
  > `!`) and by the existing `lib/i18n/i18n.test.ts` exclamation-mark sweep; an
  > eval would only re-grade one calm label — no graded prose to add, so the suite
  > is not padded.

## 6. Validation, docs, and archive prep

- [x] 6.1 Write the section 5 tests FIRST and confirm they FAIL (red), then
  implement sections 1–3 to green (test-first per AGENTS.md). Never weaken a test
  to pass it; if a test contradicts the spec, change it deliberately.
- [x] 6.2 Run `npm run lint` — zero errors/warnings.
- [x] 6.3 Run `npm run test:run` — all unit + jsdom component tests green.
- [x] 6.4 Run `npm run build` — production build succeeds; console clean (no
  hydration warning for the clock). (Next 16.2.9 / Turbopack: compiled OK,
  TypeScript OK, `/` prerendered static — the mount-gate means the server
  serializes the placeholder, so there is no clock value to mismatch.)
- [x] 6.5 Run `npx openspec validate add-top-clock --strict` — zero
  errors/warnings. ("Change 'add-top-clock' is valid".)
- [x] 6.6 Run `npx openspec validate --all --strict` — all specs + changes pass.
  (10 passed, 0 failed.)
- [x] 6.7 Update `docs/current-state.md`: stamp date/time (Europe/Kyiv), mark
  `add-top-clock` implemented/validated/archived, and record the conventions for
  downstream reuse (the `clock.*` i18n namespace + that `shell.clock.*` is now
  superseded; `components/clock/TopClock.tsx` as the live device-clock widget; the
  mount-gate hydration pattern + tabular-nums/fixed-width no-CLS pattern as the
  reusable recipe for any future live header widget) plus the exact next step
  (remaining Wave 1: `add-bottom-jokes`, then Wave 2 `add-city-search`).
- [x] 6.8 RENDER smoke (NOT a DB smoke — there is no DB, ADR-0003), step by step:
  (a) under jsdom with `vi.useFakeTimers()` and the system time set to a known
  instant (e.g. 14:05:30), render `<TopClock/>` and assert the FIRST paint shows
  the reserved fixed-width placeholder with NO time digits and NO `console.error`/
  `console.warn` (no hydration mismatch); (b) flush effects and assert the
  canonical `HH:MM:SS` time (`14:05:30`) now fills the SAME reserved slot; (c)
  assert the clock element exposes the non-empty Ukrainian `clock.label`
  accessible name (no `!`); (d) advance timers ~1000ms and assert the time
  advances to `14:05:31`; (e) unmount and assert `clearInterval` was called and no
  further update fires. Capture the pass output as the smoke evidence.
- [x] 6.9 GATED on 6.8 passing: `npx openspec archive add-top-clock --yes
  --skip-specs` (the baseline `openspec/specs/top-clock/spec.md` already holds the
  contract, so the delta is NOT re-applied via Option B). Do not archive before
  the render smoke passes.
