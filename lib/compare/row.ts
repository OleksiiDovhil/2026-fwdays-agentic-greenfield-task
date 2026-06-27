// Pure, total compare-row model builder — design.md D3, §2.2, FR-COMPARE-02,
// TC-PURE-01.
//
// Framework-free: imports no `next/*`, no `react`, no DOM. `buildCompareRow` is a
// pure function — for EVERY input it returns a `CompareRow` and NEVER throws to the
// UI. It REUSES the locked comfort-score (`comfortScore(toComfortInput(day)).value`)
// and the locked `selectWeekend`; it does NOT reimplement scoring or weekend
// selection. The component reads this model and only formats + lays out (the
// missing/zero/extreme/out-of-range rules are decided HERE and unit-tested off the
// React tree).
import { keyOf } from "@/lib/compare/key";
import { selectWeekend } from "@/lib/compare/weekend";
import { toComfortInput, type DailyForecast, type Forecast } from "@/lib/forecast/types";
import type { Location } from "@/lib/location/types";
import { comfortScore } from "@/lib/scoring/comfort";

/**
 * The per-city forecast state the compare table holds (CompareSection's per-city
 * cache maps `keyOf(city) → CityForecastState`). `Forecast`/`DailyForecast` are
 * IMPORTED from the locked `lib/forecast/types.ts` — never redefined.
 */
export type CityForecastState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ok"; forecast: Forecast };

/**
 * One day's display cells. The numbers are carried NULLABLE, exactly as the day
 * provides them: a present `0%` precip stays `0` (rendered "0%"), an ABSENT precip
 * stays `null` (rendered the em-dash placeholder) — never a fabricated 0; negative
 * temps keep their sign. `comfortValue` is `comfortScore(toComfortInput(day)).value`
 * (an integer 0..100), or null when the day is absent. The whole `DayCells` is
 * `null` when that day is out of the weekend window.
 */
export type DayCells = {
  tempMax: number | null;
  tempMin: number | null;
  precipProbability: number | null;
  comfortValue: number | null;
} | null;

/**
 * The compare table column model. `status`:
 *   - "ok"          → at least one weekend day is in the window (cells built);
 *   - "out-of-range"→ status was ok but NEITHER Sat nor Sun is in the window;
 *   - "loading"     → the city's forecast is still in flight (not-ready cells);
 *   - "failed"      → the city's forecast could not load (not-ready cells).
 * `key` is the rounded identity and `name` the city name — both ALWAYS present, so
 * the column can render its header (and the make-active control) in every state.
 */
export type CompareRow = {
  key: string;
  name: string;
  status: "ok" | "loading" | "failed" | "out-of-range";
  saturday: DayCells;
  sunday: DayCells;
};

/** Build one day's cells from a forecast day, carrying nullable values as-is. */
function cellsFor(day: DailyForecast | null): DayCells {
  if (!day) return null;
  return {
    // Carried as-is: a present 0 stays 0; an absent value stays null (no coercion).
    tempMax: typeof day.tempMax === "number" ? day.tempMax : null,
    tempMin: typeof day.tempMin === "number" ? day.tempMin : null,
    precipProbability:
      typeof day.precipProbability === "number" ? day.precipProbability : null,
    // REUSE comfort-score — never a local scoring copy (the displayed score equals
    // the value comfort-score produces for the same day).
    comfortValue: comfortScore(toComfortInput(day)).value,
  };
}

/**
 * `buildCompareRow(city, state)` — the pure, TOTAL model the compare table renders.
 * For `ok`, select the weekend; if BOTH Sat and Sun are out of the window →
 * `out-of-range`. For `loading`/`failed`, the matching status with not-ready cells.
 * Never throws (total over null / short / failed / loading / malformed input).
 */
export function buildCompareRow(
  city: Location,
  state: CityForecastState,
): CompareRow {
  const key = keyOf(city);
  const name = city.name;

  if (state.status === "loading" || state.status === "failed") {
    return { key, name, status: state.status, saturday: null, sunday: null };
  }

  // status === "ok": select the weekend (total over a malformed forecast).
  const { saturday, sunday } = selectWeekend(state.forecast);
  if (saturday === null && sunday === null) {
    // Neither weekend day in the 7-day window → the calm out-of-range posture.
    return { key, name, status: "out-of-range", saturday: null, sunday: null };
  }

  return {
    key,
    name,
    status: "ok",
    saturday: cellsFor(saturday),
    sunday: cellsFor(sunday),
  };
}
