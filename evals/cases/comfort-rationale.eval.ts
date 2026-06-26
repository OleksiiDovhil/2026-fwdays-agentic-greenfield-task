// Output-eval cases for the comfort-rationale copy quality. These grade what a
// unit test cannot: whether the computed Ukrainian rationale reads as natural,
// calm, native-quality prose whose sentiment matches its comfort band
// (FR-COMFORT-03, BC-BRAND-01). The delivery bar is every dimension >= 90.
//
// Each produce() is BROWSER-FREE: it imports the pure `lib/scoring/comfort`
// module, calls `comfortScore` on representative green / yellow / red / empty
// (missing-data) inputs, and RETURNS the four rationale strings labelled by band
// (no React render). A fresh judge agent (maker != checker) scores them against
// the rubric. This file is written test-first (RED): `lib/scoring/comfort.ts`
// does not exist yet, so produce() will fail to import until the slice ships.
import type { EvalCase } from "@/evals/types";
import type { ComfortInput } from "@/lib/scoring/types";

// Representative inputs calibrated (design D2) to land in each band. The empty
// object exercises the missing-data ("not enough data") neutral rationale.
const PLEASANT: ComfortInput = {
  apparentHigh: 21,
  apparentLow: 14,
  precipProbability: 5,
  windSpeed: 2,
  cloudCover: 30,
  uvIndex: 3,
};
const SO_SO: ComfortInput = {
  apparentHigh: 14,
  apparentLow: 9,
  precipProbability: 45,
  windSpeed: 6,
  cloudCover: 70,
  uvIndex: 3,
};
const POOR: ComfortInput = {
  apparentHigh: 2,
  apparentLow: -2,
  precipProbability: 90,
  windSpeed: 12,
  cloudCover: 95,
  uvIndex: 0,
};
const MISSING = {} as ComfortInput;

// Drive the pure scorer and return the four band-labelled rationales. Fails
// LOUDLY if any rationale is blank, so the eval loop never grades empty copy.
async function comfortRationales() {
  const { comfortScore } = await import("@/lib/scoring/comfort");
  const out = {
    green: comfortScore(PLEASANT).rationale,
    yellow: comfortScore(SO_SO).rationale,
    red: comfortScore(POOR).rationale,
    missing: comfortScore(MISSING).rationale,
  };
  for (const [band, rationale] of Object.entries(out)) {
    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      throw new Error(`comfortRationales: "${band}" rationale resolved to empty copy`);
    }
  }
  return out;
}

export const cases: EvalCase[] = [
  {
    id: "eval-comfort-rationale-bands",
    trace: ["FR-COMFORT-03", "BC-BRAND-01"],
    dimension: "comfort-rationale-quality",
    capability: "comfort-score",
    scenario:
      "comfortScore produces a one-sentence Ukrainian rationale for a pleasant (green), so-so (yellow), and poor (red) day. Grade whether each sentence is natural, calm, native-quality Ukrainian whose sentiment matches its comfort band.",
    produce: async () => {
      const r = await comfortRationales();
      return {
        greenRationale: r.green,
        yellowRationale: r.yellow,
        redRationale: r.red,
      };
    },
    rubric: [
      "CRITICAL: every rationale is natural, fluent Ukrainian (not machine-translated, not English, no untranslated placeholders).",
      "CRITICAL: no rationale contains an exclamation mark (BC-BRAND-01).",
      "CRITICAL: no rationale contains an emoji or pictographic character.",
      "CRITICAL: every rationale is at most 80 characters long.",
      "CRITICAL: the sentiment matches the band — the green rationale is positive/comfortable (a good day to travel), the yellow rationale is measured/so-so (acceptable, no special upside), and the red rationale is cautioning/poor (better to postpone); a positive sentence never accompanies the red day and vice versa.",
      "Each rationale reads as ONE clean sentence — calm, practical, and concrete about the weather, not generic filler.",
      "Tone is reassuring and advisory (it helps a trip decision), never alarmist, terse, or robotic.",
      "The three sentences are clearly distinct in sentiment and read as written by a careful native speaker.",
    ],
  },
  {
    id: "eval-comfort-rationale-missing-data",
    trace: ["FR-COMFORT-03", "BC-BRAND-01"],
    dimension: "comfort-rationale-quality",
    capability: "comfort-score",
    scenario:
      "comfortScore is called on an empty input (no weather factors available). Grade the calm 'not enough data' Ukrainian rationale a visitor reads when the forecast for a day is incomplete.",
    produce: async () => {
      const r = await comfortRationales();
      return {
        missingDataRationale: r.missing,
      };
    },
    rubric: [
      "CRITICAL: the rationale is natural, fluent Ukrainian (not machine-translated, not English).",
      "CRITICAL: it contains no exclamation mark (BC-BRAND-01) and no emoji.",
      "CRITICAL: it is at most 80 characters long.",
      "CRITICAL: it reads as a calm 'not enough data to judge' / neutral verdict — NOT a positive 'pleasant day', NOT a negative 'bad day', and NOT an error string or stack/technical message.",
      "Tone is calm and honest about the uncertainty; it neither alarms nor over-promises, and reads as written by a careful native speaker.",
      "It is one short, clean sentence with no filler.",
    ],
  },
];

// @trace FR-COMFORT-03, BC-BRAND-01
