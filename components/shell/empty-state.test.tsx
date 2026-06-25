// Test-first (red): asserts the SPECIFIED first-load empty state pinned by
// design.md D7 + D8 and spec "First-load empty state" / "Responsive breakpoint
// layout". Implementation (`components/shell/SearchHero.tsx`, the composed
// `app/page.tsx` main content region) does not exist yet — these MUST fail
// because the slot + composition are missing.
//
// Contract under test:
//   - with NO active location, the shell shows the SearchHero hero copy + a
//     centered search slot and is NEVER visually blank (FR-SHELL-03, NFR-OBS-01).
//   - the main content region carries the responsive grid chain
//     `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (FR-SHELL-02, D8).
//
// @trace FR-SHELL-02, FR-SHELL-03, NFR-OBS-01
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The shell reads the URL through next/navigation; with no location params the
// provider seeds the empty state. Mock the hooks so a jsdom render of the page
// composition is inert (no real router), exercising the EMPTY (no-location) path.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
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

describe("components/shell/SearchHero — first-load empty state", () => {
  it("renders non-blank hero content with a heading", async () => {
    const { SearchHero } = await import("@/components/shell/SearchHero");
    const { container } = render(<SearchHero />);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading"),
      "the empty state must present hero copy as a heading",
    ).toBeInTheDocument();
  });

  it("exposes a prominently centered city-search slot as the focal point", async () => {
    const { SearchHero } = await import("@/components/shell/SearchHero");
    const { container } = render(<SearchHero />);
    // The centered search slot is the primary focal point (FR-SHELL-03). It is
    // an inert stub in this slice, identified by a search landmark/textbox or a
    // centering utility — assert the slot is present, not silently absent.
    const hasSearchSlot =
      screen.queryByRole("search") !== null ||
      screen.queryByRole("textbox") !== null ||
      screen.queryByTestId("search-slot") !== null ||
      /justify-center|items-center|mx-auto|text-center/.test(
        container.innerHTML,
      );
    expect(hasSearchSlot).toBe(true);
  });

  it("contains no exclamation mark in the hero copy (BC-BRAND-01)", async () => {
    const { SearchHero } = await import("@/components/shell/SearchHero");
    const { container } = render(<SearchHero />);
    expect(container.textContent ?? "").not.toContain("!");
  });
});

describe("app/page — shell composition with no active location", () => {
  it("renders the empty state and is never visually blank", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    // The first-load empty state shows hero copy as a heading.
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });

  it("the main content region carries grid-cols-1 md:grid-cols-2 xl:grid-cols-3", async () => {
    const Home = (await import("@/app/page")).default;
    const { container } = render(<Home />);
    const grid = container.querySelector(
      ".grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3",
    );
    expect(
      grid,
      "main content region must declare the FR-SHELL-02 responsive grid chain",
    ).not.toBeNull();
  });
});
