// Output-eval case for the footer joke copy quality. This grades what a unit test
// cannot: whether the curated Ukrainian joke corpus reads as natural, fluent,
// genuinely weather-themed, calmly humorous, family-friendly, on-brand prose with
// no exclamation marks (FR-JOKES-01, BC-BRAND-01, NFR-I18N-01). The delivery bar
// is every dimension >= 90.
//
// "Weather-themed" and "calm/gently humorous" are content-authoring qualities the
// spec explicitly does NOT verify with a unit assertion (no keyword list, no NLP);
// they are graded here by a fresh judge agent (maker != checker) and reviewed by a
// human. The `!`-free / non-empty mechanics ARE unit-asserted (jokes.test.ts +
// lib/i18n/i18n.test.ts); this eval grades the qualitative bar on top.
//
// produce() is BROWSER-FREE: it imports the pure `lib/i18n` dictionary and RETURNS
// the full Ukrainian `jokes.items` corpus (the exact strings the footer rotates
// through, including what `pickJoke(corpus, dailyKey(today))` shows today) — no
// React render. Authored test-first (red) before the `jokes.*` corpus shipped;
// produce() still throws if the array is ever empty/missing, so the eval loop
// never grades an empty corpus.
import type { EvalCase } from "@/evals/types";

// Resolve the Ukrainian joke corpus from the centralized dictionary, read DIRECTLY
// off the `uk` object (D3) — `t()` returns a single string leaf, not an array, so
// the corpus is the `jokes.items` array on the dictionary. The `jokes.*` namespace
// is now typed, so it is read without a cast; produce() still fails LOUDLY if it is
// ever missing/empty, so the eval loop never grades an empty corpus.
async function ukJokeCorpus(): Promise<readonly string[]> {
  const { uk } = await import("@/lib/i18n/uk");
  // Widen to `readonly string[]` so the runtime guard below stays meaningful: the
  // typed dictionary fixes the literal length, but this function must still fail
  // LOUDLY if the corpus is ever emptied, so the eval loop never grades an empty
  // corpus.
  const items: readonly string[] = uk.jokes.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      "ukJokeCorpus: uk.jokes.items is missing or empty — the curated Ukrainian joke corpus must ship before grading.",
    );
  }
  for (const [i, joke] of items.entries()) {
    if (typeof joke !== "string" || joke.trim().length === 0) {
      throw new Error(`ukJokeCorpus: uk.jokes.items[${i}] resolved to empty copy`);
    }
  }
  return items;
}

export const cases: EvalCase[] = [
  {
    id: "eval-jokes-quality-ukrainian-corpus",
    trace: ["FR-JOKES-01", "BC-BRAND-01", "NFR-I18N-01"],
    dimension: "jokes-quality",
    capability: "bottom-jokes",
    scenario:
      "The footer rotates one Ukrainian weather joke per local day from the in-repo corpus. Grade the full Ukrainian joke corpus (uk.jokes.items) a visitor reads in the footer — whether every joke is natural, fluent Ukrainian, genuinely weather/season-themed, calmly and gently humorous, family-friendly, and on-brand for a calm weather app.",
    produce: async () => {
      const corpus = await ukJokeCorpus();
      return {
        // The whole curated corpus — the judge grades every entry the footer can
        // show, not just today's pick.
        jokes: [...corpus],
        count: corpus.length,
      };
    },
    rubric: [
      "CRITICAL: every joke is natural, fluent Ukrainian written by a careful native speaker (not machine-translated, not English, no untranslated placeholders or transliteration).",
      "CRITICAL: no joke contains an exclamation mark (BC-BRAND-01).",
      "CRITICAL: no joke contains an emoji or pictographic character.",
      "CRITICAL: every joke is genuinely WEATHER- or SEASON-themed (about the weather, sky, clouds, rain, sun, wind, snow, seasons, forecasts) — not a generic joke that merely mentions weather in passing.",
      "CRITICAL: the tone is calm and gently humorous — a light smile, never loud, slapstick, crude, sarcastic, edgy, or alarmist.",
      "CRITICAL: every joke is family-friendly and on-brand for a calm weekend-weather planner — no profanity, politics, innuendo, or topical/edgy references.",
      "The jokes are distinct from one another (no near-duplicates) and read as a small but real curated set.",
      "Each joke is concise and fits a footer line — one short, clean thought, no filler, no ALL-CAPS shouting.",
      "Collectively the corpus suits the footer of a calm, practical, Ukrainian-first weather app and would not feel out of place beneath the forecast.",
    ],
  },
];

// @trace FR-JOKES-01, BC-BRAND-01, NFR-I18N-01
