// Test-first (red): asserts the SPECIFIED behavior of the shared inline
// error/empty/info primitive pinned by design.md D4 + spec "Shared inline error
// and empty-state pattern". Implementation (`components/ui/Notice.tsx`) does not
// exist yet — these MUST fail because the component is missing.
//
// Contract under test:
//   - variants `error | empty | info` each render an inline container with an
//     accessible name (role="alert" for error, role="status" for empty/info).
//   - copy is sourced from `lib/i18n` (calm, no exclamation marks) — a bare
//     variant still renders non-blank explanatory text, never a silent blank.
//   - rendering is inline and never throws (no generic 500).
//
// @trace NFR-OBS-01, NFR-A11Y-01
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Notice } from "@/components/ui/Notice";

describe("components/ui/Notice — accessible roles per variant", () => {
  it("renders error as role=alert with an accessible name", () => {
    render(<Notice variant="error" />);
    const region = screen.getByRole("alert");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAccessibleName();
  });

  it("renders empty as role=status with an accessible name", () => {
    render(<Notice variant="empty" />);
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAccessibleName();
  });

  it("renders info as role=status with an accessible name", () => {
    render(<Notice variant="info" />);
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAccessibleName();
  });
});

describe("components/ui/Notice — calm, non-blank, inline copy", () => {
  it("each variant renders non-blank text and never a silent blank", () => {
    for (const variant of ["error", "empty", "info"] as const) {
      const { unmount } = render(<Notice variant={variant} />);
      const role = variant === "error" ? "alert" : "status";
      const region = screen.getByRole(role);
      expect(region.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      unmount();
    }
  });

  it("contains no exclamation mark in any variant (BC-BRAND-01)", () => {
    for (const variant of ["error", "empty", "info"] as const) {
      const { container, unmount } = render(<Notice variant={variant} />);
      expect(container.textContent ?? "").not.toContain("!");
      unmount();
    }
  });

  it("renders provided i18n-sourced title and description copy", () => {
    render(
      <Notice
        variant="error"
        title="Не вдалося завантажити дані"
        description="Спробуйте оновити сторінку трохи згодом"
      />,
    );
    const region = screen.getByRole("alert");
    expect(within(region).getByText("Не вдалося завантажити дані")).toBeInTheDocument();
    expect(
      within(region).getByText("Спробуйте оновити сторінку трохи згодом"),
    ).toBeInTheDocument();
  });

  it("renders inline within its region without throwing (no generic 500)", () => {
    expect(() =>
      render(
        <section data-testid="host">
          <Notice variant="empty" />
        </section>,
      ),
    ).not.toThrow();
    const host = screen.getByTestId("host");
    expect(within(host).getByRole("status")).toBeInTheDocument();
  });
});
