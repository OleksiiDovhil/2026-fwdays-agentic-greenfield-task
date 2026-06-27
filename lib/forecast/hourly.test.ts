// Test-first (RED): asserts the SPECIFIED "next N hours" slice pinned by design.md
// D2 and the forecast spec ("Render a 48-hour hourly temperature line chart" —
// "When fewer than 48 hourly points are available, the chart SHALL plot the hours
// it has rather than fail"). The implementation (`lib/forecast/hourly.ts`) does NOT
// exist yet — these MUST fail because the module is MISSING, not because of weak
// assertions. Never weaken a test to make it pass.
//
// Contract under test (D2, tasks 2.4, 5.3):
//   `nextHours(hourly: HourlyPoint[], count = 48, now = Date.now()): HourlyPoint[]`
//   slices the next `count` future hours FROM `now` out of the parsed hourly arrays.
//   `now` is an INJECTED param so the test is deterministic (TC-PURE-01 forbids a
//   hidden clock read in the pure layer; tests always inject `now`). Fewer than
//   `count` future points → return the ones it has. An empty series → [].
//   Comparison parses each point's local `time` (no toISOString, no viewer-TZ
//   recompute), consistent with the comfort-score date discipline.
//
// Framework-free (TC-PURE-01): no `next/*`, no `react`, no DOM.
//
// @trace FR-FORECAST-03
import { describe, it, expect } from "vitest";
import type { HourlyPoint } from "@/lib/forecast/types";

async function loadHourly() {
  return import("@/lib/forecast/hourly");
}

// Build a contiguous hourly series of ISO-local "YYYY-MM-DDTHH:00" strings
// starting at a fixed base epoch, with a temperature that encodes the hour index
// so the SELECTED points can be asserted precisely. Local strings (no zone
// suffix) mirror Open-Meteo's timezone=auto output.
const BASE = Date.UTC(2026, 5, 27, 0, 0, 0); // 2026-06-27T00:00Z as the series start

function isoLocalHour(index: number): string {
  const d = new Date(BASE + index * 3_600_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:00`;
}

function series(length: number): HourlyPoint[] {
  return Array.from({ length }, (_, i) => ({
    time: isoLocalHour(i),
    temperature: i, // temperature == hour index → trivial to assert selection
  }));
}

// `now` injected for determinism — we point it exactly AT a known hour so the
// slice boundary is unambiguous in the assertions below.
function nowAtHour(index: number): number {
  return BASE + index * 3_600_000;
}

describe("nextHours — picks the next 48 future points relative to an injected now (FR-FORECAST-03)", () => {
  it("returns exactly 48 points starting at/after now from a long (72-point) series", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    // now == hour 10 of the series.
    const picked = nextHours(all, 48, nowAtHour(10));

    expect(picked).toHaveLength(48);
    // The slice starts at the first point that is NOT in the past (hour 10) and is
    // contiguous from there — proven by the encoded temperatures.
    expect(picked[0].temperature).toBe(10);
    expect(picked[0].time).toBe(isoLocalHour(10));
    expect(picked[47].temperature).toBe(57); // 10 + 48 - 1
    // No PAST point leaks in: every selected hour index is >= the now-hour.
    for (const p of picked) {
      expect((p.temperature as number) >= 10, "no past hour may leak into the slice").toBe(true);
    }
  });

  it("skips PAST points: a now late in the series yields only the remaining future hours", async () => {
    const { nextHours } = await loadHourly();
    const all = series(60);
    // now == hour 40 → only hours 40..59 (20 points) are in the future.
    const picked = nextHours(all, 48, nowAtHour(40));
    expect(picked).toHaveLength(20);
    expect(picked[0].temperature).toBe(40);
    expect(picked[picked.length - 1].temperature).toBe(59);
  });

  it("respects a custom `count` smaller than 48", async () => {
    const { nextHours } = await loadHourly();
    const picked = nextHours(series(72), 6, nowAtHour(10));
    expect(picked).toHaveLength(6);
    expect(picked.map((p: HourlyPoint) => p.temperature)).toEqual([
      10, 11, 12, 13, 14, 15,
    ]);
  });
});

describe("nextHours — fewer than `count` future points degrade calmly (FR-FORECAST-03)", () => {
  it("a 30-future-point window returns all 30 without throwing (fewer-than-48 still renders)", async () => {
    const { nextHours } = await loadHourly();
    // 30 points total, now at the very start → all 30 are future.
    const all = series(30);
    let picked!: HourlyPoint[];
    expect(() => {
      picked = nextHours(all, 48, nowAtHour(0));
    }).not.toThrow();
    expect(picked).toHaveLength(30);
    expect(picked[0].temperature).toBe(0);
    expect(picked[29].temperature).toBe(29);
  });

  it("returns [] for an EMPTY series (no throw)", async () => {
    const { nextHours } = await loadHourly();
    let picked!: HourlyPoint[];
    expect(() => {
      picked = nextHours([], 48, nowAtHour(0));
    }).not.toThrow();
    expect(picked).toEqual([]);
  });

  it("returns [] when EVERY point is in the past (now after the last hour)", async () => {
    const { nextHours } = await loadHourly();
    const picked = nextHours(series(24), 48, nowAtHour(100));
    expect(picked).toEqual([]);
  });
});

describe("nextHours — deterministic + non-mutating (TC-PURE-01)", () => {
  it("does not read the viewer's clock: identical (series, now) yields identical output", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    const a = nextHours(all, 48, nowAtHour(5));
    const b = nextHours(all, 48, nowAtHour(5));
    expect(a).toEqual(b);
  });

  it("does not mutate the input series", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    const snapshot = JSON.stringify(all);
    nextHours(all, 48, nowAtHour(10));
    expect(JSON.stringify(all)).toBe(snapshot);
  });
});

// @trace FR-FORECAST-03, FR-ANIM-02
// Regression (global review-gate, Gate G7): the PRODUCTION caller passes a TRUE
// absolute `Date.now()` (a UTC instant), but each point's `time` is the LOCATION's
// wall clock read AS UTC (Open-Meteo timezone=auto, no zone suffix). Without the
// location's offset the "next 48 h" window is skewed by that offset — eastern
// offsets leak already-elapsed hours, western offsets drop near-future hours.
// `nextHours` takes an optional `utcOffsetSeconds` (4th param) that shifts `now`
// into the location's frame, mirroring `isDaytime`/`nowTimeOfDay`
// (lib/animated-bg/day-night.ts) — the identical fix the team already applied to
// the day/night background.
describe("nextHours — threads the LOCATION's UTC offset so the window is in the location's frame (FR-FORECAST-03)", () => {
  const OFFSET = 10_800; // Kyiv +3h (Open-Meteo utc_offset_seconds)

  it("a TRUE-UTC `now` + offset starts the window at the LOCATION's current hour, not the viewer's", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    // A true absolute instant whose LOCATION-local time is series hour 10:
    // (hour 10 read as UTC) minus the +3h offset.
    const trueUtcNow = nowAtHour(10) - OFFSET * 1000;

    const picked = nextHours(all, 48, trueUtcNow, OFFSET);
    // Offset-aware: the slice begins at the location's current hour (10) — no
    // elapsed hours leaked in, no near-future hours dropped.
    expect(picked[0].temperature).toBe(10);
    expect(picked[0].time).toBe(isoLocalHour(10));
  });

  it("WITHOUT the offset the same true-UTC `now` skews the window 3 h early (the bug this guards)", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    const trueUtcNow = nowAtHour(10) - OFFSET * 1000;
    // The pre-fix 3-arg call compares the raw UTC instant against the
    // location-local-as-UTC epochs → starts 3 hours early (hour 7); the offset is
    // exactly what corrects the frame.
    const buggy = nextHours(all, 48, trueUtcNow);
    expect(buggy[0].temperature).toBe(7);
  });

  it("a null / absent offset preserves the legacy injected-`now` behavior (back-compat)", async () => {
    const { nextHours } = await loadHourly();
    const all = series(72);
    // The pure unit-test path injects `now` already on the location-local-as-UTC
    // basis and passes no offset → identical to before this parameter existed.
    expect(nextHours(all, 48, nowAtHour(10), null)[0].temperature).toBe(10);
    expect(nextHours(all, 48, nowAtHour(10), undefined)[0].temperature).toBe(10);
  });
});
