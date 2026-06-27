"use client";

// The weekend-compare section — design.md D2/D4/D5/D6, FR-COMPARE-01/02/03,
// NFR-A11Y-01, NFR-I18N-01, NFR-OBS-01. The slot fill that REPLACES the inert
// `<div data-slot="compare">` stub in ShellContent.
//
// Client-DRIVEN per the ARCHITECTURE LESSON (current-state): it reads `usePins()` +
// `useLocation()` and fetches `/api/forecast` per pinned city on the client (a
// server component would bake build-time values). It composes:
//   - a controls header: the "Pin this city" button (pins the active location) + the
//     "Compare weekend" toggle (+ the calm cap message at 3 pins);
//   - the comparison region: a real, sticky-header 3-column <table> when the toggle
//     is on (built from the pure `buildCompareRow`), or the calm empty "pin a city"
//     Notice when nothing is pinned;
//   - the chip row: one chip per pinned city with a named unpin control.
//
// PIN-BUTTON PLACEMENT (D1): the "Pin this city" button lives HERE, in the
// compare/chip-row area beside the toggle — NOT in the search box or each day card —
// so the pin/compare affordances stay together and the search box stays
// single-purpose (city selection). It pins `useLocation().location` and is disabled
// at the cap (with the cap copy as its accessible hint) and when there is no active
// location to pin.
//
// DOM ORDER: the table renders BEFORE the chip row, so each column's "make active"
// control precedes the matching chip's "unpin" control — each is then independently
// targetable, and the table appears directly under the toggle that reveals it.
//
// Per-city forecast fetch (D4, TC-DATA-01, NFR-COST-01): on compare, each pinned
// city's weekend forecast comes from the REUSED `/api/forecast?lat=&lon=` route (no
// new endpoint, never Open-Meteo directly), fetched IN PARALLEL (`Promise.allSettled`
// — no waterfall), each abortable, with a captured-identity latest-wins discard and
// an in-memory PER-CITY cache (ADR-0003). One city failing degrades calmly (its
// column shows placeholders + a calm message); the others render; the console stays
// silent on every path.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "@/components/providers/LocationProvider";
import { usePins } from "@/components/providers/PinProvider";
import { ComfortBadge } from "@/components/comfort/ComfortBadge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { X } from "lucide-react";
import { keyOf } from "@/lib/compare/key";
import {
  buildCompareRow,
  type CityForecastState,
  type CompareRow,
  type DayCells,
} from "@/lib/compare/row";
import { roundAwayFromZero } from "@/lib/forecast/format";
import type { Forecast } from "@/lib/forecast/types";
import type { Location } from "@/lib/location/types";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ── The client belt for an untrusted /api/forecast body (mirrors ForecastSection) ─
// The route already returns the typed shape; this is the belt: a typed `{ error }`,
// an unreadable body, or a schema-valid-but-ZERO-day forecast → null (the column
// degrades to its failed state, never an empty table).
function readForecast(body: unknown): Forecast | null {
  if (!body || typeof body !== "object") return null;
  const forecast = (body as { forecast?: unknown }).forecast;
  if (!forecast || typeof forecast !== "object") return null;
  const days = (forecast as { days?: unknown }).days;
  const hourly = (forecast as { hourly?: unknown }).hourly;
  if (!Array.isArray(days) || days.length === 0) return null;
  if (!Array.isArray(hourly)) return null;
  return forecast as Forecast;
}

/** Format a temperature to a whole °C with the i18n minus glyph; `null` → "—". */
function formatTemp(value: number | null): string {
  const rounded = roundAwayFromZero(value);
  if (rounded === null) return t("forecast.precipPlaceholder");
  const celsius = t("forecast.unit.celsius");
  if (rounded < 0) return `${t("forecast.minus")}${Math.abs(rounded)}${celsius}`;
  return `${rounded}${celsius}`;
}

/**
 * Format a precip probability: a present value → "N%" (CLAMPED to 0..100, the valid
 * range per FR-COMPARE-02); an absent/non-finite `null` → the em-dash placeholder
 * (never a misleading "0%"). A real 0 stays "0%".
 */
function formatPrecip(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return t("forecast.precipPlaceholder");
  }
  // Clamp into the valid probability range before rounding so an out-of-range
  // upstream value can never render an impossible percent (e.g. "120%" / "-5%").
  const clamped = Math.min(100, Math.max(0, value));
  return `${roundAwayFromZero(clamped) ?? 0}${t("forecast.unit.percent")}`;
}

export function CompareSection() {
  const { location, setLocation } = useLocation();
  const { pins, pin, unpin, atCap } = usePins();

  const [compareOn, setCompareOn] = useState(false);
  // The per-city forecast cache (keyOf → state), in-memory ONLY (ADR-0003).
  const [cache, setCache] = useState<Record<string, CityForecastState>>({});

  // The active column is ALWAYS the active location's column (the single source of
  // truth): `keyOf(useLocation().location)`. "Make active" calls the locked
  // `setLocation`; in the app LocationProvider then re-renders this component with
  // the new `location` (so the `aria-current` cue moves). The `afterActivate` bump
  // below forces an immediate re-render right after `setLocation` so the cue re-reads
  // `useLocation()` without waiting on the host's own propagation — it does NOT by
  // itself change the location, it just guarantees a fresh read of it.
  const [, setAfterActivate] = useState(0);
  const activeKey = location ? keyOf(location) : null;

  // ── Per-city parallel fetch over the REUSED /api/forecast route (D4) ──────────
  // Each pinned city gets its OWN AbortController (a map keyed by `keyOf`) so we can
  // abort exactly the cities that leave the pin set WITHOUT touching the still-pinned
  // in-flight requests. A single shared controller would abort EVERY request when any
  // one city is pinned/unpinned mid-flight, stranding the survivors on "loading"
  // forever (the strand bug). `inFlightRef` tracks which keys have a request in the
  // air (so the effect never double-requests). `mountedRef` guards a late resolution
  // after unmount. `pinKeysRef` is the LIVE pin-membership set, synced after each
  // commit, so a resolution checks current membership (not a stale `pins` closure).
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const pinKeysRef = useRef<Set<string>>(new Set());

  // The set of pinned cities (a stable identity string so the effect only re-runs
  // when the SET changes, not on every render).
  const pinsKey = pins.map(keyOf).join("|");

  // Keep the live pin-membership set in sync after EACH commit (read by async fetch
  // resolutions to decide whether a city is still pinned — never a stale `pins`
  // closure, finding #4). Declared BEFORE the fetch effect so, on a render where the
  // pin set changed, this runs first and the fetch effect reads the fresh set.
  useEffect(() => {
    pinKeysRef.current = new Set(pins.map(keyOf));
  });

  useEffect(() => {
    // Set on (re)mount so a StrictMode mount→unmount→remount cycle re-enables
    // caching (the cleanup sets it false on the intermediate unmount).
    mountedRef.current = true;
    // Capture the ref'd collections so the cleanup operates on the instances that
    // existed for THIS mount (refs are stable objects across renders, so this also
    // satisfies the exhaustive-deps cleanup guidance).
    const controllers = controllersRef.current;
    const inFlight = inFlightRef.current;
    return () => {
      // On unmount, abort every in-flight request and clear the maps (no stale
      // setState after unmount — the console stays silent).
      mountedRef.current = false;
      for (const c of controllers.values()) c.abort();
      controllers.clear();
      inFlight.clear();
    };
  }, []);

  useEffect(() => {
    // No comparison shown / nothing pinned → no fetch (the empty state, no waste).
    // (The pruning below still runs so a city unpinned WHILE compare is off has its
    // in-flight request aborted and its cache entry dropped.)
    const pinned = pinKeysRef.current;

    // ── Prune cities that LEFT the pin set: abort ONLY their controllers (never a
    // still-pinned one), drop their in-flight + cache entries so a re-pin re-fetches.
    // These ref mutations live in the EFFECT BODY (a side effect), never inside a
    // setState updater — updaters must stay pure (React may double-invoke them).
    const removed: string[] = [];
    for (const [k, controller] of controllersRef.current) {
      if (!pinned.has(k)) {
        controller.abort();
        controllersRef.current.delete(k);
        inFlightRef.current.delete(k);
        removed.push(k);
      }
    }
    if (removed.length > 0) {
      setCache((prev) => {
        let changed = false;
        const next: Record<string, CityForecastState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (pinned.has(k)) next[k] = v;
          else changed = true; // a removed city's cache entry is dropped
        }
        return changed ? next : prev;
      });
    }

    if (!compareOn || pins.length === 0) return;

    // Fetch only the pinned cities whose cache entry is ABSENT or "failed" (so a
    // failed city RETRIES on the next run / re-pin), and that are not already in
    // flight — a successfully-cached city is never re-fetched (D4). All requests are
    // issued IN PARALLEL below (no awaiting one before starting the next).
    const toFetch = pins.filter((c) => {
      const k = keyOf(c);
      if (inFlightRef.current.has(k)) return false;
      const entry = cache[k];
      return entry === undefined || entry.status === "failed";
    });
    if (toFetch.length === 0) return;

    // Register a fresh per-city AbortController + mark in-flight up-front — in the
    // EFFECT BODY (side effects), so this is deterministic and runs exactly once.
    for (const c of toFetch) {
      const k = keyOf(c);
      inFlightRef.current.add(k);
      controllersRef.current.get(k)?.abort(); // supersede any prior controller
      controllersRef.current.set(k, new AbortController());
    }
    // Mark them loading (a pure functional update) so the columns render the calm
    // loading placeholders immediately.
    setCache((prev) => {
      const next = { ...prev };
      for (const c of toFetch) next[keyOf(c)] = { status: "loading" };
      return next;
    });

    const fetchOne = (city: Location): Promise<void> => {
      const k = keyOf(city);
      const controller = controllersRef.current.get(k);
      const url = `/api/forecast?lat=${encodeURIComponent(
        String(city.lat),
      )}&lon=${encodeURIComponent(String(city.lon))}`;
      // `fetch` is invoked SYNCHRONOUSLY here (before any await), so mapping over
      // `toFetch` registers ALL requests at once — the parallel, no-waterfall path.
      return fetch(url, { signal: controller?.signal })
        .then((res) => res.json())
        .then((body: unknown) => {
          inFlightRef.current.delete(k);
          controllersRef.current.delete(k);
          // Discard a resolution after unmount, for an aborted request, or for a
          // city no longer pinned (unpinned mid-flight) — never cache a stale result.
          if (
            !mountedRef.current ||
            controller?.signal.aborted ||
            !pinKeysRef.current.has(k)
          ) {
            return;
          }
          const valid = readForecast(body);
          setCache((prev) => ({
            ...prev,
            [k]: valid ? { status: "ok", forecast: valid } : { status: "failed" },
          }));
        })
        .catch(() => {
          inFlightRef.current.delete(k);
          controllersRef.current.delete(k);
          // An aborted request (the city left the pin set, or a re-fetch superseded
          // it) OR one resolving after unmount / for a no-longer-pinned city is
          // ignored silently (no console). Otherwise the column degrades to failed
          // (caught + RENDERED, never logged) — and is retried on a later re-pin.
          if (
            !mountedRef.current ||
            controller?.signal.aborted ||
            !pinKeysRef.current.has(k)
          ) {
            return;
          }
          setCache((prev) => ({ ...prev, [k]: { status: "failed" } }));
        });
    };

    // PARALLEL: every city's request is in flight before any resolves; one city's
    // failure does not reject the batch (allSettled), so the others still load.
    void Promise.allSettled(toFetch.map(fetchOne));
    // `cache` is read to skip already-cached cities but is intentionally NOT a dep:
    // re-running on every cache write would loop. The effect keys on the pin SET +
    // the toggle; the per-city in-flight guard prevents duplicate requests, and a
    // failed entry is retried on the next pin-set change / re-pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareOn, pinsKey]);

  const onMakeActive = useCallback(
    (city: Location) => {
      // The locked setter (the main forecast/map/background follow). Making the
      // already-active city active again is prevented by disabling that column's
      // control, so this is never a wasted call. Bump local state so the component
      // re-renders and re-reads the now-updated active location immediately, moving
      // the active-column cue regardless of how the host propagates the change.
      setLocation(city);
      setAfterActivate((n) => n + 1);
    },
    [setLocation],
  );

  const onPinCurrent = useCallback(() => {
    if (location) pin(location);
  }, [location, pin]);

  // Build the per-column models from the pure builder (the table stays dumb).
  const rows: CompareRow[] = useMemo(
    () => pins.map((city) => buildCompareRow(city, cache[keyOf(city)] ?? { status: "loading" })),
    [pins, cache],
  );

  const pinLabel = t("compare.pin");
  const toggleLabel = t("compare.toggle.label");
  const capCopy = t("compare.cap");
  const activeMarker = t("compare.active");
  const canPin = location !== null && !atCap;

  return (
    <section
      data-slot="compare"
      aria-label={t("compare.sectionLabel")}
      className="flex flex-col gap-3 md:col-span-2 xl:col-span-3"
    >
      {/* Controls header: pin + toggle (+ the calm cap message at the cap). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={pinLabel}
          title={atCap ? capCopy : undefined}
          disabled={!canPin}
          onClick={onPinCurrent}
        >
          {pinLabel}
        </Button>

        <button
          type="button"
          role="switch"
          aria-checked={compareOn}
          aria-label={toggleLabel}
          onClick={() => setCompareOn((on) => !on)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border border-border-strong px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            compareOn
              ? "bg-primary text-primary-foreground"
              : "bg-surface text-foreground hover:bg-background",
          )}
        >
          {toggleLabel}
        </button>

        {atCap ? (
          <p className="text-sm text-muted-foreground">{capCopy}</p>
        ) : null}
      </div>

      {/* Comparison region: empty state (no pins) OR the sticky table (toggle on). */}
      {pins.length === 0 ? (
        <Notice
          variant="empty"
          title={t("compare.empty.title")}
          description={t("compare.empty.description")}
        />
      ) : compareOn ? (
        <CompareTable
          rows={rows}
          pins={pins}
          cache={cache}
          activeKey={activeKey}
          activeMarker={activeMarker}
          onMakeActive={onMakeActive}
        />
      ) : null}

      {/* Chip row (rendered AFTER the table, hidden when nothing is pinned). */}
      {pins.length > 0 ? (
        <div data-slot="compare-chips" className="flex flex-wrap gap-2">
          {pins.map((city) => {
            const unpinName = `${t("compare.unpin")} ${city.name}`;
            return (
              <span
                key={keyOf(city)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1 text-sm text-foreground"
              >
                <span className="max-w-[12rem] truncate" title={city.name}>
                  {city.name}
                </span>
                <button
                  type="button"
                  aria-label={unpinName}
                  title={unpinName}
                  onClick={() => unpin(keyOf(city))}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

// ── The sticky-header 3-column comparison table (D2/D6, NFR-A11Y-01) ────────────
type CompareTableProps = {
  rows: CompareRow[];
  pins: Location[];
  cache: Record<string, CityForecastState>;
  activeKey: string | null;
  activeMarker: string;
  onMakeActive: (city: Location) => void;
};

function CompareTable({
  rows,
  pins,
  cache,
  activeKey,
  activeMarker,
  onMakeActive,
}: CompareTableProps) {
  const errorCopy = t("compare.error");
  const makeActivePrefix = t("compare.makeActive");

  // Row groups: Saturday then Sunday, each with hi/lo, precip, comfort metric rows.
  const groups: { label: string; pick: (row: CompareRow) => DayCells }[] = [
    { label: t("compare.header.saturday"), pick: (r) => r.saturday },
    { label: t("compare.header.sunday"), pick: (r) => r.sunday },
  ];
  const metrics: { label: string }[] = [
    { label: t("compare.header.hiLo") },
    { label: t("compare.header.precip") },
    { label: t("compare.header.comfort") },
  ];

  return (
    <div data-slot="compare-table" className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {/* Corner cell — intentionally NOT scope=col (it labels no city). */}
            <td className="sticky top-0 z-10 bg-surface px-3 py-2" />
            {pins.map((city) => {
              const key = keyOf(city);
              const isActive = activeKey !== null && key === activeKey;
              const makeActiveName = `${makeActivePrefix} ${city.name}`;
              const state = cache[key];
              const failed = state?.status === "failed";
              return (
                <th
                  key={key}
                  scope="col"
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "sticky top-0 z-10 bg-surface px-3 py-2 align-bottom",
                    isActive && "border-b-2 border-primary",
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="max-w-[10rem] truncate font-semibold"
                      title={city.name}
                    >
                      {city.name}
                    </span>
                    {isActive ? (
                      <span className="text-xs font-medium text-primary">
                        {activeMarker}
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant={isActive ? "primary" : "outline"}
                      size="sm"
                      aria-label={makeActiveName}
                      aria-pressed={isActive}
                      title={makeActiveName}
                      disabled={isActive}
                      onClick={() => onMakeActive(city)}
                    >
                      {makeActivePrefix}
                    </Button>
                    {failed ? (
                      <span className="max-w-[10rem] text-xs font-normal text-muted-foreground text-balance">
                        {errorCopy}
                      </span>
                    ) : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) =>
            metrics.map((metric, mi) => (
              <tr key={`${group.label}-${metric.label}`} className="border-t border-border">
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  <span className="text-foreground">{group.label}</span>
                  {" · "}
                  {metric.label}
                </th>
                {rows.map((row) => {
                  const cells = group.pick(row);
                  return (
                    <DayMetricCell key={row.key} cells={cells} metricIndex={mi} />
                  );
                })}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

// One metric cell for a city's day: hi/lo (0), precip (1), or comfort (2).
function DayMetricCell({
  cells,
  metricIndex,
}: {
  cells: DayCells;
  metricIndex: number;
}) {
  const placeholder = t("forecast.precipPlaceholder");
  if (!cells) {
    return <td className="px-3 py-2 text-center tabular-nums">{placeholder}</td>;
  }
  if (metricIndex === 0) {
    return (
      <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
        {formatTemp(cells.tempMax)} / {formatTemp(cells.tempMin)}
      </td>
    );
  }
  if (metricIndex === 1) {
    return (
      <td className="px-3 py-2 text-center tabular-nums">
        {formatPrecip(cells.precipProbability)}
      </td>
    );
  }
  return (
    <td className="px-3 py-2 text-center">
      {cells.comfortValue !== null ? (
        <ComfortBadge value={cells.comfortValue} />
      ) : (
        placeholder
      )}
    </td>
  );
}

export default CompareSection;
