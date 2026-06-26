// Pure, framework-free flag-emoji helper — design.md D2, FR-SEARCH-02 (optional
// flag). No `next/*`, no `react`, no DOM (TC-PURE-01).
//
// Maps a valid ISO-3166 alpha-2 code (exactly two ASCII letters) to its flag by
// offsetting each letter into the Unicode REGIONAL INDICATOR range (`A` →
// U+1F1E6, `B` → U+1F1E7, …). TOTAL: an absent, empty, non-two-letter, or
// non-alphabetic code returns `null`, so the UI omits the flag with NO broken
// glyph or placeholder box (the spec's "missing flag degrades cleanly" scenario).

// Exactly two ASCII letters, case-insensitive. Whitespace, digits, punctuation,
// emoji, and the wrong length all fail this gate (→ null). The anchors and length
// make "U ", "U1", "!!", "🇺🇦", "", "U", and "UKR" all non-matches.
const ALPHA2 = /^[A-Za-z]{2}$/;

// `A` (0x41) maps to the regional indicator symbol `A` (U+1F1E6).
const REGIONAL_INDICATOR_BASE = 0x1f1e6;
const ASCII_UPPER_A = 0x41;

/**
 * Build the flag emoji for an ISO-3166 alpha-2 country code, or `null`.
 *
 * Case-insensitive. Returns `null` (never throws, never a tofu/placeholder) for
 * any input that is not exactly two ASCII letters.
 */
export function flagEmoji(countryCode?: string): string | null {
  if (typeof countryCode !== "string" || !ALPHA2.test(countryCode)) return null;
  const upper = countryCode.toUpperCase();
  return String.fromCodePoint(
    REGIONAL_INDICATOR_BASE + (upper.charCodeAt(0) - ASCII_UPPER_A),
    REGIONAL_INDICATOR_BASE + (upper.charCodeAt(1) - ASCII_UPPER_A),
  );
}
