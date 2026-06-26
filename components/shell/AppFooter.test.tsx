// AppFooter structure tests — the footer hosts the jokes slot (filled by
// `<FooterJoke/>`, D5) alongside the MANDATORY Open-Meteo / OpenStreetMap credits
// and the privacy line. These assertions pin the FOOTER's behavior: with an empty
// joke corpus the joke line is omitted (D4, NFR-OBS-01) while the credits + privacy
// line still render inside the <footer> landmark, console silent. The FooterJoke-
// specific behavior (populated render, the client-side daily rotation / mount gate,
// the English per-index fallback) lives in the colocated
// `components/jokes/FooterJoke.test.tsx`.
//
// FooterJoke is a `"use client"` component (D5: the daily rotation must follow the
// VISITOR's local day, read on the client after mount), so renders are wrapped in
// `act()` to flush its mount effect before asserting.
//
// @trace FR-JOKES-01, NFR-I18N-01, NFR-OBS-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, within } from "@testing-library/react";
import { t } from "@/lib/i18n";

// The slot's accessible label comes from `shell.jokes.label` (D5); the placeholder
// copy is superseded but left in place and NOT consumed.
const jokesLabel = () => t("shell.jokes.label");

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("AppFooter — empty corpus omits the joke line, credits remain (D4, NFR-OBS-01)", () => {
  // Drive the empty-corpus path by mocking the dictionary so `jokes.items === []`.
  // The footer must omit the joke `<p>` entirely (not render a blank one), while
  // the Open-Meteo / OpenStreetMap credits and the privacy line still render, with
  // a silent console. The mock keeps every OTHER namespace intact so the credits
  // copy resolves normally.
  function mockEmptyJokesCorpus() {
    vi.doMock("@/lib/i18n/uk", async (importOriginal) => {
      const mod = (await importOriginal()) as { uk: Record<string, unknown>; default?: unknown };
      const patched = {
        ...mod.uk,
        jokes: { ...(mod.uk.jokes as object), items: [] as readonly string[] },
      };
      return { ...mod, uk: patched, default: patched };
    });
    vi.doMock("@/lib/i18n/en", async (importOriginal) => {
      const mod = (await importOriginal()) as { en: Record<string, unknown>; default?: unknown };
      const patched = {
        ...mod.en,
        jokes: { ...(mod.en.jokes as object), items: [] as readonly string[] },
      };
      return { ...mod, en: patched, default: patched };
    });
  }

  it("omits the joke text but still renders the credits + privacy line, console silent", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockEmptyJokesCorpus();
    // Re-import AFTER the mock so AppFooter (and the FooterJoke it wires) sees the
    // emptied corpus.
    const { AppFooter } = await import("@/components/shell/AppFooter");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<AppFooter />));
    });

    // The credits + privacy line still render (footer is not blank / not crashed).
    expect(screen.getByText("Open-Meteo")).toBeInTheDocument();
    expect(screen.getByText("OpenStreetMap")).toBeInTheDocument();
    expect(screen.getByText(t("shell.footer.privacy"))).toBeInTheDocument();

    // The joke line is OMITTED, not blank: no element carries the jokes accessible
    // label, and the superseded placeholder copy is absent too.
    const label = jokesLabel();
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="jokes"]')).toBeNull();
    expect(screen.queryByText(t("shell.jokes.placeholder"))).not.toBeInTheDocument();

    expect(
      errSpy,
      `console.error called: ${errSpy.mock.calls.map((c) => String(c[0])).join(" | ")}`,
    ).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("renders the footer credits region within a <footer> landmark even with an empty corpus", async () => {
    mockEmptyJokesCorpus();
    const { AppFooter } = await import("@/components/shell/AppFooter");
    await act(async () => {
      render(<AppFooter />);
    });
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Open-Meteo")).toBeInTheDocument();
  });
});
