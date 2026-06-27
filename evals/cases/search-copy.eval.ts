// Output-eval cases for the city-search copy quality. These grade what a unit
// test cannot: whether the zero-results message and the geolocation-denied /
// unavailable messages read as natural, calm, blame-free Ukrainian a visitor is
// happy to see (FR-SEARCH-05, FR-SEARCH-06, NFR-OBS-01, BC-BRAND-01). The
// delivery bar is every dimension >= 90.
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and
// RETURNS the user-visible `search.*` copy strings (no React render). A fresh
// judge agent (maker != checker) scores them against the rubric.
//
// Test-first (RED): the `search.*` namespace does not exist yet, so `t()` returns
// "" for these keys and `searchCopy()` throws ("resolved to empty copy") until
// the slice adds the namespace — the eval never silently grades blank copy. The
// `search.*` keys are not yet in the typed `MessageKey` union, so they are read
// via the established `as never` cast (mirroring lib/i18n/i18n.test.ts,
// TopClock.test.tsx). Once uk.ts gains the namespace these resolve to the
// Ukrainian copy and the eval grades it.
import type { EvalCase } from "@/evals/types";

// Resolve the search copy strings from the centralized dictionary. Kept inside a
// helper so the case stays browser-free and only touches the pure i18n layer.
async function searchCopy() {
  const { t } = await import("@/lib/i18n");
  const copy = {
    // FR-SEARCH-05 zero-results literal (shipped Ukrainian "Нічого не знайдено").
    empty: t("search.empty" as never),
    // FR-SEARCH-05 actionable hint rendered beneath the empty title; graded WITH
    // `empty` so the judge sees the full empty state, not the bare title alone.
    emptyHint: t("search.emptyHint" as never),
    // FR-SEARCH-06 geolocation messages (denied / unavailable).
    geolocationDenied: t("search.geolocationDenied" as never),
    geolocationUnavailable: t("search.geolocationUnavailable" as never),
  };
  // Fail LOUDLY if any key resolves to blank, so the eval loop never silently
  // grades empty copy (and so this case is RED until the namespace ships).
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`searchCopy: "${key}" resolved to empty copy`);
    }
  }
  return copy;
}

export const cases: EvalCase[] = [
  {
    id: "eval-search-empty-clarity",
    trace: ["FR-SEARCH-05", "BC-BRAND-01"],
    dimension: "search-empty-clarity",
    capability: "city-search",
    scenario:
      "The visitor searches a name the geocoder resolves to zero matches. Grade the inline 'Нічого не знайдено' empty-results copy shown in place of the suggestion list (never a toast, never treated as a failure).",
    produce: async () => {
      const c = await searchCopy();
      return { emptyResultsMessage: c.empty, hint: c.emptyHint };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and no ALL-CAPS shouting.",
      "CRITICAL: it reads as a calm 'nothing matched' state that invites the visitor to try another name / spelling — NOT an error, a crash, or a dead end.",
      "Tone is calm, practical, and reassuring; it reads as written by a careful native speaker, not terse or robotic.",
      "It is concise — a short phrase or one short sentence — with no scary jargon, error codes, or filler.",
    ],
  },
  {
    id: "eval-search-geolocation-denied-clarity",
    trace: ["FR-SEARCH-06", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "geolocation-denied-clarity",
    capability: "city-search",
    scenario:
      "The visitor clicks 'Use my location' and the browser denies permission or has no geolocation API. Grade the calm inline Ukrainian copy shown for the denied and unavailable cases (no toast, location unchanged).",
    produce: async () => {
      const c = await searchCopy();
      return {
        geolocationDenied: c.geolocationDenied,
        geolocationUnavailable: c.geolocationUnavailable,
      };
    },
    rubric: [
      "CRITICAL: both messages are natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: neither message contains an exclamation mark (BC-BRAND-01) and neither shouts in ALL-CAPS.",
      "CRITICAL: the copy is blame-free — it never blames or scolds the visitor for denying permission; it calmly states the location is unavailable.",
      "CRITICAL: the copy is constructive — it makes clear search still works and the visitor can simply type a city name instead.",
      "Tone is calm, reassuring, and practical; it reads as written by a careful native speaker, never alarmist or robotic.",
      "Each message is concise — one short sentence — with no scary jargon, permission-API wording, or error codes.",
    ],
  },
];

// @trace FR-SEARCH-05, FR-SEARCH-06, BC-BRAND-01
