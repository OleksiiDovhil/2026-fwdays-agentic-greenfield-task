// Verifies the located-state branch of the shell body: once a valid active
// location is present in the URL, the first-load <SearchHero/> hero is DISMISSED
// and the located content region renders (FR-SHELL-03 "Selecting a location
// dismisses the empty state"). Complements empty-state.test.tsx (the no-location
// path). The provider seeds the validated location from the mocked URL — the body
// reads it via useLocation(), never re-parsing the raw URL (spec).
//
// @trace FR-SHELL-03
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation so the LocationProvider seeds an ACTIVE location (Kyiv)
// from well-formed lat/lon/name params. No real router is needed.
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams("lat=50.45&lon=30.52&name=Kyiv"),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
}));

describe("components/shell/ShellContent — located state dismisses the empty hero", () => {
  it("hides the SearchHero hero heading when a location is active", async () => {
    const { ShellContent } = await import("@/components/shell/ShellContent");
    const { LocationProvider } = await import(
      "@/components/providers/LocationProvider"
    );
    const { t } = await import("@/lib/i18n");

    render(
      <LocationProvider>
        <ShellContent />
      </LocationProvider>,
    );

    // The first-load hero copy must NOT be present once a location is selected.
    expect(screen.queryByText(t("shell.hero.title"))).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("renders the located main content region (not the empty Notice)", async () => {
    const { ShellContent } = await import("@/components/shell/ShellContent");
    const { LocationProvider } = await import(
      "@/components/providers/LocationProvider"
    );
    const { t } = await import("@/lib/i18n");

    const { container } = render(
      <LocationProvider>
        <ShellContent />
      </LocationProvider>,
    );

    // The main content region is present and still carries the responsive grid.
    const region = screen.getByRole("region", { name: t("shell.main.label") });
    expect(region).toBeInTheDocument();
    expect(
      container.querySelector(
        ".grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3",
      ),
    ).not.toBeNull();

    // The located content-slot placeholders render; the SHELL's first-load empty
    // Notice does not.
    expect(container.querySelector('[data-slot="forecast"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="map"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="compare"]')).not.toBeNull();
    // FR-SHELL-03: the shell's own first-load empty Notice (shell.notice.empty,
    // spanning all columns) is dismissed once a location is active. Asserted by its
    // specific copy rather than a blanket role="status" query, because the compare
    // slot now hosts a REAL component (CompareSection) whose own calm "pin a city"
    // empty state is a legitimate role="status" Notice (its authored contract,
    // CompareSection.test.tsx) — it is NOT the shell empty placeholder this test guards.
    expect(screen.queryByText(t("shell.notice.empty.title"))).toBeNull();
    expect(screen.queryByText(t("shell.notice.empty.description"))).toBeNull();
  });
});
