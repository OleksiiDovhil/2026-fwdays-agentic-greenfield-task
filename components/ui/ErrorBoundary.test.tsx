// Verifies the reusable error boundary degrades a render-time throw to the shared
// inline error pattern (<Notice variant="error" />) instead of crashing — the
// spec's "runtime fault degrades to the inline pattern" (NFR-OBS-01). `app/error.tsx`
// reuses the same <Notice>, so this exercises that surface in jsdom (the route
// boundary file itself is not directly unit-testable).
//
// @trace NFR-OBS-01
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { t } from "@/lib/i18n";

// A child that throws synchronously during render to trip the boundary.
function Boom(): never {
  throw new Error("kaboom");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("components/ui/ErrorBoundary", () => {
  it("renders the shared error Notice when a child throws (no rethrow)", () => {
    // React logs caught render errors to console.error in dev/test; silence that
    // expected framework noise so the suite output stays clean. We assert the
    // FALLBACK, not console behavior.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();

    const region = screen.getByRole("alert");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAccessibleName();
    // Inline shared error copy from the centralized dictionary.
    expect(screen.getByText(t("shell.notice.error.title"))).toBeInTheDocument();
    expect(
      screen.getByText(t("shell.notice.error.description")),
    ).toBeInTheDocument();
    // Calm tone (BC-BRAND-01).
    expect(region.textContent ?? "").not.toContain("!");
  });

  it("renders its children unchanged when nothing throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <p>healthy child</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy child")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("honors a custom fallback override", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div role="status">custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
  });
});
