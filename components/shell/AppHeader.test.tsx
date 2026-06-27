// Test-first (red): asserts the SPECIFIED behavior of the header theme
// indicator/toggle pinned by design.md D3 + D7 and spec scenario "Theme
// indicator reflects the active theme". Implementation
// (`components/shell/AppHeader.tsx` + `components/providers/ThemeProvider.tsx`)
// does not exist yet — these MUST fail because they are missing.
//
// Contract under test:
//   - the theme control exposes an accessible NAME describing the current theme
//     (NFR-A11Y-01).
//   - activating it toggles light<->dark, flipping `data-theme` on the document
//     element (the CSS variables key off it, D3).
//
// Rendered within ThemeProvider — the provider the header needs for the toggle.
//
// @trace FR-SHELL-01, NFR-A11Y-01
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "@/components/shell/AppHeader";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

function renderHeader() {
  return render(
    <ThemeProvider>
      <AppHeader />
    </ThemeProvider>,
  );
}

// The theme toggle is the header's theme-changing control. Identify it by its
// accessible name (describes/acts on the theme) and fall back to the sole button.
function getThemeToggle(): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const themed = buttons.find((b) => {
    const name = (b.getAttribute("aria-label") || b.textContent || "").toLowerCase();
    return /тем|світл|theme|dark|light/.test(name);
  });
  return themed ?? buttons[0];
}

const currentTheme = () =>
  document.documentElement.getAttribute("data-theme") ??
  (document.documentElement.classList.contains("dark") ? "dark" : "light");

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("components/shell/AppHeader — theme indicator/toggle", () => {
  it("renders an interactive theme control with a non-empty accessible name", () => {
    renderHeader();
    const toggle = getThemeToggle();
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAccessibleName();
  });

  it("the accessible name describes the active theme (light or dark)", () => {
    renderHeader();
    const toggle = getThemeToggle();
    const name = (
      toggle.getAttribute("aria-label") ||
      toggle.textContent ||
      ""
    ).toLowerCase();
    // Mentions a theme concept in Ukrainian or English.
    expect(name).toMatch(/тем|світл|theme|dark|light/);
  });

  it("toggles data-theme light<->dark when activated", async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = getThemeToggle();

    const before = currentTheme();
    expect(["light", "dark"]).toContain(before);

    await user.click(toggle);
    const after = currentTheme();
    expect(after).not.toBe(before);
    expect(["light", "dark"]).toContain(after);

    // Toggling again returns to the original theme.
    await user.click(getThemeToggle());
    expect(currentTheme()).toBe(before);
  });

  it("updates the control's accessible name to reflect the new theme", async () => {
    const user = userEvent.setup();
    renderHeader();
    const nameOf = (el: HTMLElement) =>
      (el.getAttribute("aria-label") || el.textContent || "").toLowerCase();

    const nameBefore = nameOf(getThemeToggle());
    await user.click(getThemeToggle());
    const nameAfter = nameOf(getThemeToggle());
    expect(nameAfter).not.toBe(nameBefore);
  });

  it("follows the system preference: a dark-OS render announces a different theme than a light-OS render (hydration-safe, no matchMedia read during render)", () => {
    const nameOf = (el: HTMLElement) =>
      (el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
    const darkStub = (q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const original = window.matchMedia;

    // Light OS (the default setup stub reports matches:false).
    const light = renderHeader();
    const lightName = nameOf(getThemeToggle());
    light.unmount();

    // Dark OS — the control follows the system and announces the dark state. The
    // value is read via useSyncExternalStore (server snapshot "light" === the first
    // client render), so a real SSR hydration would NOT mismatch on this markup.
    window.matchMedia = vi
      .fn()
      .mockImplementation(darkStub) as typeof window.matchMedia;
    try {
      renderHeader();
      expect(nameOf(getThemeToggle())).not.toBe(lightName);
    } finally {
      window.matchMedia = original;
    }
  });
});
