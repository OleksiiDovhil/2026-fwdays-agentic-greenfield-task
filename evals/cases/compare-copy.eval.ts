// Output-eval cases for the weekend-compare copy quality. These grade what a unit
// test cannot: whether the empty "pin a city" state and the per-cell/column error
// copy read as natural, calm, blame-free Ukrainian a visitor is happy to see
// (FR-COMPARE-01, FR-COMPARE-02, NFR-OBS-01, BC-BRAND-01). The delivery bar is
// every dimension >= 90.
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and
// RETURNS the user-visible `compare.*` copy strings (no React render). A fresh
// judge agent (maker != checker) scores them against the rubric in Phase 6 — the
// maker does NOT self-grade.
//
// Test-first (RED): the `compare.*` namespace does not exist yet, so `t()` returns
// "" for these keys and `compareCopy()` throws ("resolved to empty copy") until the
// slice adds the namespace — the eval never silently grades blank copy. The
// `compare.*` keys are not yet in the typed `MessageKey` union, so they are read
// via the established `as never` cast (mirroring search-copy.eval.ts,
// lib/i18n/i18n.test.ts). Once uk.ts gains the namespace these resolve to the
// Ukrainian copy and the eval grades it.
//
// @trace FR-COMPARE-01, NFR-OBS-01, BC-BRAND-01
import type { EvalCase } from "@/evals/types";

// Resolve the compare copy strings from the centralized dictionary. Kept inside a
// helper so the case stays browser-free and only touches the pure i18n layer.
async function compareCopy() {
  const { t } = await import("@/lib/i18n");
  const copy = {
    // FR-COMPARE-01 empty "pin a city" state (EVAL-GRADED, target >= 90).
    emptyTitle: t("compare.empty.title" as never),
    emptyDescription: t("compare.empty.description" as never),
    // FR-COMPARE-02 / NFR-OBS-01 per-cell / per-column failed-data copy.
    error: t("compare.error" as never),
  };
  // Fail LOUDLY if any key resolves to blank, so the eval loop never silently
  // grades empty copy (and so this case is RED until the namespace ships).
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`compareCopy: "${key}" resolved to empty copy`);
    }
  }
  return copy;
}

export const cases: EvalCase[] = [
  {
    id: "eval-compare-empty-clarity",
    trace: ["FR-COMPARE-01", "BC-BRAND-01"],
    dimension: "compare-empty-clarity",
    capability: "weekend-compare",
    scenario:
      "The visitor opens the weekend comparison with no cities pinned yet. Grade the calm empty-state copy (title + description) shown in place of the comparison table that guides the visitor to pin a city — never an error, never a dead end.",
    produce: async () => {
      const c = await compareCopy();
      return { emptyTitle: c.emptyTitle, emptyDescription: c.emptyDescription };
    },
    rubric: [
      "CRITICAL: the copy is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and no ALL-CAPS shouting.",
      "CRITICAL: it reads as a calm empty state that GUIDES the visitor to pin a city to compare weekends — not an error, a crash, or a dead end.",
      "Tone is calm, practical, and inviting; it reads as written by a careful native speaker, not terse or robotic.",
      "It is concise — a short title plus one short guiding sentence — with no scary jargon, error codes, or filler.",
    ],
  },
  {
    id: "eval-compare-error-clarity",
    trace: ["FR-COMPARE-02", "NFR-OBS-01", "BC-BRAND-01"],
    dimension: "compare-error-clarity",
    capability: "weekend-compare",
    scenario:
      "One pinned city's weekend forecast failed to load (network error, non-OK response, or malformed payload) while the other cities loaded fine. Grade the calm inline Ukrainian copy shown for that city's column/cells (no toast, the other columns intact, no blame).",
    produce: async () => {
      const c = await compareCopy();
      // Return the user-VISIBLE copy under a descriptive key — NOT an `{error: …}`
      // envelope, which a judge reasonably read as a leaked raw error payload.
      return { perCityErrorMessage: c.error };
    },
    rubric: [
      "CRITICAL: the message is natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and does not shout in ALL-CAPS.",
      "CRITICAL: the copy is calm and blame-free — it states that this city's weekend data is unavailable without alarming the visitor or implying they did something wrong.",
      "Tone is reassuring and practical; it reads as written by a careful native speaker, never alarmist, never a raw error code or stack-trace wording.",
      "It is concise — a short phrase or one short sentence — appropriate for an inline per-column placeholder, not a full-page error.",
    ],
  },
];

// @trace FR-COMPARE-01, NFR-OBS-01, BC-BRAND-01
