// Output-eval cases for the map copy quality. These grade what a unit test
// cannot: whether the coordinate-fallback display label ("Обране місце") and the
// reverse-geocode-failed copy read as natural, calm, blame-free Ukrainian a
// visitor is happy to see when a map click cannot resolve a place name
// (FR-MAP-03, NFR-OBS-01, BC-BRAND-01). The delivery bar is every dimension >= 90.
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and
// RETURNS the user-visible `map.*` copy strings (no React render, no Leaflet). A
// fresh judge agent (maker != checker) scores them against the rubric.
//
// Test-first (RED): the `map.*` namespace does not exist yet, so `t()` returns ""
// for these keys and `mapCopy()` throws ("resolved to empty copy") until the slice
// adds the namespace — the eval never silently grades blank copy. The `map.*` keys
// are not yet in the typed MessageKey union, so they are read via the established
// `as never` cast (mirroring search-copy.eval.ts, forecast-copy.eval.ts,
// lib/i18n/i18n.test.ts). Once uk.ts gains the namespace these resolve to the
// Ukrainian copy and the eval grades it.
import type { EvalCase } from "@/evals/types";

// Resolve the map copy strings from the centralized dictionary. Kept inside a
// helper so the case stays browser-free and only touches the pure i18n layer.
async function mapCopy() {
  const { t } = await import("@/lib/i18n");
  const copy = {
    // The coordinate-fallback display label shown in the marker popup when no
    // reverse name resolves (the spec's "no named place" / "malformed payload"
    // scenarios). The shipped Ukrainian literal is "Обране місце".
    fallbackName: t("map.fallbackName" as never),
    // The calm reverse-geocode-failed inline copy (if the component surfaces one):
    // the location is set and named-by-coordinates, the map still works.
    reverseFailed: t("map.reverseFailed" as never),
  };
  // Fail LOUDLY if any key resolves to blank, so the eval loop never silently
  // grades empty copy (and so this case is RED until the namespace ships).
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`mapCopy: "${key}" resolved to empty copy`);
    }
  }
  return copy;
}

export const cases: EvalCase[] = [
  {
    id: "eval-map-fallback-clarity",
    trace: ["FR-MAP-03", "BC-BRAND-01"],
    dimension: "map-fallback-clarity",
    capability: "map",
    scenario:
      "The visitor clicks the map at a point with no named place (open sea, an unnamed region) or the reverse lookup yields no usable name. The marker popup shows the coordinate-fallback display label instead of a blank popup. Grade the Ukrainian fallback label: it should read as a calm 'a chosen place', never an error or a dead end.",
    produce: async () => {
      const c = await mapCopy();
      return { fallbackLabel: c.fallbackName };
    },
    rubric: [
      "CRITICAL: the label is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and no ALL-CAPS shouting.",
      "CRITICAL: it reads as a calm, sensible 'a chosen place' / 'selected point' label — NOT an error, a failure, a warning, or a dead end (it stands in for a city name in the marker popup).",
      "Tone is calm, neutral, and practical; it reads as written by a careful native speaker, never alarmist or robotic.",
      "It is concise — a short label (one or two words / a short phrase) — with no scary jargon, error codes, or coordinates-as-scary-numbers.",
    ],
  },
  {
    id: "eval-map-reverse-failed-clarity",
    trace: ["FR-MAP-03", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "map-reverse-failed-clarity",
    capability: "map",
    scenario:
      "The reverse-geocoding request fails (network error, timeout, or non-2xx response). The active location is still set to the clicked coordinates with the calm coordinate fallback label, and the map keeps working. Grade the optional inline Ukrainian reverse-failed copy: calm, blame-free, and never alarmist — the click still succeeded.",
    produce: async () => {
      const c = await mapCopy();
      return { reverseFailedMessage: c.reverseFailed };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and does not shout in ALL-CAPS.",
      "CRITICAL: the copy is calm and blame-free — it never alarms or blames the visitor, and it makes clear the location was still set and the map keeps working (the failure is only the place NAME, not the click).",
      "Tone is calm, reassuring, and practical; it reads as written by a careful native speaker, never alarmist or robotic.",
      "It is concise — a short phrase or one short sentence — with no scary jargon, HTTP status codes, stack traces, error codes, or raw coordinates presented as alarming numbers.",
    ],
  },
];

// @trace FR-MAP-03, NFR-OBS-01, BC-BRAND-01
