## Context

`add-top-clock` is a Wave 1 leaf slice (capability plan §4.3, §6) off the
archived `add-app-shell` foundation. The shell already shipped the file this
slice fills: `components/shell/AppHeader.tsx` renders an **inert clock slot**
(`data-slot="clock"`) explicitly "owned by the top-clock slice later". This slice
replaces that placeholder with a real widget and adds a sibling `clock.*` i18n
namespace — it touches no other shell file and does **not** edit the shared
`app/page.tsx` serialize point (§3a).

Stack reality (ADR-0003/0004), overriding the agent default: **no database, no
auth, no email, no network**; the clock reads only the **device clock**. Tests
are **Vitest** (jsdom component, with fake timers) — **no Playwright**
(TC-STACK-05). The per-slice "smoke" is a **render smoke** (mount under jsdom),
not a DB smoke. This is a **client-only** widget, so Next.js 16 App Router rules
about the Server↔Client boundary and hydration apply (read
`node_modules/next/dist/docs/` before writing): a server-rendered component cannot
produce client-clock-dependent markup without a hydration mismatch — the central
constraint this design resolves.

The locked conventions reused verbatim: the `t("clock.key")` dotted-path accessor
(UK default → EN fallback → ""), the per-domain i18n namespacing (add `clock.*`,
never reach into `shell.*`), and the AppHeader clock slot. The clock introduces
**no color**, so NFR-A11Y-02 (contrast) has nothing new to verify here.

## Goals / Non-Goals

**Goals:**

- Fill the AppHeader clock slot with a live, accessible, device-local-time clock
  that ticks at least once per second and resyncs after throttling / clock
  changes (FR-CLOCK-01).
- Render with **no hydration mismatch** and a **console silent** on a healthy
  session (NFR-OBS-01), given the server cannot read the client clock.
- Contribute **zero CLS**: the ticking digits never move or resize the header
  (NFR-PERF-02).
- Expose a Ukrainian **accessible name** without flooding screen readers with
  per-second announcements (NFR-A11Y-01).
- Pin a single, locale-invariant display format so the width contract is fixed.
- Keep the formatting logic framework-free and unit-testable (TC-PURE-01); the
  React/`setInterval`/DOM concerns live only in the client component.

**Non-Goals:**

- The active weather location's time, any non-device time zone, a time-zone
  picker, a 12/24-hour toggle, or a locale/format selector.
- A date, day-of-week, or sub-second / millisecond display.
- Persisting any clock preference (keyless/stateless, no cookie/storage,
  BC-PRIVACY-03).
- Server-side or network-sourced (NTP/API) time — the clock reads only `Date`.
- Browser-rendered evidence (videos, live axe, vision) — env-gated per ADR-0004;
  rendering is covered by jsdom component tests.

## Decisions

### D1 — A client-only `TopClock` reading the DEVICE clock (FR-CLOCK-01)

- **`components/clock/TopClock.tsx`** is marked **`"use client"`**: it needs
  `useState`/`useEffect`, `setInterval`, and `Date`/`Intl` (browser/runtime
  clock), none of which belong in a server component.
- It reads the **visitor's device-local time and time zone** via the platform
  clock (`new Date()` rendered through the device's local time, no explicit
  `timeZone` override), so it reflects the visitor's own system clock — **not** the
  active weather location and **not** a server clock. The clock is independent of
  `useLocation()`; selecting a different city does not change it (spec: "Clock
  reflects the visitor device, not the weather location"). It therefore does
  **not** consume the LocationProvider at all.
- **Tick via `setInterval(…, 1000)`** started in `useEffect` on mount. Each tick
  **re-reads the live clock** (`new Date()`) and formats it, rather than
  incrementing a stored seconds counter. This is the key to the resync guarantees:
  when the tab returns from background/throttle, or the system clock / time zone
  changes (incl. DST), the **next tick reads the true current time** and the
  display jumps to it within one interval — it never shows a drifted, paused, or
  stale value and never needs a manual refresh (spec: the two "resyncs" scenarios).
- **Trade-off:** `setInterval` is simple and sufficient for a "≥ once per second"
  guarantee (vs `requestAnimationFrame`, which throttles to 0 in background tabs
  and is overkill for second precision, or `setTimeout`-aligned-to-the-next-second,
  which trims at most ~1s of visible lag). Re-reading `Date` every tick (vs
  incrementing a counter) costs nothing and buys correct resync for free; a counter
  would silently drift whenever the timer was throttled.

### D2 — No hydration mismatch: a mount-gate placeholder (Next 16, NFR-OBS-01)

- **Problem:** the server has no access to the visitor's local clock, so any
  server-rendered time would differ from the client's first render and trigger a
  **React hydration mismatch warning** — a console error on a healthy session,
  violating NFR-OBS-01. (Spec requirement "Client-only resilient rendering".)
- **Chosen approach — mount-gate (as shipped):** a single nullable
  `const [time, setTime] = useState<string | null>(null)`. The **server render and
  the first client render** (both with `time === null`) emit the **identical
  placeholder markup** (a fixed-width slot, see D3) — so hydration sees matching
  trees and there is **no mismatch warning**. The live time is set from inside the
  mount `useEffect`, and deferred by one microtask (`Promise.resolve().then(...)`)
  before the first `setTime`. In a real browser the effect already runs after the
  first paint, so the microtask is belt-and-braces; it additionally keeps the
  **first synchronous render** on the placeholder even where mount effects flush
  synchronously (Testing Library's `render()`), so the reserved-footprint contract
  is observable in jsdom too. The time is never computed during the initial render,
  so the server never serializes a clock value. (A two-state `[mounted, setMounted]`
  flag is the textbook equivalent; the single nullable `time` collapses the gate and
  the value into one state.)
- **Why not `suppressHydrationWarning`:** placing `suppressHydrationWarning` on the
  time node is a viable alternative (it tells React to tolerate a text-content
  diff for that one node), but it **silences** the mismatch rather than avoiding
  it, masks any *unrelated* mismatch on that node, and would still flash a
  server-side value. The mount-gate **structurally avoids** the diff (the markup is
  genuinely identical pre-hydration), keeps the console clean for the right reason,
  and reserves the footprint explicitly. We therefore choose the mount-gate and do
  not rely on `suppressHydrationWarning`.
- **Trade-off:** the mount-gate means the **time is absent for one paint** (the
  placeholder shows first, then the time fills in on the next frame). That is
  acceptable and in fact *required* by the spec ("Pre-hydration footprint is
  reserved … when the client time appears, it fills the reserved slot"): the slot
  is sized to the final footprint (D3), so the fill-in causes **no layout shift**.
  The cost is one render's worth of "no digits yet", which is imperceptible and
  strictly better than a hydration error.

### D3 — No layout shift: tabular numerals + fixed-width slot (NFR-PERF-02)

- A live header clock is a recurring **CLS** source: digit glyphs differ in width
  (`1` is narrow, `8`/`0` wide), so naive rendering reflows the header every time
  a digit changes (e.g. `11:09:08` → `12:22:22`, or `09:09:09` → `10:10:10`).
- **Two complementary guards, both applied:**
  1. **Tabular numerals** — the time node uses `tabular-nums`
     (`font-variant-numeric: tabular-nums`) so every digit occupies the **same
     advance width**; changing digits cannot change the string's measured width.
  2. **Fixed-width slot** — the clock container also carries a `min-width` (and
     `text-align`) sized to the canonical **eight-character `HH:MM:SS`** string
     (an `inline-block`/`tabular` slot), so even before the font's metrics settle
     the slot reserves its final width.
- **The pre-hydration placeholder reserves the SAME footprint** (D2): it is the
  same fixed-width slot (rendered empty or with a non-shifting placeholder glyph),
  so when the time fills in, the header does not move. The clock's measured CLS
  contribution is **zero** (spec: "Header does not reflow as digits change",
  "Stable width across single- and double-digit values", "Pre-hydration footprint
  is reserved").
- **Trade-off:** belt-and-braces (tabular-nums **and** a min-width) is slightly
  redundant — `tabular-nums` alone fixes width once the font loads — but the
  min-width also covers the **pre-hydration** and **font-not-yet-loaded** windows,
  which `tabular-nums` does not, so the combination is what makes the zero-CLS
  guarantee hold from first paint. The cost is one extra utility class.

### D4 — Accessible name, quiet status (NFR-A11Y-01)

- The clock exposes a Ukrainian **accessible name** (e.g. "Поточний місцевий час"
  / current local time) via `aria-label` on the clock element, so a screen reader
  announces *a clock / local time* rather than bare unlabeled digits (spec:
  "Screen reader announces an accessible name"). The name is in **Ukrainian** to
  match the Ukrainian-first UI and is sourced from `lib/i18n` (`clock.*`), never
  hardcoded (NFR-I18N-01).
- **No per-second announcement flooding:** the ticking time node is a **quiet
  status**, NOT an `aria-live` region. We deliberately do **not** put
  `aria-live="polite"` (or `role="timer"` with a live region) on the ticking node,
  because that would queue a screen-reader announcement **every second** and
  interrupt the user (spec: "Per-second ticking does not flood announcements").
  The time is announced on demand when the user navigates to it, not pushed.
  Optionally the visible digits carry `aria-hidden` while the stable `aria-label`
  carries the meaning — but the load-bearing rule is simply: **no live region on
  the tick**.
- **Visible focus:** the clock is a non-interactive status display (no button, no
  link) — it exposes no interactive affordance, so there is no focus-style
  obligation to add. If a future change makes any part interactive, it must
  preserve a visible focus ring (the spec keeps this clause for that case); this
  slice introduces no such affordance.
- **Trade-off:** an `aria-label` reflecting a coarse value (e.g. "current local
  time", not the live seconds) keeps the announced name stable and meaningful
  without the label itself churning every second. Embedding the live `HH:MM` in
  the label is possible but risks a verbose, frequently-changing name; we keep the
  name a calm, stable descriptor and let the visible digits carry the live value.

### D5 — Pinned 24-hour `HH:MM:SS`, framework-free formatter (FR-CLOCK-01, TC-PURE-01)

- The display format is **pinned and locale-invariant**: canonical 24-hour
  `HH:MM:SS` — two zero-padded **ASCII** digits each for hours, minutes, seconds,
  a literal `:` separator, **no AM/PM**, no locale separators, no localized digit
  shaping (spec: the format is the single width contract). We choose `HH:MM:SS`
  (with seconds) over `HH:MM` because the spec's width and footprint scenarios are
  explicitly sized against the **eight-character `HH:MM:SS`** string, and showing
  seconds makes the "advances once per second" behavior visible.
- A tiny **framework-free** helper — e.g. `lib/clock/format.ts`
  `formatClock(date: Date): string` — derives the device-local fields via the
  platform clock and zero-pads them with plain string ops (its own `*.test.ts`,
  TC-PURE-01: no `next/*`, no `react`, no DOM). Keeping the formatting pure means
  the locale-invariance and zero-padding are unit-tested deterministically (feed it
  a fixed `Date`, assert the exact string) without rendering React. Using local
  date fields (e.g. `getHours()/getMinutes()/getSeconds()`, or `Intl` constrained
  to ASCII `HH:MM:SS`) guarantees the device time zone is used.
- **Trade-off:** a hand-rolled `HH:MM:SS` formatter (vs
  `toLocaleTimeString()`) is a few lines but **removes locale variance** — some
  locales would inject AM/PM, a narrow no-break space, or non-Western digits, any
  of which breaks the pinned format and the width contract. The hand-rolled path is
  the only one that is locale-stable by construction.

### D6 — i18n: a `clock.*` namespace; supersede the inert `shell.clock.*` copy

- Add a **`clock.*`** namespace to `lib/i18n/uk.ts` + `en.ts` (sibling to
  `shell.*`, never reaching into it) carrying the accessible label, e.g.
  `clock.label` = "Поточний місцевий час" / "Current local time". Calm tone, **no
  exclamation marks** (BC-BRAND-01, enforced by the existing i18n test across both
  locales).
- The shell shipped inert placeholder copy under **`shell.clock.*`**
  (`label: "Місцевий час"`, `placeholder: "Місцевий час обраного міста зʼявиться
  тут"`). That placeholder described a *weather-location* time — an idea this slice
  **rejects** (the clock shows the **device** time). `TopClock` therefore reads its
  own `clock.label`, not `shell.clock.placeholder`. We **leave the `shell.clock.*`
  keys in place** (removing them is a `shell.*` edit and risks the typed-key
  surface other tests assert) but they become **unused** — `TopClock` owns the
  user-visible copy via `clock.*`. (If a reviewer prefers, a follow-up may prune the
  now-dead `shell.clock.placeholder`; it is out of scope here to keep the shell
  serialize point untouched.)
- **Trade-off:** owning a fresh `clock.*` namespace (vs reusing
  `shell.clock.label`) keeps the slice's copy in its own domain per the locked
  convention and avoids coupling the device-time wording to the shell's stale
  "обраного міста" phrasing; the small cost is two near-duplicate label keys, one
  of which is dead.

### D7 — Wire into the AppHeader clock slot (§3a, not an app/page.tsx edit)

- Replace the inert placeholder block in `components/shell/AppHeader.tsx`
  (`<div data-slot="clock" …>{t("shell.clock.placeholder")}</div>`) with the real
  **`<TopClock/>`**. This is the shell's **own** slot file, shipped for exactly
  this purpose — **not** an edit to the shared `app/page.tsx` serialize point
  (§3a). The surrounding header layout (the `flex items-center gap-2` row, the
  responsive `sm:` visibility) is preserved; `TopClock` slots in where the
  placeholder was.
- **Trade-off:** editing `AppHeader.tsx` (vs a brand-new top-level slot) is the
  intended design — the shell created the inert slot specifically so this slice
  fills it with a one-line swap, minimizing churn; the header is not a multi-slice
  serialize point the way `app/page.tsx` is.

## Data model

No persistent data, no DB, no schema (ADR-0003). The only runtime state is
ephemeral, in-component:

- `mounted: boolean` — false on server + first client render (placeholder), true
  after `useEffect` (drives the hydration-safe gate, D2).
- `now: Date` (or the formatted `HH:MM:SS` string) — the current device-local time,
  refreshed each tick from `new Date()` (D1).

The pure surface is one function: `formatClock(date: Date): string → "HH:MM:SS"`
(D5), defined for any `Date`, locale-invariant, ASCII digits, zero-padded.

## Error handling strategy

- There is **no input and no external call**, so there is no error path to
  surface — the clock cannot 500 or blank (NFR-OBS-01 is satisfied by construction).
  `formatClock` is total for any `Date` (it reads only numeric local fields and
  string-pads them), so it cannot throw on the values a live `Date` yields.
- The honest-under-failure obligation reduces to **console silence on a healthy
  session**: the mount-gate (D2) prevents the only realistic console fault (a
  hydration mismatch warning), and the unmount cleanup (D1) prevents the
  "update on unmounted component" warning. A test asserts the console stays clean
  and that `clearInterval` runs on unmount.

## Risks / Trade-offs

- **Hydration mismatch (highest):** rendering client-clock-dependent markup on the
  server warns in the console (NFR-OBS-01). Mitigation — the mount-gate (D2):
  server + first client render emit the *identical* placeholder, so there is no
  diff; the time appears only post-mount. A test renders the placeholder→time
  transition and asserts no `console.error`/`console.warn`.
- **Layout shift while ticking (NFR-PERF-02):** changing digit widths reflow the
  header. Mitigation — `tabular-nums` **and** a fixed `min-width` sized to
  `HH:MM:SS`, with the placeholder reserving the same footprint (D3). Tests assert
  the tabular-nums affordance / stable width and that the placeholder and time
  share the slot.
- **Screen-reader flooding:** an `aria-live` region on a per-second tick would
  announce every second (NFR-A11Y-01). Mitigation — the ticking node is a **quiet
  status with no live region** (D4); a test asserts the accessible name is present
  AND that the ticking node carries no `aria-live="polite"`/`assertive`.
- **Timer leak on unmount:** an un-cleared `setInterval` keeps firing after the
  component leaves (client navigation), warning about state updates on an unmounted
  component. Mitigation — the `useEffect` returns `clearInterval(id)` (D1); a test
  spies on `clearInterval` and asserts it is called on unmount and no further tick
  runs.
- **Locale format drift:** `toLocaleTimeString()` would inject AM/PM, locale
  separators, or non-Western digits in some locales, breaking the pinned format and
  the width contract. Mitigation — the hand-rolled ASCII `HH:MM:SS` formatter (D5)
  is locale-invariant by construction; a unit test asserts the exact string for a
  fixed `Date`.
- **Background-tab drift / clock change:** a throttled timer or a system clock /
  time-zone change could leave a stale value. Mitigation — each tick re-reads the
  live `Date` (D1), so the next update resyncs to the true current time within one
  interval; tests advance fake timers across a simulated clock jump and assert the
  display resyncs rather than continuing from a counter.
- **Scope creep:** the temptation to show the *weather location's* time (matching
  the stale `shell.clock.placeholder` copy) is resisted — that is an explicit
  Exclusion (D6); the clock shows the **device** time, owning fresh `clock.*` copy.
