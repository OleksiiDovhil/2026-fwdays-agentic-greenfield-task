// Test-first (RED): asserts the SPECIFIED rationale contract pinned by design.md
// D4 and spec "Ukrainian rationale, single sentence, max 80 chars, no emoji".
// The implementation (the rationale generator inside `lib/scoring/comfort.ts`)
// does NOT exist yet — these MUST fail because the behavior is unimplemented.
// Never weaken a test to make it pass.
//
// Contract under test (D4, FR-COMFORT-03, BC-BRAND-01):
//   - rationale is a single, non-empty Ukrainian (Cyrillic) sentence, <= 80 chars;
//   - contains NO emoji / pictographic char and NO "!" (calm tone);
//   - is BAND-MATCHED: the sentence is drawn from the phrasing set for the value's
//     own band (green / yellow / red) — or the distinct neutral "not enough data"
//     set for an all-missing input — and the four sets are pairwise DISJOINT by
//     signature lexeme, so the band is decidable from the value alone.
//
// The band-membership contract is encoded from design D4's signature lexeme sets:
// a green value's rationale must contain a GREEN signature lexeme and NO yellow/
// red/neutral signature lexeme, etc. (membership-by-band + cross-set disjointness).
//
// @trace FR-COMFORT-03, BC-BRAND-01
import { describe, it, expect } from "vitest";
import { comfortScore, bandOf } from "@/lib/scoring/comfort";
import type { ComfortInput } from "@/lib/scoring/types";

// --- design D4 signature lexemes, per disjoint phrasing set ------------------
// Each set's sentences carry at least one of these signature words; the sets share
// NO signature lexeme (D4 "pairwise disjoint by signature lexeme"). A rationale is
// "in band X" iff it contains a signature lexeme of set X.
const SIGNATURE = {
  green: ["приємний", "приємн", "комфортно", "комфортн", "гарна погода", "гарна", "варто"],
  yellow: ["прийнятн", "помірн", "загалом непогано", "непогано", "можна, але", "згодиться"],
  // NB: the red signature lists only words the red corpus actually uses. The
  // negation forms «неприємно»/«некомфортн» were removed: Ukrainian's «не-» prefix
  // makes them superstrings of green's «приємн»/«комфортн», which made the
  // pairwise-disjointness assertion below unsatisfiable by ANY corpus (a fixture
  // bug, not an implementation defect). The shipped red sentences use «погані
  // умови»/«несприятлив»/«непривітн»/«краще перенести», all still covered here.
  red: ["погані умови", "несприятлив", "краще перенести", "непривітн", "невдалий"],
  neutral: ["бракує даних", "недостатньо даних", "складно оцінити", "бракує", "недостатньо"],
} as const;
type Band4 = keyof typeof SIGNATURE;

// True iff `text` contains any signature lexeme of `band`.
function hasSignatureOf(text: string, band: Band4): boolean {
  const lower = text.toLowerCase();
  return SIGNATURE[band].some((lex) => lower.includes(lex.toLowerCase()));
}

// Emoji / pictographic detector per design D4 (`/\p{Extended_Pictographic}/u`).
const EMOJI = /\p{Extended_Pictographic}/u;
// Cyrillic presence (the rationale must read as Ukrainian).
const CYRILLIC = /[Ѐ-ӿ]/;

// Representative inputs that land in each band (calibrated against design D2).
const GREEN_INPUT: ComfortInput = {
  apparentHigh: 21, apparentLow: 14, precipProbability: 5, windSpeed: 2, cloudCover: 30, uvIndex: 3,
};
const YELLOW_INPUT: ComfortInput = {
  // moderate: enough penalty to drop into 40..69 but not red.
  apparentHigh: 14, apparentLow: 9, precipProbability: 45, windSpeed: 6, cloudCover: 70, uvIndex: 3,
};
const RED_INPUT: ComfortInput = {
  apparentHigh: 2, apparentLow: -2, precipProbability: 90, windSpeed: 12, cloudCover: 95, uvIndex: 0,
};
const MISSING_INPUT: ComfortInput = {} as ComfortInput;

// A broad sweep across the whole 0..100 surface to assert the invariants hold for
// EVERY producible rationale, not just the four representatives.
function sweepInputs(): ComfortInput[] {
  const out: ComfortInput[] = [MISSING_INPUT, GREEN_INPUT, YELLOW_INPUT, RED_INPUT];
  for (let feels = -20; feels <= 42; feels += 2) {
    for (const precip of [0, 25, 50, 75, 100]) {
      for (const wind of [0, 5, 12]) {
        out.push({
          apparentHigh: feels,
          apparentLow: feels - 6,
          precipProbability: precip,
          windSpeed: wind,
          cloudCover: 40,
          uvIndex: 4,
        });
      }
    }
  }
  return out;
}

describe("rationale — base invariants across the full factor range (FR-COMFORT-03, BC-BRAND-01)", () => {
  const inputs = sweepInputs();

  it("every rationale is a non-empty string", () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      expect(rationale.trim().length, `empty rationale for ${JSON.stringify(input)}`).toBeGreaterThan(0);
    }
  });

  it("every rationale is <= 80 characters", () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      expect(rationale.length, `over 80 chars: "${rationale}"`).toBeLessThanOrEqual(80);
    }
  });

  it("every rationale is written in Ukrainian (contains Cyrillic)", () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      expect(CYRILLIC.test(rationale), `not Cyrillic: "${rationale}"`).toBe(true);
    }
  });

  it("no rationale contains an emoji / pictographic character (D4)", () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      expect(EMOJI.test(rationale), `emoji found: "${rationale}"`).toBe(false);
    }
  });

  it('no rationale contains an exclamation mark "!" (BC-BRAND-01)', () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      expect(rationale.includes("!"), `"!" found: "${rationale}"`).toBe(false);
    }
  });

  it("each rationale reads as a single sentence (no internal sentence breaks)", () => {
    for (const input of inputs) {
      const { rationale } = comfortScore(input);
      // One sentence: no full stop / question mark before the final character.
      const interior = rationale.slice(0, -1);
      expect(/[.?]/.test(interior), `multiple sentences: "${rationale}"`).toBe(false);
    }
  });
});

describe("rationale — band-matched membership (FR-COMFORT-03)", () => {
  it("a green value's rationale belongs to the GREEN set and no other", () => {
    const { value, rationale } = comfortScore(GREEN_INPUT);
    expect(bandOf(value)).toBe("green");
    expect(hasSignatureOf(rationale, "green"), `green rationale: "${rationale}"`).toBe(true);
    expect(hasSignatureOf(rationale, "yellow")).toBe(false);
    expect(hasSignatureOf(rationale, "red")).toBe(false);
    expect(hasSignatureOf(rationale, "neutral")).toBe(false);
  });

  it("a yellow value's rationale belongs to the YELLOW set and no other", () => {
    const { value, rationale } = comfortScore(YELLOW_INPUT);
    expect(bandOf(value)).toBe("yellow");
    expect(hasSignatureOf(rationale, "yellow"), `yellow rationale: "${rationale}"`).toBe(true);
    expect(hasSignatureOf(rationale, "green")).toBe(false);
    expect(hasSignatureOf(rationale, "red")).toBe(false);
    expect(hasSignatureOf(rationale, "neutral")).toBe(false);
  });

  it("a red value's rationale belongs to the RED set and no other", () => {
    const { value, rationale } = comfortScore(RED_INPUT);
    expect(bandOf(value)).toBe("red");
    expect(hasSignatureOf(rationale, "red"), `red rationale: "${rationale}"`).toBe(true);
    expect(hasSignatureOf(rationale, "green")).toBe(false);
    expect(hasSignatureOf(rationale, "yellow")).toBe(false);
    expect(hasSignatureOf(rationale, "neutral")).toBe(false);
  });

  it("an all-missing input uses the distinct NEUTRAL 'not enough data' set (regardless of mid-band value)", () => {
    const { rationale } = comfortScore(MISSING_INPUT);
    expect(hasSignatureOf(rationale, "neutral"), `neutral rationale: "${rationale}"`).toBe(true);
    expect(hasSignatureOf(rationale, "green")).toBe(false);
    expect(hasSignatureOf(rationale, "yellow")).toBe(false);
    expect(hasSignatureOf(rationale, "red")).toBe(false);
  });

  it("across the sweep, every non-missing rationale matches the signature set of its OWN value-band exactly", () => {
    // The hard guarantee (D4): the band is decidable from the value alone. For each
    // input that produces real data, the rationale carries its own band's signature
    // lexeme and none from the OTHER two value-bands (neutral excluded — it is the
    // missing-data set, exercised separately above).
    for (const input of sweepInputs()) {
      // Skip the explicit all-missing input — it is the neutral set, asserted above.
      if (Object.keys(input as object).length === 0) continue;
      const { value, rationale } = comfortScore(input);
      const band = bandOf(value) as "green" | "yellow" | "red";
      const others = (["green", "yellow", "red"] as const).filter((b) => b !== band);
      expect(
        hasSignatureOf(rationale, band),
        `band=${band} value=${value} missing own signature: "${rationale}"`,
      ).toBe(true);
      for (const other of others) {
        expect(
          hasSignatureOf(rationale, other),
          `band=${band} value=${value} leaked ${other} signature: "${rationale}"`,
        ).toBe(false);
      }
    }
  });
});

describe("rationale — phrasing sets are pairwise DISJOINT by signature lexeme (D4)", () => {
  // The contract's structural backbone: no signature lexeme may belong to two sets,
  // else "band decidable from value alone" collapses. This pins the lexeme table
  // the implementation's sentence corpus must respect.
  it("no signature lexeme appears in two of the four sets", () => {
    const bands: Band4[] = ["green", "yellow", "red", "neutral"];
    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        for (const lex of SIGNATURE[bands[i]]) {
          for (const other of SIGNATURE[bands[j]]) {
            const a = lex.toLowerCase();
            const b = other.toLowerCase();
            expect(
              a.includes(b) || b.includes(a),
              `lexeme overlap between ${bands[i]} ("${lex}") and ${bands[j]} ("${other}")`,
            ).toBe(false);
          }
        }
      }
    }
  });
});
