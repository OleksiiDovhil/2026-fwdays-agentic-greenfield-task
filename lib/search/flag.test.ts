// Test-first (RED): asserts the SPECIFIED flag-emoji contract pinned by design.md
// D2 (the optional `flagEmoji`) and the city-search spec "Suggestion content"
// ("A flag emoji SHALL be shown when the country code is available and SHALL be
// omitted gracefully when it is not, with no broken glyph or placeholder box").
// The implementation (`lib/search/flag.ts`) does NOT exist yet — these MUST fail
// because the module is missing, not because of weak assertions.
//
// The planned surface (D2, tasks 2.3): a pure, framework-free
//   flagEmoji(countryCode?: string): string | null
// mapping a valid ISO-3166 alpha-2 code (two ASCII letters) to its flag via the
// Unicode regional-indicator offset (`A` -> U+1F1E6). TOTAL: an absent, empty,
// non-two-letter, or non-alphabetic code returns null (no broken glyph).
//
// @trace FR-SEARCH-02
import { describe, it, expect } from "vitest";
import { flagEmoji } from "@/lib/search/flag";

// Build a flag from a 2-letter code the same way the spec defines it, so the
// expected value is derived from the rule (not a copy-pasted glyph that could be
// mistyped). `A` (0x41) maps to the regional indicator `A` (U+1F1E6).
const REGIONAL_INDICATOR_BASE = 0x1f1e6;
const flagFromCode = (code: string): string =>
  String.fromCodePoint(
    ...[...code.toUpperCase()].map(
      (ch) => REGIONAL_INDICATOR_BASE + (ch.charCodeAt(0) - 0x41),
    ),
  );

describe("lib/search/flag — flagEmoji maps a valid alpha-2 code (FR-SEARCH-02)", () => {
  it("maps UA to the Ukrainian regional-indicator flag", () => {
    const ua = flagEmoji("UA");
    expect(ua).toBe(flagFromCode("UA"));
    // The well-known literal, asserted directly so a wrong offset is obvious.
    expect(ua).toBe("\u{1F1FA}\u{1F1E6}"); // 🇺🇦
    // It is exactly two regional-indicator code points (no extra chars / box).
    expect([...(ua ?? "")]).toHaveLength(2);
  });

  it("maps other valid codes correctly (GB, PL, US)", () => {
    expect(flagEmoji("GB")).toBe(flagFromCode("GB"));
    expect(flagEmoji("PL")).toBe(flagFromCode("PL"));
    expect(flagEmoji("US")).toBe(flagFromCode("US"));
  });

  it("is case-insensitive (lower / mixed case yields the same flag)", () => {
    const upper = flagEmoji("UA");
    expect(flagEmoji("ua")).toBe(upper);
    expect(flagEmoji("uA")).toBe(upper);
    expect(flagEmoji("Ua")).toBe(upper);
  });
});

describe("lib/search/flag — TOTAL: bad/empty codes return null (no broken glyph)", () => {
  it("returns null for an absent or empty code", () => {
    expect(flagEmoji()).toBeNull();
    expect(flagEmoji(undefined)).toBeNull();
    expect(flagEmoji("")).toBeNull();
    expect(flagEmoji("   ")).toBeNull();
  });

  it("returns null for a one-letter or three-letter code", () => {
    expect(flagEmoji("U")).toBeNull();
    expect(flagEmoji("UKR")).toBeNull();
  });

  it("returns null for non-alphabetic codes (digits, punctuation, mixed)", () => {
    expect(flagEmoji("12")).toBeNull();
    expect(flagEmoji("U1")).toBeNull();
    expect(flagEmoji("!!")).toBeNull();
    expect(flagEmoji("U-")).toBeNull();
    expect(flagEmoji("--")).toBeNull();
  });

  it("returns null rather than throwing on hostile-ish input", () => {
    expect(() => flagEmoji("🇺🇦")).not.toThrow(); // already a flag, not alpha-2
    expect(flagEmoji("🇺🇦")).toBeNull();
    expect(() => flagEmoji("ABCDEF")).not.toThrow();
    expect(flagEmoji("ABCDEF")).toBeNull();
  });

  it("never emits a literal placeholder box / tofu for a bad code", () => {
    // A bad code must yield null, NOT a replacement-character or empty-box string.
    for (const bad of ["", " ", "1", "X", "XYZ", "00", "??"]) {
      const out = flagEmoji(bad);
      expect(out).toBeNull();
    }
  });
});
