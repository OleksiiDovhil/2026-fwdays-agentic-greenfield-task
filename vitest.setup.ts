import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom lacks matchMedia (used for prefers-reduced-motion, FR-ANIM-03) and
// ResizeObserver (used by Recharts, FR-FORECAST-03). Provide inert defaults so
// component tests render without throwing; individual tests override as needed.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}
