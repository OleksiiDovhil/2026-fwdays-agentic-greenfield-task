"use client";

// The city-search combobox — design.md D3–D6, FR-SEARCH-01..06, BC-PRIVACY-02,
// NFR-A11Y-01, NFR-OBS-01. The ONLY place React state / `fetch` / `setTimeout`
// (debounce) / `navigator.geolocation` / keyboard handling live for search; the
// pure parse/flag layer is `lib/search/*` and the upstream geocoding URL lives
// only in `app/api/geocode` (TC-DATA-01). Fills the SearchHero slot (D7).
//
// It consumes the LOCKED `useLocation()` for the SETTER only — selection calls
// `setLocation({lat,lon,name})` and the provider syncs `?lat=&lon=&name=` via
// `router.replace` (this component does NOT write the URL itself, single URL-sync
// path). All copy comes from `search.*` (no exclamation marks, BC-BRAND-01).
//
// Every outcome reduces to one calm inline state (D4): the suggestion listbox, an
// empty Notice ("Нічого не знайдено"), an error Notice, or nothing (idle). There
// is NO toast and NO path that surfaces a raw 500 / uncaught exception. Caught
// errors are rendered, never logged, and the debounce timer + in-flight request
// are cleaned up so a healthy session keeps the console silent.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
// NOTE: the locked `Input`/`Button` primitives are plain function components that
// spread `...props` onto the underlying element; we pass roles/aria/handlers
// through that spread and do not need an imperative ref here.
import { MapPin, Search } from "lucide-react";
import { useLocation } from "@/components/providers/LocationProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { flagEmoji } from "@/lib/search/flag";
import type { GeoSuggestion } from "@/lib/search/types";
import { t } from "@/lib/i18n";

const DEBOUNCE_MS = 300;
const MAX_QUERY_LENGTH = 120;
// Client-side request deadline (ms). A HUNG (not failed) `/api/geocode` — e.g. the
// route's own upstream stalls past its 4 s deadline, or a slow network — would
// otherwise leave the box in an indefinite silent "loading" state. We abort after
// this deadline and show the calm error Notice instead. Longer than the server's
// own upstream timeout so the server normally resolves first; this is the backstop.
const REQUEST_TIMEOUT_MS = 8000;

type Status = "idle" | "loading" | "ready" | "empty" | "error";

// Narrow an unknown JSON body to the internal { suggestions } contract without
// trusting it. The route handler already returns the typed shape; this is the
// client-side belt: a body that is not { suggestions: [...] } is treated as no
// results rather than rendered as partial data.
function readSuggestions(body: unknown): GeoSuggestion[] | null {
  if (body && typeof body === "object" && Array.isArray((body as { suggestions?: unknown }).suggestions)) {
    return (body as { suggestions: GeoSuggestion[] }).suggestions;
  }
  return null;
}

export function SearchBox() {
  const { setLocation } = useLocation();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  // Whether the suggestion list / empty Notice is currently shown. Selection and
  // Escape dismiss it without clearing the query; a fresh response re-opens it.
  const [open, setOpen] = useState(false);
  // The active-descendant option id (the highlighted option), or null. Focus
  // STAYS in the input — this is the WAI-ARIA activedescendant pattern (D5).
  const [activeId, setActiveId] = useState<string | null>(null);
  // The geolocation Notice message (separate from the search error), or null.
  const [geoError, setGeoError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic request id: a response is applied ONLY if its id is still the
  // latest issued (latest-wins, D3). Incremented every time a search is RUN
  // (including the clear-to-empty path), so a superseded or post-clear response
  // — which carries an older id — is discarded.
  const requestIdRef = useRef(0);
  // Tracks mount so a late fetch rejection AFTER unmount (the cleanup abort) is
  // ignored without a "state update on an unmounted component" warning (NFR-OBS-01).
  const mountedRef = useRef(true);

  const listboxId = useId();
  const optionPrefix = useId();
  // Stable per-index option id (the activedescendant target). `optionPrefix` is a
  // stable useId value, so this is referentially stable for the hook deps.
  const optionId = useCallback(
    (index: number) => `${optionPrefix}-opt-${index}`,
    [optionPrefix],
  );

  const labelText = t("search.label");
  const listLabel = t("search.listLabel");

  const listboxVisible = open && status === "ready" && suggestions.length > 0;
  const emptyVisible = open && status === "empty";

  // --- Selection: set the active location via the locked provider (D3). -------
  const selectSuggestion = useCallback(
    (s: GeoSuggestion) => {
      setLocation({ lat: s.lat, lon: s.lon, name: s.name });
      // Dismiss the list on selection; the query text stays.
      setOpen(false);
      setActiveId(null);
      setStatus("idle");
      // A stale geolocation Notice must not linger once the user picks a place.
      setGeoError(null);
    },
    [setLocation],
  );

  // --- Run a debounced search for `value` (already the latest input). ---------
  const runSearch = useCallback((value: string) => {
    // Abort any in-flight request and bump the id so its late resolution/
    // rejection is ignored (belt-and-braces with the id guard).
    abortRef.current?.abort();
    const myId = ++requestIdRef.current;
    // Resuming typing dismisses a stale geolocation Notice (it described a past
    // click, not the current search) so at most one inline state is in view.
    setGeoError(null);

    const trimmed = value.trim().slice(0, MAX_QUERY_LENGTH);
    if (trimmed.length === 0) {
      // Empty / whitespace-only → no request; dismiss the list (not an error).
      abortRef.current = null;
      setSuggestions([]);
      setActiveId(null);
      setOpen(false);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    const url = `/api/geocode?q=${encodeURIComponent(trimmed)}`;
    // Combine the supersede/unmount abort with a hard request deadline: a HUNG
    // response is aborted by the timeout and surfaces the calm error Notice
    // (handled in catch via the still-current id), never an indefinite loading.
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    fetch(url, { signal })
      .then((res) => res.json())
      .then((body: unknown) => {
        // Discard a superseded / post-clear response (latest-wins) or one that
        // resolves after unmount.
        if (!mountedRef.current || myId !== requestIdRef.current) return;
        const list = readSuggestions(body);
        if (list === null) {
          // A typed error result (or an unreadable body) → calm error Notice.
          setSuggestions([]);
          setActiveId(null);
          setStatus("error");
          setOpen(true);
          return;
        }
        setSuggestions(list);
        setActiveId(null);
        setStatus(list.length > 0 ? "ready" : "empty");
        setOpen(true);
      })
      .catch(() => {
        // A SUPERSEDED request (a newer one bumped the id) or one that rejects
        // AFTER unmount is silently ignored — no Notice, no console. Otherwise
        // (a network error, OR a TIMEOUT abort while this is still the current
        // request) → the calm error Notice, rendered (never logged), input still
        // editable to retry. Distinguishing on the id (not the error type) is
        // what lets a timeout-abort show the error while a supersede-abort stays
        // silent.
        if (!mountedRef.current || myId !== requestIdRef.current) return;
        setSuggestions([]);
        setActiveId(null);
        setStatus("error");
        setOpen(true);
      });
  }, []);

  // --- Debounce: each query change resets a 300 ms timer (D3, FR-SEARCH-01). --
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // --- Cleanup on unmount: mark unmounted, clear the timer + abort the in-flight
  // request so no "state update on an unmounted component" warning is emitted; the
  // catch checks `mountedRef` so the abort rejection stays silent (D4). ----------
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // --- Keyboard interaction (WAI-ARIA combobox/listbox, D5). ------------------
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        // Close the list and clear the active descendant (query text stays).
        setOpen(false);
        setActiveId(null);
        return;
      }

      if (!listboxVisible) {
        if (event.key === "Enter") {
          // Enter with NO open list does nothing (no guess).
        }
        return;
      }

      const count = suggestions.length;
      const indexOf = (id: string | null) =>
        id ? suggestions.findIndex((_s, i) => optionId(i) === id) : -1;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        // Functional update so consecutive ArrowDowns within one React batch each
        // advance from the PREVIOUS active id (not a stale closure value).
        setActiveId((prev) => {
          const current = indexOf(prev);
          const next = current < count - 1 ? current + 1 : 0;
          return optionId(next);
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveId((prev) => {
          const current = indexOf(prev);
          const up = current > 0 ? current - 1 : count - 1;
          return optionId(up);
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const currentIndex = indexOf(activeId);
        if (currentIndex >= 0) {
          // Enter on the active descendant selects THAT option.
          selectSuggestion(suggestions[currentIndex]);
        } else if (count === 1) {
          // Enter with exactly one suggestion and no active descendant
          // auto-selects it (FR-SEARCH-04); two+ does NOT guess.
          selectSuggestion(suggestions[0]);
        }
      }
    },
    [activeId, listboxVisible, optionId, selectSuggestion, suggestions],
  );

  // --- Opt-in geolocation: ONLY on the explicit button click (D6, BC-PRIVACY-02).
  const onGeolocate = useCallback(() => {
    setGeoError(null);
    const geo =
      typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== "function") {
      // The browser does not expose geolocation → calm unavailable Notice.
      setGeoError(t("search.geolocationUnavailable"));
      return;
    }
    geo.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lon: longitude, name: t("search.myLocation") });
        // Dismiss any open list now that a location is chosen.
        setOpen(false);
        setActiveId(null);
        setStatus("idle");
      },
      (error) => {
        // Denied permission → blame-free denied Notice; any other position error
        // (unavailable / timeout) → the unavailable Notice. Location unchanged.
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? t("search.geolocationDenied")
            : t("search.geolocationUnavailable"),
        );
      },
    );
  }, [setLocation]);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          inputSize="lg"
          className="pl-10"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("search.placeholder")}
          aria-label={labelText}
          role="combobox"
          aria-expanded={listboxVisible}
          // Reference the listbox only while it is actually in the DOM, so the
          // IDREF never dangles (NFR-A11Y-01).
          aria-controls={listboxVisible ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId ?? undefined}
          // Announce the quiet busy state while suggestions load.
          aria-busy={status === "loading"}
          autoComplete="off"
        />

        {listboxVisible ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={listLabel}
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border-strong bg-surface py-1 text-left shadow-lg"
          >
            {suggestions.map((s, index) => {
              const flag = flagEmoji(s.countryCode);
              const isActive = activeId === optionId(index);
              const region = [s.admin1, s.country].filter(Boolean).join(", ");
              return (
                <li
                  key={s.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isActive}
                  // Highlight reuses the existing AA-verified accent token (no new
                  // color). pointer-down (not click) so the input keeps focus.
                  className={
                    isActive
                      ? "flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm bg-accent text-accent-foreground"
                      : "flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm text-foreground hover:bg-background"
                  }
                  onMouseDown={(event) => {
                    // Prevent the input from losing focus before selection.
                    event.preventDefault();
                  }}
                  onClick={() => selectSuggestion(s)}
                >
                  {flag ? (
                    <span aria-hidden="true" className="shrink-0">
                      {flag}
                    </span>
                  ) : null}
                  <span className="font-medium">{s.name}</span>
                  {region ? (
                    <span
                      className={
                        isActive
                          ? "text-accent-foreground/80"
                          : "text-muted-foreground"
                      }
                    >
                      {region}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* A single calm, polite busy region while suggestions load (aria-live via
          Notice's role=status). Non-flooding: one node, shown only during loading
          and replaced in place by the listbox / empty / error state. */}
      {status === "loading" ? (
        <Notice variant="info" title={t("search.loading")} description="" />
      ) : null}

      {emptyVisible ? (
        <Notice variant="empty" title={t("search.empty")} description="" />
      ) : null}

      {/* At most ONE error Notice at a time (NFR-A11Y-01, NFR-OBS-01): the search
          error takes precedence; the geolocation Notice shows only when there is
          no active search error (and it is also cleared the moment the user
          resumes typing or selects a place). */}
      {status === "error" ? (
        <Notice variant="error" title={t("search.failed")} description="" />
      ) : null}

      <div className="flex items-center justify-center">
        <Button variant="outline" size="md" onClick={onGeolocate}>
          <MapPin aria-hidden="true" className="size-4" />
          {t("search.geolocate")}
        </Button>
      </div>

      {geoError && status !== "error" ? (
        <Notice variant="error" title={geoError} description="" />
      ) : null}
    </div>
  );
}
