"use client";

// The 48-hour hourly temperature line chart — design.md D5, FR-FORECAST-03,
// NFR-PERF-03, NFR-A11Y-01.
//
// This is a SEPARATE component that imports Recharts. `ForecastSection` loads it via
// `dynamic(() => import("./HourlyChart"), { ssr: false, loading: <skeleton> })` so
// Recharts is NEVER in the initial bundle and never runs on the server (NFR-PERF-03,
// the locked dynamic-import pattern). It plots temperature in °C against time, formats
// axis/tooltip values by the integer-degree rule (the pure `roundAwayFromZero`, shared
// with DayCard), is readable on the smallest viewport (a responsive container with a
// sensible min height), and exposes an accessible NAME (`forecast.chartLabel`) via a
// `role="img"` figure so the trend is not an unlabeled image. Fewer than 48 points (or
// an empty/short series) still renders calmly, no console warning (ResizeObserver is
// mocked for Recharts in vitest.setup.ts).
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { roundAwayFromZero } from "@/lib/forecast/format";
import type { HourlyPoint } from "@/lib/forecast/types";
import { t } from "@/lib/i18n";

export type HourlyChartProps = {
  /** The hourly series to plot (already sliced to the next 48 h by the section). */
  data: HourlyPoint[];
};

// Fixed footprint shared with ForecastSection's ChartSkeleton so swapping the lazy
// chart in causes no layout shift (CLS, NFR-PERF-02).
const CHART_HEIGHT = 200;

/** Integer-°C tick label (round half away from zero); a non-finite value → "". */
function celsiusTick(value: number): string {
  const rounded = roundAwayFromZero(value);
  return rounded === null ? "" : `${rounded}${t("forecast.unit.celsius")}`;
}

/** "HH:00" hour label from an ISO-local "YYYY-MM-DDTHH:..." string. */
function hourTick(time: string): string {
  const match = /T(\d{2})/.exec(time);
  return match ? `${match[1]}:00` : time;
}

export function HourlyChart({ data }: HourlyChartProps) {
  const label = t("forecast.chartLabel");
  return (
    // role="img" + aria-label gives the chart a single accessible NAME so assistive
    // tech announces the trend rather than walking the SVG primitives.
    <figure role="img" aria-label={label} className="m-0 w-full">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="time"
            tickFormatter={hourTick}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            width={44}
            tickFormatter={celsiusTick}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <Tooltip
            // Recharts' Formatter value type is broad (may be undefined / an
            // array); coerce defensively to a finite number for the integer-°C
            // label, falling back to the placeholder for anything non-numeric.
            formatter={(value: unknown) => {
              const n = Number(Array.isArray(value) ? value[0] : value);
              return Number.isFinite(n) ? celsiusTick(n) : "";
            }}
            labelFormatter={(time: unknown) => hourTick(String(time))}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default HourlyChart;
