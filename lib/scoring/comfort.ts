// Pure, total, deterministic comfort scoring — design.md D1–D4, D6, D7,
// FR-COMFORT-01/02/03/04/05, TC-PURE-01.
//
// Framework-free: imports no `next/*`, no `react`, no DOM globals, no
// `Date.now()`, no `Math.random()`. Every export is a pure function — identical
// inputs yield identical outputs and nothing here mutates its arguments or emits
// console noise. This is the math + presentation contract; `add-forecast` owns
// the fetch and the grid that consumes these.
import type { ComfortInput } from "./types";

// ── Neutral mid-band fallbacks (design D3) ──────────────────────────────────
// A missing / unparseable factor contributes its NEUTRAL value — never the best
// or worst case — so an all-missing day lands mid-band (neither 0 nor 100) and a
// partial day penalises only the factors it actually provides.
const NEUTRAL = {
  feels: 21, // the comfort centre: no temperature penalty
  precip: 35, // a middling chance, not 0 and not 100
  wind: 3, // the comfort threshold edge: no wind penalty
  cloud: 50, // half cover
  uv: 4, // just inside the safe band
} as const;

// ── Scoring constants (design D2) ───────────────────────────────────────────
// Tunable in ONE place without an API change. Worsening any single factor (past
// its dead-band) can only raise that factor's penalty and therefore strictly
// lower the score — the spec's monotonicity guarantee.
const T_IDEAL = 21; // feels-like comfort centre (°C)
const T_DEADBAND = 1; // ~1° flat dead-band around the ideal
const T_COLD_WEIGHT = 1.6; // cold penalised slightly harder than heat
const T_HOT_WEIGHT = 1.4;
const PRECIP_WEIGHT = 0.45; // per percent of precipitation probability
const WIND_FREE = 3; // m/s of free, comfortable breeze
const WIND_WEIGHT = 3.5; // per m/s beyond the free breeze
const CLOUD_WEIGHT = 0.12; // per percent of cloud cover (mild)
const UV_FREE = 5; // UV index that is still comfortable
const UV_WEIGHT = 4; // per UV point beyond the safe band

// ── Band thresholds (design D6) ─────────────────────────────────────────────
const GREEN_MIN = 70; // value >= 70 -> green
const YELLOW_MIN = 40; // 40 <= value <= 69 -> yellow; < 40 -> red

export type ComfortBand = "green" | "yellow" | "red";

export type ComfortResult = {
  /** Integer in the inclusive range 0..100 (Math.round then clamp). */
  value: number;
  /** A single calm Ukrainian sentence, <= 80 chars, no emoji, no "!". */
  rationale: string;
};

/**
 * Coerce a possibly-missing factor to a usable number: returns `raw` only when
 * it is a finite number, otherwise the neutral mid-band `fallback` (design D3).
 * This is the single coercion point that makes `comfortScore` total over `null`,
 * `undefined`, `NaN`, and absent fields.
 */
export function numericOr(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

/** True iff `raw` is a usable (finite-number) factor value. */
function isPresent(raw: unknown): boolean {
  return typeof raw === "number" && Number.isFinite(raw);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * `bandOf(value)` — comfort band at the EXACT boundaries (design D6):
 * `value >= 70 -> "green"`, `40 <= value <= 69 -> "yellow"`, `< 40 -> "red"`
 * (so 70 green, 69 yellow, 40 yellow, 39 red). Pure; used by the badge and the
 * weekend summary.
 */
export function bandOf(value: number): ComfortBand {
  if (value >= GREEN_MIN) return "green";
  if (value >= YELLOW_MIN) return "yellow";
  return "red";
}

// ── Band-matched Ukrainian rationale corpus (design D4, BC-BRAND-01) ─────────
// Four disjoint phrasing sets; the active set is chosen by the value's band (or
// the neutral "not enough data" set when every factor fell back). Each sentence
// is one sentence, <= 80 chars, Cyrillic, no emoji, no "!". The sets share no
// signature lexeme, so a reader (or test) can decide the band from the value
// alone. NONE of the red sentences embed a green stem (e.g. avoid "некомфортна",
// which contains "комфортн") so substring band-membership stays clean.
const RATIONALES: Record<"green" | "yellow" | "red" | "neutral", readonly string[]> = {
  green: [
    "Приємний день для поїздки, погода комфортна.",
    "Гарна погода надворі, чудово підходить для прогулянки.",
    "Комфортно й затишно, цілком вдалий день для подорожі.",
  ],
  yellow: [
    "Погода прийнятна, але без особливого комфорту.",
    "Помірні умови, на поїздку згодиться, переваг небагато.",
    "Загалом непогано, проте є дрібні незручності.",
  ],
  red: [
    "Погані умови надворі, поїздку краще перенести.",
    "Несприятлива погода, час для прогулянки невдалий.",
    "Непривітна погода, краще перенести поїздку на потім.",
  ],
  neutral: [
    "Поки бракує даних, щоб оцінити погоду для поїздки.",
    "Недостатньо даних про погоду, щоб дати пораду.",
    "Складно оцінити погоду, даних поки замало.",
  ],
} as const;

/**
 * Deterministically pick one sentence from the band's set. Selection is a pure
 * function of the value (`value % len`) — never `Math.random()` — so identical
 * inputs always yield an identical rationale (FR-COMFORT-01).
 */
function rationaleFor(value: number, dataMissing: boolean): string {
  const set = dataMissing ? RATIONALES.neutral : RATIONALES[bandOf(value)];
  const index = ((Math.trunc(value) % set.length) + set.length) % set.length;
  return set[index];
}

/**
 * `comfortScore(daily)` — pure, total, deterministic comfort score for a single
 * day (design D1/D2/D3, FR-COMFORT-01/02).
 *
 * Start at 100 and subtract documented per-factor penalties (temperature with a
 * ~1° dead-band scored on the apparent high, precipitation probability, wind
 * above a free breeze, cloud cover, UV above a safe band). `value` is the rounded
 * raw clamped to the inclusive integer range 0..100; `rationale` is a band-matched
 * Ukrainian sentence (or the neutral "not enough data" sentence when every factor
 * is missing). NEVER throws; never mutates `daily` (reads fields into locals only).
 */
export function comfortScore(daily: ComfortInput | null | undefined): ComfortResult {
  const d = daily ?? {};

  // Read each factor into a local through the single coercion point (no mutation).
  const feelsHigh = numericOr(d.apparentHigh, NEUTRAL.feels);
  const feelsLow = numericOr(d.apparentLow, NEUTRAL.feels);
  const precip = numericOr(d.precipProbability, NEUTRAL.precip);
  const wind = numericOr(d.windSpeed, NEUTRAL.wind);
  const cloud = numericOr(d.cloudCover, NEUTRAL.cloud);
  const uv = numericOr(d.uvIndex, NEUTRAL.uv);

  // dataMissing drives the neutral rationale set: true only when EVERY factor
  // fell back to its neutral (an all-missing / null / {} input). A partial day
  // that supplies even one factor is scored and labelled by its band.
  const dataMissing =
    !isPresent(d.apparentHigh) &&
    !isPresent(d.apparentLow) &&
    !isPresent(d.precipProbability) &&
    !isPresent(d.windSpeed) &&
    !isPresent(d.cloudCover) &&
    !isPresent(d.uvIndex);

  // Temperature: comfort peak ~20-22°C with a flat ~1° dead-band; cold weighted
  // slightly harder than heat. Scored on the trip-relevant apparent HIGH; a harsh
  // night LOW (below the ideal) widens the dead-band penalty only when it is the
  // colder of the two, so the daytime value never gets a free pass on a frosty
  // night without ever rewarding the night.
  const representative = feelsHigh;
  const tempDev = Math.max(0, Math.abs(representative - T_IDEAL) - T_DEADBAND);
  const tempWeight = representative < T_IDEAL ? T_COLD_WEIGHT : T_HOT_WEIGHT;
  const nightDev =
    feelsLow < T_IDEAL ? Math.max(0, Math.abs(feelsLow - T_IDEAL) - T_DEADBAND) : 0;
  // The night can only ADD harshness (max of day/night cold deviation), never
  // reduce the daytime penalty — keeps the per-factor term monotone.
  const effectiveDev = Math.max(tempDev, representative < T_IDEAL ? nightDev : 0);
  const tempPenalty = effectiveDev * tempWeight;

  const precipPenalty = precip * PRECIP_WEIGHT;
  const windPenalty = Math.max(0, wind - WIND_FREE) * WIND_WEIGHT;
  const cloudPenalty = cloud * CLOUD_WEIGHT;
  const uvPenalty = Math.max(0, uv - UV_FREE) * UV_WEIGHT;

  const raw =
    100 - (tempPenalty + precipPenalty + windPenalty + cloudPenalty + uvPenalty);
  const value = clamp(Math.round(raw), 0, 100);

  return { value, rationale: rationaleFor(value, dataMissing) };
}

// ── Upcoming-weekend selector (design D7, FR-COMFORT-05) ─────────────────────

export type WeekendDay = { time?: string | null; value: number };

export type UpcomingWeekend = {
  /** Integer average of the present weekend days, or null when none are in range. */
  value: number | null;
  /** The Saturday's value, when a Saturday is in the window. */
  saturday?: number;
  /** The Sunday's value, when a Sunday is in the window. */
  sunday?: number;
  /** How many weekend days were found: both, one, or none. */
  available: "both" | "one" | "none";
};

/**
 * Parse a "YYYY-MM-DD" calendar-date string into its weekday (0=Sun … 6=Sat) and
 * its UTC epoch-day (whole days since 1970-01-01), or null for a missing /
 * malformed string. This is intentionally clock-independent: the string is
 * already the location's local calendar date (forecast pins timezone=auto), so
 * reading it through a FIXED `Date.UTC(y, m-1, d)` avoids the timezone shift that
 * `new Date("YYYY-MM-DD").getDay()` would introduce for a west-of-UTC viewer.
 * NEVER uses `toISOString()` or the viewer's local `Date` (AGENTS.md). The
 * epoch-day lets the selector test calendar adjacency (Saturday + 1 day ==
 * Sunday) robustly across month/year boundaries.
 */
function parseLocalDate(
  time: string | null | undefined,
): { weekday: number; epochDay: number } | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  const weekday = new Date(utc).getUTCDay();
  if (Number.isNaN(weekday)) return null;
  return { weekday, epochDay: Math.floor(utc / 86_400_000) };
}

/**
 * `upcomingWeekend(days)` — pure selector over `{ time, value }[]` (design D7).
 *
 * Finds the FIRST Saturday (weekday 6) in the window and averages it ONLY with
 * the Sunday whose calendar date is the very next day (Saturday + 1) — so the two
 * averaged days are always the SAME weekend, never a leading Sunday paired with a
 * different week's trailing Saturday. Degrades calmly:
 *   - first Saturday + its consecutive Sunday present -> "both" (integer average);
 *   - a Saturday whose next-day Sunday is absent          -> "one" (the Saturday);
 *   - no Saturday but a Sunday present (today=Sunday tail) -> "one" (first Sunday);
 *   - neither                                              -> `value: null`, "none".
 * Integer (`Math.round`) value in 0..100. No `NaN`, never throws.
 */
export function upcomingWeekend(days: readonly WeekendDay[]): UpcomingWeekend {
  // First Saturday in the window, with its epoch-day so we can find its Sunday.
  let satValue: number | undefined;
  let satEpochDay: number | undefined;
  // First Sunday in the window (fallback for the today=Sunday tail case).
  let firstSunValue: number | undefined;
  // Map epoch-day -> Sunday value, so we can look up "Saturday + 1" directly.
  const sundaysByEpochDay = new Map<number, number>();

  for (const day of days ?? []) {
    if (!day || typeof day.value !== "number" || !Number.isFinite(day.value)) continue;
    const parsed = parseLocalDate(day.time);
    if (!parsed) continue;
    if (parsed.weekday === 6) {
      if (satValue === undefined) {
        satValue = day.value;
        satEpochDay = parsed.epochDay;
      }
    } else if (parsed.weekday === 0) {
      if (firstSunValue === undefined) firstSunValue = day.value;
      if (!sundaysByEpochDay.has(parsed.epochDay)) {
        sundaysByEpochDay.set(parsed.epochDay, day.value);
      }
    }
  }

  if (satValue !== undefined) {
    // Pair the Saturday only with ITS consecutive Sunday (the next calendar day).
    const consecutiveSunday = sundaysByEpochDay.get((satEpochDay as number) + 1);
    if (consecutiveSunday !== undefined) {
      return {
        value: Math.round((satValue + consecutiveSunday) / 2),
        saturday: satValue,
        sunday: consecutiveSunday,
        available: "both",
      };
    }
    // A Saturday whose Sunday is not in range — degrade to the Saturday alone.
    return { value: Math.round(satValue), saturday: satValue, available: "one" };
  }

  // No Saturday in the window: a present Sunday is this weekend's tail.
  if (firstSunValue !== undefined) {
    return { value: Math.round(firstSunValue), sunday: firstSunValue, available: "one" };
  }

  return { value: null, available: "none" };
}
