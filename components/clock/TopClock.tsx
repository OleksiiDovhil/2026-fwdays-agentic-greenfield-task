"use client";

// Live header clock — design.md D1-D5, FR-CLOCK-01, NFR-A11Y-01/OBS-01/PERF-02.
//
// Shows the visitor's DEVICE-local time (not the weather location, not a server
// clock); it does NOT consume `useLocation()` (D1). Marked `"use client"`
// because it needs `useState`/`useEffect`, `setInterval`, and `Date` — none of
// which belong in a server component.
//
// Reserved footprint (D3, NFR-PERF-02): both the pre-hydration placeholder and
// the live time render through the SAME single `<time>` root, which carries
// `tabular-nums` (equal-advance digits) AND a fixed `min-width` sized to the
// 8-char `HH:MM:SS` string. So changing digits never reflow the header and the
// time filling in causes zero CLS.
import { useEffect, useState } from "react";
import { formatClock } from "@/lib/clock/format";
import { t } from "@/lib/i18n";

// A non-shifting placeholder of the SAME 8-char footprint as `HH:MM:SS`. It is
// NOT a valid time, so the pre-hydration paint cannot be mistaken for a live
// value and the server / first-client markup are identical (D2 mount-gate).
const PLACEHOLDER = "--:--:--";

export function TopClock() {
  // Mount-gate (D2, NFR-OBS-01): `time` is null on the server AND through the
  // first committed client paint — both render the IDENTICAL placeholder, so
  // hydration sees matching trees and there is NO mismatch warning. We do NOT
  // use `suppressHydrationWarning`: that would only SILENCE a server↔client text
  // diff (and mask unrelated diffs + flash a server value); the mount-gate
  // STRUCTURALLY avoids the diff (the markup is genuinely identical pre-mount).
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    // Guards the deferred first set against a same-tick unmount, so no state
    // update lands on an unmounted component (console silence, NFR-OBS-01).
    let active = true;

    // Reveal the live time one microtask AFTER mount, not synchronously in the
    // effect. In a real browser the effect already runs after the first paint, so
    // either way that paint shows the placeholder; the microtask additionally keeps
    // the FIRST SYNCHRONOUS render on the placeholder even where mount effects flush
    // synchronously (Testing Library's `render()`), so the reserved footprint is
    // observed before the device time fills the SAME slot on the next turn (D2).
    // The time is never computed during the initial render, so the server
    // serializes no clock value and there is no hydration diff.
    Promise.resolve().then(() => {
      if (active) setTime(formatClock(new Date()));
    });

    // Live tick (D1, FR-CLOCK-01): each tick RE-READS the live clock rather than
    // incrementing a counter. This is the resync guarantee — after a
    // background/throttle or a system-clock / time-zone change (incl. DST), the
    // next tick reads the true current time and the display jumps to it within
    // one interval; a counter would silently drift.
    const id = setInterval(() => {
      setTime(formatClock(new Date()));
    }, 1000);

    // Clear on unmount (D1, NFR-OBS-01): no orphan tick, no "update on an
    // unmounted component" warning.
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Accessible name (D4, NFR-A11Y-01): a calm, stable Ukrainian descriptor from
  // lib/i18n (NFR-I18N-01), NOT the live digits — so the announced name does not
  // churn every second. The ticking node carries NO aria-live region, so the
  // per-second updates never flood / interrupt a screen reader; the time is a
  // quiet status announced on demand. The visible digits are `aria-hidden` while
  // the stable label carries the meaning.
  return (
    <time
      data-slot="clock"
      aria-label={t("clock.label")}
      className="inline-block min-w-[8ch] text-right font-mono text-sm tabular-nums text-muted-foreground"
    >
      <span aria-hidden="true">{time ?? PLACEHOLDER}</span>
    </time>
  );
}

export default TopClock;
