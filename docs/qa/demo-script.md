# Demo Script — Weather Explorer

The walkthrough used to produce the demo recordings. It follows the product's
core loop — **"decide on this weekend"** (`docs/product-brief.md` §"Decide on
this weekend") — as one continuous story, with branch scenes for the secondary
flows. Each scene names the requirements it shows and the **decisive moment** the
recording must capture.

There is no login: the actor is an anonymous visitor. The interface is
Ukrainian; on-screen text is noted where fixed.

## Recording rules (carry into Phase 6 capture)

- **One clip per viewport.** Do not resize the viewport mid-clip — that produces
  stretched frames. Responsive proof (Scene 7) uses **separate** clips per width
  (e.g. `07-desktop-1280`, `07b-tablet-768`, `07c-mobile-360`), each with its
  viewport equal to the video size.
- Each clip's manifest entry must list the FR ids it proves (the traceability
  validator reads them).
- Capture is **env-gated**: recordings are produced via the chrome-devtools MCP
  when connected (no Playwright, TC-STACK-05 / ADR-0004). Until then these scenes
  are the spec for the capture, and the recording column stays empty (reported
  pending, never faked).

---

## Scene 1 — Land on a calm, empty screen
**Proves:** FR-SHELL-03, FR-SHELL-01, FR-CLOCK-01, BC-PRIVACY-02
**Steps:** open the app in a fresh tab. Pause on the empty hero: the centered
city search, the logo + theme indicator, the live header clock ticking.
**Decisive moment:** no location prompt appears on load (privacy), and the clock
visibly advances by a second.

## Scene 2 — Choose a place by name
**Proves:** FR-SEARCH-01, FR-SEARCH-02, FR-SEARCH-03
**Steps:** type `Львів` into the search. Let the debounced suggestions appear;
show a suggestion row's city / region / country / flag. Click the top suggestion.
**Decisive moment:** the address bar updates to `?lat=…&lon=…&name=…` as the
city loads — the shareable view.

## Scene 3 — Read the weekend answer first
**Proves:** FR-COMFORT-05, FR-COMFORT-04, FR-COMFORT-03, FR-FORECAST-02
**Steps:** with Lviv loaded, move straight to the highlighted **weekend** block
at the top of the forecast, then pan across the seven day cards and their comfort
badges.
**Decisive moment:** the weekend highlight shows the Sat+Sun comfort with a
short, calm one-sentence Ukrainian rationale (no emoji, no exclamation) — the
headline answer to "is it worth going?". This is the heart of the demo.

## Scene 4 — Read the detail: hourly + sun
**Proves:** FR-FORECAST-01, FR-FORECAST-03, FR-FORECAST-04
**Steps:** scroll to the 48-hour hourly temperature chart; then the sunrise/
sunset line beneath it.
**Decisive moment:** the hourly line renders (lazy-loaded chart) and today's
sunrise/sunset are shown for the active city.

## Scene 5 — See it in place, set by map
**Proves:** FR-MAP-01, FR-MAP-02, FR-MAP-04, FR-MAP-03, FR-FORECAST-05
**Steps:** show the map bounded to Lviv with its marker + city popup and the
"© OpenStreetMap contributors" attribution. Then click a different point on the
map.
**Decisive moment:** clicking the map reverse-geocodes the point, the city name
updates, and the forecast + background refresh for the new location.

## Scene 6 — Feel the weather (background + day/night)
**Proves:** FR-ANIM-01, FR-ANIM-02, FR-ANIM-04
**Steps:** call out the animated background reflecting the condition. Then load a
city that is currently at night in a far time zone.
**Decisive moment:** the night-side city shows a **night** gradient even though
it is daytime for the viewer — day/night follows the location's clock, not the
visitor's; and clicks pass through the background to the controls.

## Scene 7 — Responsive layout (separate clips per viewport)
**Proves:** FR-SHELL-02
**Steps:** with a city loaded, record **three separate clips**, one per width —
desktop (1280, three columns), tablet (768, two columns), mobile (360, one
column).
**Decisive moment:** the column count changes across the three clips; content
reflows cleanly. (Never resize within a single clip.)

## Scene 8 — Compare destinations for the weekend
**Proves:** FR-COMPARE-01, FR-COMPARE-02, FR-COMPARE-03
**Steps:** pin Lviv, then pin two more candidate cities (chips appear). Turn on
"Compare weekend". Show the 3-column Sat/Sun table (hi/lo, precip %, comfort).
Click "make active" on another column.
**Decisive moment:** the side-by-side weekend table lets the visitor pick the
best city, and "make active" switches the main view while keeping the pins and
the table open (the active marker moves).

## Scene 9 — Honest under failure (negative scene)
**Proves:** NFR-OBS-01, FR-SEARCH-05, FR-FORECAST-01
**Steps:** with DevTools set to Offline (or blocking Open-Meteo), attempt a
search and a forecast load; then restore the network and retry. Also show a
zero-result search (`zzzzqqqq`) producing the inline **«Нічого не знайдено»**.
**Decisive moment:** no crash page, no blank screen, no error toast — only a
calm visible Ukrainian message — and a clean DevTools console throughout; the
retry succeeds once the network returns.

---

## Scene → capability → requirement map

| Scene | Capability | Requirements shown |
|---|---|---|
| 1 | app-shell, top-clock | FR-SHELL-01, FR-SHELL-03, FR-CLOCK-01, BC-PRIVACY-02 |
| 2 | city-search | FR-SEARCH-01, FR-SEARCH-02, FR-SEARCH-03 |
| 3 | comfort-score, forecast | FR-COMFORT-03, FR-COMFORT-04, FR-COMFORT-05, FR-FORECAST-02 |
| 4 | forecast | FR-FORECAST-01, FR-FORECAST-03, FR-FORECAST-04 |
| 5 | map | FR-MAP-01, FR-MAP-02, FR-MAP-03, FR-MAP-04; FR-FORECAST-05 |
| 6 | animated-bg | FR-ANIM-01, FR-ANIM-02, FR-ANIM-04 |
| 7 | app-shell | FR-SHELL-02 |
| 8 | weekend-compare | FR-COMPARE-01, FR-COMPARE-02, FR-COMPARE-03 |
| 9 | (cross-cutting) | NFR-OBS-01, FR-SEARCH-05, FR-FORECAST-01 |

Scenes also covered by manual cases: see `manual-test-plan.md` MT-01 → MT-18.
FR-SEARCH-04 (Enter selects a lone suggestion), FR-SEARCH-06 ("Use my location"),
and FR-ANIM-03 (reduced motion) are covered in the manual plan (MT-03, MT-05,
MT-15) and may be added as short supplementary clips if time allows.
