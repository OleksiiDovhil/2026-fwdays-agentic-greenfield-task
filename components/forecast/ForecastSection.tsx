"use client";

// The forecast section — design.md D3/D4, FR-FORECAST-01..05, NFR-OBS-01,
// NFR-PERF-03. The ONLY place React state / `fetch` / the in-memory cache / the
// dynamically-imported Recharts chart concerns live for forecast. Client-DRIVEN per
// the ARCHITECTURE LESSON (current-state): `app/page.tsx` is statically prerendered,
// so anything depending on the active location MUST fetch on the client off
// `useLocation()` — a server component would bake build-time/server-tz values.
//
// It reads `useLocation()` for the LOCATION only (never the setter; it does not
// re-parse the URL). On a location change it fetches the INTERNAL `/api/forecast`
// route (NEVER Open-Meteo directly) and holds the last successful, schema-valid
// `Forecast` in an in-memory, location-tagged cache (no cookies / localStorage /
// server store, ADR-0003). A response is rendered/cached ONLY IF its location
// identity still equals the active location on resolve — a late out-of-order
// response for a no-longer-active location is discarded (abort + identity guard,
// the latest-wins discipline SearchBox uses). A's cache is never shown under B.
//
// Render order (D3): WeekendHighlight (top) → the 7-card day grid → the hourly chart
// → today's sunrise/sunset. Every failure / no-location / loading state reduces to
// one calm inline `<Notice>` (honest degradation, NFR-OBS-01); caught errors are
// RENDERED, never logged, and the console stays silent on a healthy session.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocation } from "@/components/providers/LocationProvider";
import {
  useWeather,
  NOT_LOADED_WEATHER,
  type WeatherSnapshot,
} from "@/components/providers/WeatherProvider";
import { WeekendHighlight } from "@/components/comfort/WeekendHighlight";
import { DayCard } from "@/components/forecast/DayCard";
import { Notice } from "@/components/ui/Notice";
import { nextHours } from "@/lib/forecast/hourly";
import { toComfortInput, type Forecast } from "@/lib/forecast/types";
import { describeWeather } from "@/lib/forecast/weather-code";
import { comfortScore, upcomingWeekend } from "@/lib/scoring/comfort";
import type { Location } from "@/lib/location/types";
import { t } from "@/lib/i18n";

// Recharts is loaded ONLY here, lazily, client-only, behind the section, so it is
// NEVER in the initial bundle and never runs on the server (NFR-PERF-03, D5). The
// ChartSkeleton has the SAME footprint as the chart so swapping it in causes no
// layout shift (CLS). `ssr: false` is allowed because this is a Client Component.
const HourlyChart = dynamic(() => import("@/components/forecast/HourlyChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

// Same fixed height as HourlyChart's container — protects CLS while the lazy chunk
// loads (NFR-PERF-02/03).
function ChartSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[200px] w-full animate-pulse rounded-lg border border-border bg-surface"
    />
  );
}

/** A stable in-memory cache key for a location identity ({lat,lon} rounded). */
function keyOf(location: Location): string {
  return `${location.lat.toFixed(4)},${location.lon.toFixed(4)}`;
}

/**
 * Narrow an untrusted `/api/forecast` body to a renderable `Forecast` WITHOUT
 * trusting it. The route already returns the typed shape; this is the client belt:
 * a typed `{ error }`, an unreadable body, or a schema-valid-but-ZERO-day forecast
 * → `null` (the section shows the degraded state, never an empty grid).
 */
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

/** "HH:MM" from an ISO-local "YYYY-MM-DDTHH:MM..." string, or the placeholder. */
function formatTime(time: string | null): string {
  if (typeof time !== "string") return t("forecast.precipPlaceholder");
  const match = /T(\d{2}:\d{2})/.exec(time);
  return match ? match[1] : t("forecast.precipPlaceholder");
}

export function ForecastSection() {
  const { location } = useLocation();
  // The location identity is the effect's only dependency (a stable string), so a
  // re-render WITHOUT a location change does NOT re-fetch (cache hit), and a change
  // does (FR-FORECAST-05).
  const key = location ? keyOf(location) : null;

  const [forecast, setForecast] = useState<Forecast | null>(null);
  // The location identity the cached `forecast` belongs to — the view shows the
  // forecast ONLY when this equals the active key (so A's cache is never shown
  // under B).
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  // The location identity whose last fetch FAILED — the error Notice shows ONLY for
  // the active key (so a failure for B is never shown under A, and vice-versa).
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // The currently-active key (for the discard-on-resolve identity guard) and the
  // in-flight controller (to abort the previous request on a location change).
  const activeKeyRef = useRef<string | null>(key);
  const abortRef = useRef<AbortController | null>(null);
  // Guard a late resolution after unmount (no stale setState; console stays clean).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Run a fetch for `loc` (tagged with its key). Every setState lives in the ASYNC
  // `.then`/`.catch` callbacks (never synchronously in the effect body), so there is
  // no synchronous-setState-in-effect cascade; the loading state is DERIVED at
  // render time (see below), mirroring SearchBox's latest-wins discipline.
  const runFetch = useCallback((loc: Location, fetchKey: string) => {
    // Abort the previous in-flight request (a new location supersedes it).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const url = `/api/forecast?lat=${encodeURIComponent(
      String(loc.lat),
    )}&lon=${encodeURIComponent(String(loc.lon))}`;

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((body: unknown) => {
        // Discard a response that resolves for a NO-LONGER-ACTIVE location (the
        // late out-of-order A→B→A case) or after unmount — never cached/rendered.
        if (!mountedRef.current || fetchKey !== activeKeyRef.current) return;
        const valid = readForecast(body);
        if (valid) {
          // A validated response supersedes any prior cache and is tagged with its
          // own location identity.
          setForecast(valid);
          setCacheKey(fetchKey);
          setErrorKey((prev) => (prev === fetchKey ? null : prev));
        } else {
          // A typed error / unreadable / zero-day body → the degraded state for
          // THIS key. The stale forecast is NOT shown under a DIFFERENT location
          // (its cacheKey no longer equals the active key); a same-location
          // transient failure keeps the cache visible (the cache check wins).
          setErrorKey(fetchKey);
        }
      })
      .catch(() => {
        // A superseded/aborted request OR one resolving after unmount is ignored
        // silently (no Notice, no console). Otherwise → the calm error Notice for
        // this key, RENDERED (never logged), the rest of the page interactive.
        if (!mountedRef.current || fetchKey !== activeKeyRef.current) return;
        setErrorKey(fetchKey);
      });
  }, []);

  useEffect(() => {
    activeKeyRef.current = key;

    // No active location → no fetch (spec: a location must be chosen first; no
    // request, no never-resolving spinner). The render short-circuits on
    // `!location`, so no state reset is needed here (and none is set synchronously
    // in the effect body — avoiding a setState cascade).
    if (!location || key === null) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    runFetch(location, key);
    return () => abortRef.current?.abort();
    // `location` is read via `runFetch` but `key` is its stable identity; re-running
    // only on a key change is the intended cache behaviour (FR-FORECAST-05).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, runFetch]);

  // The cached forecast is shown ONLY for the active location (no cross-location
  // stale data). A transient SAME-location failure keeps the cache visible (spec:
  // "Cached forecast covers a transient failure") because this READY check wins over
  // the error/loading branches below.
  const showForecast = forecast !== null && cacheKey === key && key !== null;
  // The error Notice shows only when THIS location's fetch failed and no cache
  // covers it; otherwise (location set, no cache, no error) the state is loading.
  const showError = !showForecast && errorKey === key && key !== null;

  // Compute each day's comfort value ONCE and reuse it for the weekend summary and
  // the per-card badge (D3).
  const comfortValues = useMemo(
    () => (showForecast ? forecast.days.map((d) => comfortScore(toComfortInput(d)).value) : []),
    [showForecast, forecast],
  );

  // ── Cross-slice publish into the shared WeatherContext (design.md D1) ────────
  // ADDITIVE ONLY: this relays today's category + sun times to the decorative
  // `WeatherBackground` so it issues NO second weather fetch (TC-DATA-01,
  // NFR-COST-01). It changes NONE of the fetch / cache / latest-wins / render
  // logic above. When a validated forecast is shown for the active location it
  // publishes today's snapshot; on no-location / no-forecast / failed-or-invalid
  // fetch it publishes the not-loaded default.
  const { publish } = useWeather();
  const publishDay = showForecast ? forecast.days[0] : null;
  const todayCategory = publishDay ? describeWeather(publishDay.weatherCode).category : null;
  const todaySunrise = publishDay ? publishDay.sunrise : null;
  const todaySunset = publishDay ? publishDay.sunset : null;
  // The LOCATION's UTC offset, so the background places "now" in the location's
  // frame (FR-ANIM-02). Read defensively (a body that omits it → null) so the
  // publish stays total.
  const todayOffset =
    showForecast && typeof forecast.utcOffsetSeconds === "number"
      ? forecast.utcOffsetSeconds
      : null;
  useEffect(() => {
    const snapshot: WeatherSnapshot = showForecast
      ? {
          todayCategory,
          sunrise: todaySunrise,
          sunset: todaySunset,
          utcOffsetSeconds: todayOffset,
          isLoaded: true,
        }
      : NOT_LOADED_WEATHER;
    publish(snapshot);
    // Keyed on the DERIVED snapshot primitives so it fires only when they change
    // (no render loop); `publish` is stable from the provider.
  }, [showForecast, todayCategory, todaySunrise, todaySunset, todayOffset, publish]);

  const sectionLabel = t("forecast.sectionLabel");

  // No active location → the calm, inviting no-location state (role=status, an info
  // Notice), no fetch, no grid (spec: a location must be chosen first).
  if (!location) {
    return (
      <section
        data-slot="forecast"
        aria-label={sectionLabel}
        className="flex flex-col gap-4"
      >
        <Notice variant="info" title={t("forecast.noLocation")} description="" />
      </section>
    );
  }

  if (!showForecast) {
    // Error → the failed-fetch Notice (role=alert). Loading → a calm, quiet skeleton
    // (NO ARIA role) so a newly selected location's in-flight fetch reads as a
    // momentary busy state, not an announced status (design D4: "skeleton or a quiet
    // status"); the `forecast.loading` copy labels it for assistive tech via
    // aria-label without flooding a live region. Both inline, never a toast / 500.
    return (
      <section
        data-slot="forecast"
        aria-label={sectionLabel}
        className="flex flex-col gap-4"
      >
        {showError ? (
          <Notice variant="error" title={t("forecast.error")} description="" />
        ) : (
          <div
            aria-label={t("forecast.loading")}
            className="flex flex-col gap-3"
          >
            <div className="h-12 w-full animate-pulse rounded-lg border border-border bg-surface" />
            <div className="h-[200px] w-full animate-pulse rounded-lg border border-border bg-surface" />
          </div>
        )}
      </section>
    );
  }

  const weekend = upcomingWeekend(
    forecast.days.map((d, i) => ({ time: d.time, value: comfortValues[i] })),
  );
  const hourly = nextHours(forecast.hourly, 48);
  const today = forecast.days[0];

  return (
    <section
      data-slot="forecast"
      aria-label={sectionLabel}
      className="flex flex-col gap-4 md:col-span-2 xl:col-span-3"
    >
      <div data-slot="weekend-highlight">
        <WeekendHighlight weekend={weekend} />
      </div>

      <div
        data-slot="day-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
      >
        {forecast.days.map((day, i) => (
          <DayCard key={day.time} day={day} comfortValue={comfortValues[i]} />
        ))}
      </div>

      <div data-slot="hourly-chart">
        <HourlyChart data={hourly} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span>
          {t("forecast.sunrise")} {formatTime(today.sunrise)}
        </span>
        <span>
          {t("forecast.sunset")} {formatTime(today.sunset)}
        </span>
      </div>
    </section>
  );
}

export default ForecastSection;
