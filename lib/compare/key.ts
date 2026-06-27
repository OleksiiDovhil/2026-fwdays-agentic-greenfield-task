// The rounded-coordinate identity, re-exported from its shared home
// `lib/location/key.ts` — design.md D1/D3, FR-COMPARE-01, TC-PURE-01.
//
// "One identity" is now LITERAL: the single `keyOf` lives in `lib/location` (a
// Location identity's natural home) and BOTH `ForecastSection` and the compare
// slice import it. This module re-exports it so the established `@/lib/compare/key`
// import path (PinProvider, CompareSection, buildCompareRow) stays stable.
export { keyOf } from "@/lib/location/key";
