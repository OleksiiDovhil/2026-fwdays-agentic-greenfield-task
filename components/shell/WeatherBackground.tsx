"use client";

// The condition-driven animated background — design.md D2/D3/D4/D5/D6/D8,
// FR-ANIM-01 (condition-driven layer), FR-ANIM-02 (day/night from the location's
// sun times), FR-ANIM-03 (prefers-reduced-motion), FR-ANIM-04 (never blocks
// interaction), NFR-A11Y-01 (decorative), NFR-OBS-01 (honest degradation +
// console silence), NFR-PERF-03 (CSS gradients + a small fixed count of CSS
// particles; no canvas/WebGL, no animation library, no new dependency).
//
// `"use client"` (the ARCHITECTURE LESSON): it reads the active-location-derived
// snapshot via `useWeather()`, the `prefers-reduced-motion` `matchMedia`, and the
// location-local "now" on the client — all client-only because `app/page.tsx` is
// statically prerendered. The render is a pure function of
// `(snapshot, nowLocal, reducedMotion)`, so when the active location changes or
// its forecast updates (ForecastSection publishes a new snapshot) the background
// re-renders with the new gradient + effect and NO effect from the previous
// location remains.
//
// A11Y DECISION (task 1.1, design.md D7, NFR-A11Y-01): the layer is purely
// decorative and renders NO readable data, so it carries `aria-hidden="true"` and
// NOTHING else — no `aria-label`, no `role`. `aria-hidden` alone is the correct
// decorative treatment: an `aria-label` on an `aria-hidden` node is dead (never
// announced), and a `role="presentation"` is redundant with `aria-hidden`. (The
// `shell.background.label` i18n string is left in the dictionary, unused here.)
import { useEffect, useState } from "react";
import { useWeather } from "@/components/providers/WeatherProvider";
import { isDaytime } from "@/lib/animated-bg/day-night";
import { conditionToScene, type GradientKind, type ParticleKind } from "@/lib/animated-bg/scene";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Read `prefers-reduced-motion: reduce`, SSR/jsdom-guarded (ThemeProvider pattern). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// Fixed, bounded particle counts (NFR-PERF-03) — constants, never data-driven, so
// they never scale with payload size. Each particle is a positioned element
// animated by CSS keyframes (transform/opacity only, GPU-friendly) in globals.css.
const RAIN_COUNT = 18;
const SNOW_COUNT = 16;
const CLOUD_COUNT = 3;

// A small deterministic spread so streaks/flakes/clouds are not all identical —
// pure arithmetic (no Math.random), so renders are stable and test-reproducible.
function spread(i: number, count: number): { left: number; delay: number; dur: number } {
  const left = ((i + 0.5) / count) * 100;
  const delay = (i % 6) * 0.45;
  const dur = 0.9 + (i % 5) * 0.18;
  return { left, delay, dur };
}

/** Day/night base gradient. Tailwind utility gradients (no new AA-graded color). */
function GradientLayer({
  daytime,
  kind,
}: {
  daytime: boolean;
  kind: GradientKind;
}) {
  // The day/night base; the scene `kind` adds a calm tint overlay (clear vs
  // cloudy vs fog vs storm) without animation.
  const base = daytime
    ? "bg-gradient-to-b from-sky-200 via-sky-100 to-amber-50"
    : "bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950";
  const tint = TINT[kind];
  return (
    <div className="absolute inset-0">
      <div data-gradient={daytime ? "day" : "night"} className={`absolute inset-0 ${base}`} />
      {tint ? <div aria-hidden="true" className={`absolute inset-0 ${tint}`} /> : null}
    </div>
  );
}

// Calm condition tint overlays layered over the day/night base (decorative only).
const TINT: Record<GradientKind, string | null> = {
  clear: null,
  cloudy: "bg-slate-400/20",
  fog: "bg-slate-300/30",
  storm: "bg-slate-600/30",
};

function RainLayer() {
  return (
    <div data-particle="rain" className="absolute inset-0 overflow-hidden">
      {Array.from({ length: RAIN_COUNT }, (_, i) => {
        const { left, delay, dur } = spread(i, RAIN_COUNT);
        return (
          <span
            key={i}
            className="animated-bg-rain absolute block h-6 w-px bg-sky-300/50"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function SnowLayer() {
  return (
    <div data-particle="snow" className="absolute inset-0 overflow-hidden">
      {Array.from({ length: SNOW_COUNT }, (_, i) => {
        const { left, delay, dur } = spread(i, SNOW_COUNT);
        return (
          <span
            key={i}
            className="animated-bg-snow absolute block h-1.5 w-1.5 rounded-full bg-white/70"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${(dur * 4).toFixed(2)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function CloudsLayer() {
  return (
    <div data-particle="clouds" className="absolute inset-0 overflow-hidden">
      {Array.from({ length: CLOUD_COUNT }, (_, i) => (
        <span
          key={i}
          className="animated-bg-cloud absolute block h-16 w-40 rounded-full bg-white/25 blur-xl"
          style={{
            top: `${12 + i * 22}%`,
            animationDelay: `${i * 3}s`,
            animationDuration: `${40 + i * 8}s`,
          }}
        />
      ))}
    </div>
  );
}

function ParticleLayer({ particle }: { particle: ParticleKind }) {
  if (particle === "rain") return <RainLayer />;
  if (particle === "snow") return <SnowLayer />;
  if (particle === "clouds") return <CloudsLayer />;
  return null; // "none" → gradient only, no [data-particle] node emitted at all.
}

export function WeatherBackground() {
  const { weather } = useWeather();

  // `now` is the ABSOLUTE current instant (epoch ms) — the same point in time
  // everywhere on Earth; `isDaytime` shifts it into the LOCATION's frame using the
  // snapshot's `utcOffsetSeconds`, so day/night follows the location's sun times,
  // not the viewer's clock (FR-ANIM-02). The reduced-motion preference is a CLIENT
  // read (the ARCHITECTURE LESSON). Seed both from a guarded read so the first
  // paint is sensible, then refresh once one microtask AFTER mount (the locked
  // TopClock D2 pattern: deferred, never a synchronous setState in the effect
  // body). Never reads `window` unguarded → the console stays clean under
  // SSR/jsdom.
  const [now, setNow] = useState<number>(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    // Guard the deferred set against a same-tick unmount (no stale setState; no
    // "update on an unmounted component" warning — NFR-OBS-01).
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setNow(Date.now());
      setReducedMotion(prefersReducedMotion());
    });
    // Low-frequency re-sample (~60s): a long-lived session transitions day↔night
    // as the LOCATION crosses its sunrise/sunset. Each tick RE-READS the live clock
    // (resync, not a counter — the TopClock discipline); no re-fetch, cheap, and
    // cleared on unmount (no orphan tick, console silent). Under fake timers (the
    // jsdom tests) this never fires unless advanced, so the deterministic instant
    // is the microtask-deferred read above.
    const id = setInterval(() => {
      if (active) setNow(Date.now());
    }, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // The scene + day/night are a pure function of the snapshot + the absolute
  // instant. A not-loaded snapshot (no location / no forecast / failed-or-invalid
  // fetch) has a null category, null sun times, and no offset → `conditionToScene
  // (null)` is gradient-only and `isDaytime(_, null, null, …)` is day, so it
  // deterministically yields the calm neutral DAY gradient with no effect
  // (NFR-OBS-01).
  const scene = conditionToScene(weather.todayCategory);
  const daytime = isDaytime(now, weather.sunrise, weather.sunset, weather.utcOffsetSeconds);

  // Under reduced motion render the STATIC gradient ONLY — omit the particle
  // NODES entirely (not merely pause them), while STILL applying the day/night
  // choice (FR-ANIM-03). Motion permitted + a mapped effect → the effect renders
  // (required, not optional).
  const showParticles = !reducedMotion && scene.particle !== "none";

  return (
    <div
      data-slot="weather-background"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <GradientLayer daytime={daytime} kind={scene.gradient} />
      {showParticles ? <ParticleLayer particle={scene.particle} /> : null}
    </div>
  );
}

export default WeatherBackground;
