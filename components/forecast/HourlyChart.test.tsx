// Test-first (RED): asserts the SPECIFIED hourly chart pinned by design.md D5 and
// the forecast spec ("Render a 48-hour hourly temperature line chart"). The
// implementation (`components/forecast/HourlyChart.tsx`) does NOT exist yet — these
// MUST fail because the component is MISSING, not because of weak assertions. Never
// weaken a test to make it pass.
//
// Contract under test (D5, tasks 4.6, 5.9):
//   - HourlyChart is imported DIRECTLY here (bypassing the `dynamic(ssr:false)`
//     wrapper the section uses) and renders the 48 h temperature line/region from
//     a HourlyPoint[] series WITHOUT throwing.
//   - It exposes an accessible NAME (forecast.chartLabel) so the trend is not an
//     unlabeled image (NFR-A11Y-01).
//   - A short (30-point) and an EMPTY series degrade calmly, no console warning
//     (ResizeObserver is mocked in vitest.setup.ts for Recharts).
//
// @trace FR-FORECAST-03, NFR-A11Y-01
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { HourlyPoint } from "@/lib/forecast/types";

// forecast.* keys are added by this slice and are not yet in the typed MessageKey
// union; read via the established t() parameter-type cast (mirrors i18n.test.ts).
async function chartLabel(): Promise<string> {
  const { t } = await import("@/lib/i18n");
  return t("forecast.chartLabel" as Parameters<typeof t>[0]);
}

// A contiguous hourly series of ISO-local strings + a temperature per hour.
function series(length: number): HourlyPoint[] {
  const base = Date.UTC(2026, 5, 27, 0);
  return Array.from({ length }, (_, i) => {
    const d = new Date(base + i * 3_600_000);
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    return {
      time: `${d.getUTCFullYear()}-${m}-${day}T${h}:00`,
      temperature: 10 + (i % 12),
    };
  });
}

// Defer the import so a MISSING module fails the test rather than crashing
// collection. Import the chart DIRECTLY (not via next/dynamic).
async function renderChart(data: HourlyPoint[]) {
  const mod = await import("@/components/forecast/HourlyChart");
  const HourlyChart = (mod.default ?? mod.HourlyChart) as React.ComponentType<{
    data: HourlyPoint[];
  }>;
  return render(<HourlyChart data={data} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HourlyChart — renders a 48-point series with an accessible name (FR-FORECAST-03)", () => {
  it("renders without throwing and is not blank for 48 points", async () => {
    let container!: HTMLElement;
    await expect(
      (async () => {
        const r = await renderChart(series(48));
        container = r.container;
      })(),
    ).resolves.not.toThrow();
    // The chart region renders SOMETHING (Recharts mounts under the mocked
    // ResizeObserver) — not an empty container.
    expect(container.childElementCount).toBeGreaterThan(0);
  });

  it("exposes an accessible name (forecast.chartLabel) so the trend is not an unlabeled image (NFR-A11Y-01)", async () => {
    const label = await chartLabel();
    expect(label.trim().length, "forecast.chartLabel must resolve to a non-empty i18n string").toBeGreaterThan(0);

    const { container } = await renderChart(series(48));
    // The accessible name is reachable via an aria-label / role=img name / a
    // figure/region label — assert the label text is wired into the accessibility
    // tree somewhere in the chart subtree.
    const labelled = Array.from(container.querySelectorAll("*")).some((el) => {
      const aria = el.getAttribute("aria-label") ?? "";
      const role = el.getAttribute("role") ?? "";
      return aria.includes(label) || (role === "img" && aria.length > 0);
    });
    const fallbackText = (container.textContent ?? "").includes(label);
    expect(
      labelled || fallbackText,
      "the chart must carry its accessible name (forecast.chartLabel)",
    ).toBe(true);
  });
});

describe("HourlyChart — degrades calmly for short / empty series, console silent (FR-FORECAST-03)", () => {
  it("a 30-point series still renders without a console warning", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let container!: HTMLElement;
    await expect(
      (async () => {
        const r = await renderChart(series(30));
        container = r.container;
      })(),
    ).resolves.not.toThrow();
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("an EMPTY series renders calmly (no throw, no console noise)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      (async () => {
        await renderChart([]);
      })(),
    ).resolves.not.toThrow();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
