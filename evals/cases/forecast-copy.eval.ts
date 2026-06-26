// Output-eval cases for the forecast copy quality. These grade what a unit test
// cannot: whether the loading, failed-fetch, and no-location messages read as
// natural, calm, blame-free Ukrainian a visitor is happy to see
// (FR-FORECAST-01, FR-FORECAST-05, NFR-OBS-01, BC-BRAND-01). The delivery bar is
// every dimension >= 90.
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and
// RETURNS the user-visible `forecast.*` copy strings (no React render). A fresh
// judge agent (maker != checker) scores them against the rubric.
//
// Test-first (RED): the `forecast.*` namespace does not exist yet, so `t()`
// returns "" for these keys and `forecastCopy()` throws ("resolved to empty copy")
// until the slice adds the namespace — the eval never silently grades blank copy.
// The `forecast.*` keys are not yet in the typed `MessageKey` union, so they are
// read via the established `as never` cast (mirroring search-copy.eval.ts,
// lib/i18n/i18n.test.ts). Once uk.ts gains the namespace these resolve to the
// Ukrainian copy and the eval grades it.
import type { EvalCase } from "@/evals/types";

// Resolve the forecast copy strings from the centralized dictionary. Kept inside a
// helper so the case stays browser-free and only touches the pure i18n layer.
async function forecastCopy() {
  const { t } = await import("@/lib/i18n");
  const copy = {
    // The calm busy label while a fetch for a newly selected location is in flight.
    loading: t("forecast.loading" as never),
    // The failed-fetch Notice copy (network / non-OK / malformed / zero-day).
    error: t("forecast.error" as never),
    // The no-location empty-state copy (a location must be chosen first).
    noLocation: t("forecast.noLocation" as never),
  };
  // Fail LOUDLY if any key resolves to blank, so the eval loop never silently
  // grades empty copy (and so this case is RED until the namespace ships).
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`forecastCopy: "${key}" resolved to empty copy`);
    }
  }
  return copy;
}

export const cases: EvalCase[] = [
  {
    id: "eval-forecast-error-clarity",
    trace: ["FR-FORECAST-01", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "forecast-error-clarity",
    capability: "forecast",
    scenario:
      "The forecast request fails (a network error, a non-OK upstream status, or a payload that fails validation). Grade the calm inline Ukrainian message shown in the forecast area in place of the cards — never a toast, never a raw 500, the rest of the page still works and the visitor can try again.",
    produce: async () => {
      const c = await forecastCopy();
      return { forecastErrorMessage: c.error };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and no ALL-CAPS shouting.",
      "CRITICAL: the copy is calm and blame-free — it never alarms or blames the visitor, and it is not a dead end; it conveys the forecast could not load right now and the visitor can try again while the rest of the app keeps working.",
      "Tone is calm, practical, and reassuring; it reads as written by a careful native speaker, never alarmist or robotic.",
      "It is concise — a short phrase or one short sentence — with no scary jargon, HTTP status codes, stack traces, or error codes.",
    ],
  },
  {
    id: "eval-forecast-empty-clarity",
    trace: ["FR-FORECAST-05", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "forecast-empty-clarity",
    capability: "forecast",
    scenario:
      "No location has been selected yet, so the forecast area shows its calm empty state instead of fetching. Grade the Ukrainian no-location copy: it should guide the visitor to search for a city, never read as an error or a broken state.",
    produce: async () => {
      const c = await forecastCopy();
      return { noLocationMessage: c.noLocation };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and does not shout in ALL-CAPS.",
      "CRITICAL: it reads as a calm, inviting empty state that guides the visitor to choose / search a city to see the forecast — NOT an error, a failure, or a dead end.",
      "Tone is calm, welcoming, and practical; it reads as written by a careful native speaker, not terse or robotic.",
      "It is concise — a short phrase or one short sentence — with no scary jargon or error codes.",
    ],
  },
  {
    id: "eval-forecast-loading-clarity",
    trace: ["FR-FORECAST-01", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "forecast-loading-clarity",
    capability: "forecast",
    scenario:
      "A location was just selected and the forecast for it is being fetched. Grade the Ukrainian loading copy shown in the forecast area: a quiet, reassuring busy state, never alarmist and never a spinner-with-no-words.",
    produce: async () => {
      const c = await forecastCopy();
      return { loadingMessage: c.loading };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and does not shout in ALL-CAPS.",
      "CRITICAL: it reads as a quiet, reassuring 'loading the forecast' busy state — calm and momentary, never alarmist, never an error.",
      "Tone is calm and practical; it reads as written by a careful native speaker, not robotic.",
      "It is concise — a short phrase — with no scary jargon or error codes.",
    ],
  },
];

// @trace FR-FORECAST-01, FR-FORECAST-05, NFR-OBS-01, BC-BRAND-01
