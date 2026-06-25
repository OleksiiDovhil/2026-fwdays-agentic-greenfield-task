// Output-eval cases for the app-shell copy quality. These grade what a unit
// test cannot: whether the empty-state and error/empty copy is natural,
// Ukrainian, calm, blame-free, and actionable (NFR-OBS-01, BC-BRAND-01).
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and
// RETURNS the user-visible copy strings (no React render). The eval-suite
// workflow feeds the returned strings to a fresh judge agent (maker != checker)
// which scores them against the rubric. The delivery bar is every dimension >= 90.
import type { EvalCase } from "@/evals/types";

// Resolve the shell copy strings from the centralized dictionary. Kept inside a
// helper so the case stays browser-free and only touches the pure i18n layer.
// The keys are all valid `MessageKey` paths, so no `as never` cast is needed —
// removing the cast means a future key rename would fail to type-check here.
async function shellCopy() {
  const { t } = await import("@/lib/i18n");
  const copy = {
    heroHeading: t("shell.hero.title"),
    heroBody: t("shell.hero.subtitle"),
    errorTitle: t("shell.notice.error.title"),
    errorDescription: t("shell.notice.error.description"),
    emptyTitle: t("shell.notice.empty.title"),
    emptyDescription: t("shell.notice.empty.description"),
  };
  // Fail LOUDLY if any key resolves to blank (e.g. a future missing/renamed key),
  // so the eval loop never silently grades empty copy.
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`shellCopy: "${key}" resolved to empty copy`);
    }
  }
  return copy;
}

export const cases: EvalCase[] = [
  {
    id: "eval-shell-empty-state-clarity",
    trace: ["NFR-OBS-01", "BC-BRAND-01"],
    dimension: "empty-state-clarity",
    capability: "app-shell",
    scenario:
      "First load with no active location. Grade the empty-state hero copy and the shared empty-state Notice copy a visitor reads before searching a city.",
    produce: async () => {
      const c = await shellCopy();
      return {
        heroHeading: c.heroHeading,
        heroBody: c.heroBody,
        emptyNoticeTitle: c.emptyTitle,
        emptyNoticeDescription: c.emptyDescription,
      };
    },
    rubric: [
      "CRITICAL: every string is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: no string contains an exclamation mark (BC-BRAND-01).",
      "CRITICAL: the copy explains the next step — that the visitor should search for / enter a city to see its weather — rather than leaving an unexplained blank.",
      "The hero heading is short and welcoming and frames the product as a weekend weather / trip planner.",
      "Tone is calm, practical, and reassuring; it reads as written by a careful native speaker, not terse or robotic.",
      "The empty-state Notice reads as a deliberate, helpful state (what to do now), never as an error or a dead end.",
      "Copy is concise and free of filler, jargon, and ALL-CAPS shouting.",
    ],
  },
  {
    id: "eval-shell-error-clarity",
    trace: ["NFR-OBS-01", "BC-BRAND-01"],
    dimension: "error-clarity",
    capability: "app-shell",
    scenario:
      "A capability inside the shell fails to load data and renders the shared error Notice. Grade the error title + description the visitor sees inline.",
    produce: async () => {
      const c = await shellCopy();
      return {
        errorTitle: c.errorTitle,
        errorDescription: c.errorDescription,
      };
    },
    rubric: [
      "CRITICAL: the error copy is calm and blame-free — it never blames the user and never shouts (no exclamation marks, no ALL-CAPS).",
      "CRITICAL: the message is in natural, fluent Ukrainian.",
      "CRITICAL: the message is actionable — it tells the visitor what they can do next (e.g. try again / retry shortly), not just that something broke.",
      "It states, plainly and without scary jargon or stack-trace wording, that data could not be loaded right now.",
      "Tone is reassuring and practical: it implies the situation is temporary and recoverable, and that the rest of the app still works.",
      "It is concise — one short title plus one or two short sentences — with no generic '500'/'error code' boilerplate.",
    ],
  },
];

// @trace NFR-OBS-01, BC-BRAND-01
