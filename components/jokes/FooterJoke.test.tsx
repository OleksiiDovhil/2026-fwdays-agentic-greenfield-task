// Colocated jsdom tests for the footer joke component (tasks 5.7 + 5.8, plus the
// client-date/mount-gate behavior and the EN per-index fallback path). Pinned by
// design.md D3-D5 and the `bottom-jokes` spec: the joke text comes from the
// centralised i18n corpus (Ukrainian default, English per-index fallback), the
// rotation follows the VISITOR's local calendar day computed on the CLIENT after
// mount, an empty corpus omits the joke line, and the console stays silent.
//
// FooterJoke is a `"use client"` component (D5): SSR + the first client render
// show the deterministic index-0 joke (so hydration matches with no flash), then a
// mount effect swaps in the visitor's local-day joke `pickJoke(corpus,
// dailyKey(new Date()))`. Mount effects are flushed with `act()` so the asserted
// state is the post-mount (local-day) value.
//
// @trace FR-JOKES-01, NFR-I18N-01, NFR-OBS-01
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { t, uk } from "@/lib/i18n";
import { pickJoke, dailyKey } from "@/lib/jokes/jokes";

// Read the real Ukrainian corpus off the dictionary object (D3) — `t()` returns a
// single string leaf, not an array, so the corpus is the `jokes.items` array.
const ukJokes = (): readonly string[] => uk.jokes.items;

// The slot's accessible label still comes from `shell.jokes.label` (D5); the
// placeholder copy is superseded but left in place and NOT consumed.
const jokesLabel = () => t("shell.jokes.label");

// The exact Ukrainian joke the footer must show TODAY after mount: pickJoke over
// the real corpus keyed on today's LOCAL date. Computed from i18n + the pure
// selector, so asserting the DOM equals it proves the text is i18n-sourced, not a
// literal baked into the component.
const expectedJokeToday = (): string | undefined =>
  pickJoke(ukJokes(), dailyKey(new Date()));

// The deterministic index-0 joke the SERVER prerenders (and the first client
// render shows before the mount effect runs).
const indexZeroJoke = (): string | undefined => pickJoke(ukJokes(), 0);

// Render and flush the mount effect so the component is in its post-mount
// (local-day) state.
async function renderFooterJoke() {
  const { FooterJoke } = await import("@/components/jokes/FooterJoke");
  await act(async () => {
    render(<FooterJoke />);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("FooterJoke — renders the selected i18n joke (D5, FR-JOKES-01, NFR-I18N-01)", () => {
  it("renders the joke text equal to corpus[dailyKey(today) mod N] (sourced from i18n, not a literal)", async () => {
    const expected = expectedJokeToday();
    expect(
      typeof expected === "string" && expected.length > 0,
      "the shipped uk.jokes corpus must yield a joke for today",
    ).toBe(true);

    await renderFooterJoke();
    expect(screen.getByText(expected as string)).toBeInTheDocument();
  });

  it("labels the joke node with the shell.jokes.label accessible name", async () => {
    await renderFooterJoke();
    const label = jokesLabel();
    expect(
      label.trim().length,
      "shell.jokes.label must be a non-empty i18n string",
    ).toBeGreaterThan(0);
    const labelled = screen.getByLabelText(label);
    expect(labelled).toBeInTheDocument();
    // The labelled node carries today's selected joke text.
    expect(labelled).toHaveTextContent(expectedJokeToday() as string);
  });

  it("does NOT render the superseded shell.jokes.placeholder copy", async () => {
    await renderFooterJoke();
    const placeholder = t("shell.jokes.placeholder");
    expect(screen.queryByText(placeholder)).not.toBeInTheDocument();
  });

  it("emits no console.error / console.warn while rendering a populated corpus", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderFooterJoke();
    expect(
      errSpy,
      `console.error called: ${errSpy.mock.calls.map((c) => String(c[0])).join(" | ")}`,
    ).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("FooterJoke — client-side daily rotation / mount gate (D5, FR-JOKES-01)", () => {
  it("shows the deterministic index-0 joke on first render, then the visitor's local-day joke after mount", async () => {
    const { FooterJoke } = await import("@/components/jokes/FooterJoke");
    // Render WITHOUT flushing the mount effect first: the synchronous first render
    // is the SSR-equivalent paint, which must show the index-0 joke (so SSR and the
    // first client render agree — no hydration mismatch, no blank flash).
    let utils!: ReturnType<typeof render>;
    act(() => {
      utils = render(<FooterJoke />);
    });
    expect(
      screen.getByText(indexZeroJoke() as string),
      "first render must show the deterministic index-0 joke (SSR-equivalent)",
    ).toBeInTheDocument();

    // Now flush the mount effect: the joke updates to the visitor's local-day pick
    // computed from `dailyKey(new Date())` on the client, filling the SAME slot.
    await act(async () => {
      await Promise.resolve();
    });
    const local = expectedJokeToday() as string;
    expect(screen.getByText(local)).toBeInTheDocument();

    // The labelled slot now carries the local-day joke.
    expect(screen.getByLabelText(jokesLabel())).toHaveTextContent(local);
    utils.unmount();
  });
});

describe("FooterJoke — English per-index fallback when a Ukrainian entry is missing (D3, FR-JOKES-01)", () => {
  it("renders the English fallback joke for the selected index when the Ukrainian entry is empty", async () => {
    // The local-day index the footer selects after mount, against a corpus of the
    // real length. We build mocked corpora so the SELECTED index has an empty
    // Ukrainian entry and a populated English fallback, then assert the English
    // text renders (exercising the per-index fallback branch).
    const n = ukJokes().length;
    const selected = ((dailyKey(new Date()) % n) + n) % n;

    // Ukrainian: every entry usable EXCEPT the selected index, which is empty.
    const ukItems = Array.from({ length: n }, (_, i) =>
      i === selected ? "" : `uk-${i}`,
    );
    // English: a recognizable fallback at the selected index.
    const EN_FALLBACK = "English fallback joke for the selected index";
    const enItems = Array.from({ length: n }, (_, i) =>
      i === selected ? EN_FALLBACK : `en-${i}`,
    );

    vi.doMock("@/lib/i18n/uk", async (importOriginal) => {
      const mod = (await importOriginal()) as {
        uk: Record<string, unknown>;
        default?: unknown;
      };
      const patched = {
        ...mod.uk,
        jokes: { ...(mod.uk.jokes as object), items: ukItems as readonly string[] },
      };
      return { ...mod, uk: patched, default: patched };
    });
    vi.doMock("@/lib/i18n/en", async (importOriginal) => {
      const mod = (await importOriginal()) as {
        en: Record<string, unknown>;
        default?: unknown;
      };
      const patched = {
        ...mod.en,
        jokes: { ...(mod.en.jokes as object), items: enItems as readonly string[] },
      };
      return { ...mod, en: patched, default: patched };
    });

    const { FooterJoke } = await import("@/components/jokes/FooterJoke");
    await act(async () => {
      render(<FooterJoke />);
    });

    // The English fallback for the selected index renders (not an empty footer,
    // not the empty Ukrainian entry).
    expect(screen.getByText(EN_FALLBACK)).toBeInTheDocument();
    expect(screen.getByLabelText(jokesLabel())).toHaveTextContent(EN_FALLBACK);
  });
});

describe("FooterJoke — empty corpus omits the joke line (D4, NFR-OBS-01)", () => {
  function mockEmptyJokesCorpus() {
    vi.doMock("@/lib/i18n/uk", async (importOriginal) => {
      const mod = (await importOriginal()) as {
        uk: Record<string, unknown>;
        default?: unknown;
      };
      const patched = {
        ...mod.uk,
        jokes: { ...(mod.uk.jokes as object), items: [] as readonly string[] },
      };
      return { ...mod, uk: patched, default: patched };
    });
    vi.doMock("@/lib/i18n/en", async (importOriginal) => {
      const mod = (await importOriginal()) as {
        en: Record<string, unknown>;
        default?: unknown;
      };
      const patched = {
        ...mod.en,
        jokes: { ...(mod.en.jokes as object), items: [] as readonly string[] },
      };
      return { ...mod, en: patched, default: patched };
    });
  }

  it("omits the joke <p> entirely (not blank) with a silent console", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockEmptyJokesCorpus();
    const { FooterJoke } = await import("@/components/jokes/FooterJoke");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<FooterJoke />));
    });

    // No element carries the jokes accessible label, no jokes slot node exists, and
    // the superseded placeholder copy is absent too — the line is OMITTED, not
    // rendered blank.
    expect(screen.queryByLabelText(jokesLabel())).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="jokes"]')).toBeNull();
    expect(screen.queryByText(t("shell.jokes.placeholder"))).not.toBeInTheDocument();

    expect(
      errSpy,
      `console.error called: ${errSpy.mock.calls.map((c) => String(c[0])).join(" | ")}`,
    ).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
