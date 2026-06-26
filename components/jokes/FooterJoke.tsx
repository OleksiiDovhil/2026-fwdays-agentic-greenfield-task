"use client";

// Footer jokes slot content — design.md D3-D5, FR-JOKES-01, NFR-I18N-01,
// NFR-OBS-01.
//
// Marked `"use client"` for the SAME reason TopClock is: the rotation must follow
// the VISITOR's local calendar day, and `dailyKey(new Date())` must be read on the
// CLIENT after mount. The home page is statically prerendered (it uses no dynamic
// API), so a SERVER-rendered footer would evaluate `new Date()` ONCE at build and
// bake the build-day's joke into the static HTML — it would never rotate at the
// visitor's local midnight and would read the BUILD HOST's time zone, not the
// visitor's. FR-JOKES-01 requires the visitor's local day, so the per-day pick
// happens client-side (D5).
//
// Mount-safe, no-mismatch, no-flash pattern (mirrors TopClock's mount-gate
// rationale): `useState` is initialized to a DETERMINISTIC, server-renderable
// joke — `pickJoke(corpus, 0)` — which is the EXACT value the server prerenders,
// so SSR and the first client render show the same joke (no hydration mismatch,
// no blank flash). A `useEffect` then updates to
// `pickJoke(corpus, dailyKey(new Date()))` — the visitor's local-day joke — which
// fills the SAME slot on the next client turn. An empty corpus yields `undefined`
// for both the initial and the post-mount pick, so the line is omitted throughout
// (D4); the console stays silent because `pickJoke` is total and never throws.
//
// The corpus is read DIRECTLY off the dictionary objects (`uk.jokes.items` /
// `en.jokes.items`), NOT via `t()` — `t()` resolves a single string leaf and
// cannot return an array (D3). No joke string is hard-coded here (NFR-I18N-01);
// only the slot's accessible label comes through `t("shell.jokes.label")`.
import { useEffect, useState } from "react";
import { t, uk, en } from "@/lib/i18n";
import { pickJoke, dailyKey } from "@/lib/jokes/jokes";

// Read a dictionary's joke array tolerantly (a mock that strips the array, or any
// malformed shape, degrades to []).
function readItems(dict: { jokes?: { items?: readonly string[] } }): readonly string[] {
  const items = dict.jokes?.items;
  return Array.isArray(items) ? items : [];
}

// Per-index English fallback (D3): prefer the Ukrainian entry at index `i`, fall
// back to the English entry only when the Ukrainian one is missing or empty. The
// resolved corpus keeps the Ukrainian length as canonical, so when Ukrainian is
// fully populated the resolved corpus is element-for-element the Ukrainian one —
// `pickJoke(resolved, key)` then equals `pickJoke(uk.jokes.items, key)`.
function resolveCorpus(): readonly string[] {
  const ukItems = readItems(uk);
  const enItems = readItems(en);
  return ukItems.map((entry, i) => {
    const usable = typeof entry === "string" && entry.trim().length > 0;
    if (usable) return entry;
    const fallback = enItems[i];
    return typeof fallback === "string" ? fallback : "";
  });
}

export function FooterJoke() {
  // Initial value = the index-0 joke, the deterministic value the SERVER
  // prerenders. SSR and the first client render therefore match (no hydration
  // mismatch, no flash). `undefined` for an empty corpus → the line is omitted.
  const [joke, setJoke] = useState<string | undefined>(() =>
    pickJoke(resolveCorpus(), 0),
  );

  useEffect(() => {
    // Guard the deferred set against a same-tick unmount, so no state update lands
    // on an unmounted component (console silence, NFR-OBS-01).
    let active = true;

    // After mount, switch to the VISITOR's local-calendar-day joke, deferred one
    // microtask after mount (mirrors TopClock): `new Date()` is read on the CLIENT,
    // so the rotation follows the visitor's local midnight and time zone (not the
    // build host's). Deterministic per local day: the same joke renders all day;
    // the selected index advances by exactly one at local midnight (D2). Deferring
    // the set (rather than calling it synchronously in the effect body) also keeps
    // the FIRST synchronous render on the index-0 value even where mount effects
    // flush synchronously (Testing Library's `render()`), so the SSR-equivalent
    // index-0 joke is observed before the local-day joke fills the SAME slot on the
    // next turn. Re-resolving the corpus keeps the post-mount pick on the identical
    // resolved array as the initial render.
    Promise.resolve().then(() => {
      if (active) setJoke(pickJoke(resolveCorpus(), dailyKey(new Date())));
    });

    return () => {
      active = false;
    };
  }, []);

  // Honest degradation (D4, NFR-OBS-01): when there is no usable joke (empty or
  // malformed corpus, no fallback), OMIT the line entirely — render nothing, not
  // a blank-but-present slot.
  if (!joke) return null;

  return (
    <p data-slot="jokes" aria-label={t("shell.jokes.label")} className="text-balance">
      {joke}
    </p>
  );
}

export default FooterJoke;
