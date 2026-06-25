## Why

`add-app-shell` is the first, foundational slice: it establishes the single-page
frame and the cross-cutting conventions every later capability reuses, so getting
its shapes right once prevents churn and drift across the whole MVP. It owns the
responsive layout (FR-SHELL-01/02), the first-load empty state with a centered
search slot (FR-SHELL-03), and the app-wide mechanisms the plan pins here (§3a,
§5a): the centralized Ukrainian-first string layer (NFR-I18N-01), the active
location URL-as-state (`?lat=&lon=&name=`) that city-search, map, forecast,
animated-bg, and weekend-compare all consume, the calm shared inline error/empty
pattern (NFR-OBS-01), the light/dark theme, the AA-contrast palette tokens
(NFR-A11Y-02), and the named slot composition so later slices touch their own
files, never `app/page.tsx`.

## What Changes

- **Design tokens + utilities:** a calm light/dark palette as Tailwind 4 `@theme`
  tokens with CSS variables in `app/globals.css`; `lib/utils.ts` `cn()` (clsx +
  tailwind-merge); shadcn-convention cva primitives (Button, Card, Badge, Input).
- **Pure domain logic (framework-free, TC-PURE-01):** `lib/i18n` typed dictionary
  (`uk.ts` default + `en.ts` fallback + `index.ts` `t()`), namespaced per domain
  (`uk.shell.*`); `lib/location` (`types.ts`, pure URL `parse`/`serialize`, zod
  `validation.ts`); `lib/a11y/contrast.ts` (WCAG ratio + palette-pair checker).
- **Providers + shared UI:** `LocationProvider` (`"use client"`, syncs the active
  `Location` to the URL via `next/navigation`, exposes `useLocation()`);
  `ThemeProvider` (`"use client"`, light/dark + system, sets `data-theme`);
  `components/ui/Notice.tsx` — the one calm inline error/empty/info primitive
  reused everywhere instead of a generic 500 or a silent blank.
- **Layout + slot composition:** server `app/layout.tsx` (`<html lang="uk">`,
  providers wrap `{children}`, metadata) and server `app/page.tsx` composing named
  slots — `<AppHeader/>` (logo, theme indicator, clock slot), `<SearchHero/>`
  (first-load hero + centered search slot), a main content region, `<AppFooter/>`
  (Open-Meteo + OpenStreetMap credits per BC-BRAND-02, jokes slot), and a
  `<WeatherBackground/>` slot. Clock/search/forecast/map/compare/jokes/background
  are STUB placeholders this slice; later slices fill their own slot files.
- **Responsive grid:** Tailwind breakpoints — single column on mobile, two columns
  at `md` (768 px), three columns at `xl` (1280 px) (FR-SHELL-02).

## Capabilities

### New Capabilities

- `app-shell`: the foundational single-page frame — responsive layout, first-load
  empty state, centralized Ukrainian-first strings, active-location URL state,
  shared inline error/empty pattern, theme, AA-contrast tokens, and named slots.

### Modified Capabilities

<!-- None. This change introduces the app-shell capability; no existing spec changes. -->

## Impact

- **Specs:** adds `openspec/specs/app-shell/spec.md` (via the delta in
  `specs/app-shell/spec.md`, Option B) on archive.
- **Code (new):** `app/globals.css` (rewrite), `app/layout.tsx` (rewrite),
  `app/page.tsx` (rewrite), `lib/utils.ts`, `lib/i18n/{uk,en,index}.ts`,
  `lib/location/{types,url,validation}.ts`, `lib/a11y/contrast.ts`,
  `components/providers/{LocationProvider,ThemeProvider}.tsx`,
  `components/ui/{Notice,Button,Card,Badge,Input}.tsx`, slot components
  `components/shell/{AppHeader,SearchHero,AppFooter,WeatherBackground}.tsx`.
- **Dependencies:** none added — clsx, tailwind-merge, cva, zod, lucide-react,
  tailwindcss 4 are already installed. No database, no auth, no email (ADR-0003).
- **Cross-cutting conventions:** later slices extend `lib/i18n` namespaces, fill
  slot files, and reuse `Notice` + `useLocation()` + the palette tokens.
- **Out of scope:** the real search input (city-search), and forecast/map/anim/
  compare/clock/jokes content — those are owning capabilities' slices.
