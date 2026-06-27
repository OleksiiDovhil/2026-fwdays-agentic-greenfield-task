# Manual Test Plan — Weather Explorer

Step-by-step scenarios a **non-developer** can run against the live app in a
browser. Each case lists what it covers (by requirement id), the exact steps,
the objectively checkable expected result, and a Pass/Fail line to mark.

## Environment

- **Browser:** Google Chrome, latest, on desktop (1280 px+ wide) unless a step
  says otherwise. A few cases also use a phone-width window (360 px) and a
  tablet width (768 px) — resize the window or use Chrome DevTools device
  toolbar (the small phone/tablet icon).
- **Accounts:** none. Weather Explorer has no sign-in, no accounts, no cookies
  (it is keyless and privacy-first). Anyone who can open the URL is a full user.
- **URL:** the deployed app URL (Vercel preview/production) or, locally,
  `npm run build && npm start` then `http://localhost:3000`.
- **Network:** a normal internet connection; the app calls the free Open-Meteo
  and OpenStreetMap services. A couple of cases deliberately go offline.
- **Language:** the interface is Ukrainian. Expected on-screen text below is
  given in Ukrainian where it is fixed, with an English gloss in (brackets).

Tip: keep the Chrome DevTools **Console** tab open (press F12). On a healthy
session it must stay empty — no red errors, no yellow warnings (NFR-OBS-01).

---

## MT-01 First load shows the empty hero and centered search
**Covers:** FR-SHELL-03, FR-SHELL-01
**Steps:**
1. Open the app URL in a fresh tab (no `?lat=` in the address bar).
2. Look at the page before doing anything.
**Expected:**
- A hero with welcome copy and a single, prominently **centered** city search
  box. No forecast, no map yet.
- The top bar shows the app logo and a theme indicator; a live clock is visible
  in the header (see MT-11).
- No location was requested: the browser did **not** show a "allow location"
  prompt on load.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-02 Search a city and select it
**Covers:** FR-SEARCH-01, FR-SEARCH-02, FR-SEARCH-03
**Steps:**
1. From the empty state, click the search box and type `Львів` (or `Lviv`).
2. Wait about half a second without pressing Enter.
3. Read the suggestion list, then click the first suggestion.
**Expected:**
- A short list of suggestions appears after you stop typing (debounced). Each
  row shows the city name, its region, the country, and an optional flag.
- Clicking a suggestion loads that city: the forecast, map, and background
  appear.
- The address bar now contains `?lat=…&lon=…&name=…` for the chosen city — copy
  the URL, open it in a new tab, and the **same** city loads with no extra
  steps (shareable view).
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-03 Pressing Enter selects a lone suggestion
**Covers:** FR-SEARCH-04
**Steps:**
1. In the search box, type a city name specific enough to return exactly one
   suggestion (e.g. a long/unique name; if several appear, keep typing until one
   remains).
2. With a single suggestion showing, press **Enter**.
**Expected:** the single suggestion is selected and its location loads — the
same as clicking it.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-04 No matches shows a calm inline message (negative)
**Covers:** FR-SEARCH-05
**Steps:**
1. In the search box, type a nonsense string that matches no city, e.g.
   `zzzzqqqq`.
2. Wait for the suggestions to settle.
**Expected:**
- An inline message **«Нічого не знайдено»** ("Nothing found") appears under the
  search box.
- There is **no** pop-up error, no red toast, no error page. The Console stays
  clean.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-05 "Use my location" only on explicit click (privacy) (negative)
**Covers:** FR-SEARCH-06, BC-PRIVACY-02
**Steps:**
1. Reload the app. Confirm again that **no** location prompt appeared on load.
2. Click the **"Use my location"** button next to the search.
3. When Chrome asks for location permission, first try **Block**.
4. Reload, click the button again, and this time choose **Allow**.
**Expected:**
- The location prompt appears **only after** you click the button — never on
  load.
- When you **Block**, a calm inline message explains location is unavailable/
  denied; no error page, Console stays clean.
- When you **Allow**, your approximate city loads (forecast/map/background
  appear).
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-06 Read the 7-day forecast, hourly chart, comfort, weekend
**Covers:** FR-FORECAST-01, FR-FORECAST-02, FR-FORECAST-03, FR-FORECAST-04,
FR-COMFORT-04, FR-COMFORT-05, FR-COMFORT-03
**Steps:**
1. With a city loaded (from MT-02), look at the forecast area.
2. Read the row of day cards, the chart below them, the small text under the
   chart, and the highlighted block at the top.
**Expected:**
- **Seven** day cards, each showing the weekday, a high/low in °C, a weather
  icon, a precipitation-probability %, and a wind value.
- Each day card carries a **comfort badge** that is **green** for a good day,
  **yellow** for middling, **red** for poor — and the badge is distinguishable
  without relying on color alone (it has a label/number).
- Below the cards, an **hourly temperature line chart** for roughly the next two
  days.
- Under the chart, today's **sunrise and sunset** times.
- At the **top** of the forecast, the upcoming **weekend** comfort is
  highlighted with a short one-sentence Ukrainian explanation (no emoji, calm
  tone, no exclamation mark).
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-07 Set the location by clicking the map
**Covers:** FR-MAP-01, FR-MAP-02, FR-MAP-03, FR-MAP-04, FR-MAP-05
**Steps:**
1. With a city loaded, find the interactive map. Confirm it shows a **marker**
   at the current city; click the marker to see a popup naming the city.
2. Read the bottom-right corner of the map.
3. Click somewhere else on the map (a different town/area).
**Expected:**
- The map is bounded to the current location and a marker + city-name popup are
  present.
- The attribution **"© OpenStreetMap contributors"** is shown at the bottom-
  right at all times.
- Clicking the map sets a new active location: the city name updates (reverse-
  geocoded), and the forecast/background refresh for the new point. If a clicked
  point cannot be named, a calm hint appears in the popup rather than an error.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-08 Forecast refreshes when the location changes (cache behavior)
**Covers:** FR-FORECAST-05
**Steps:**
1. Load city A (e.g. `Київ`). Note its day cards.
2. Search and load city B (e.g. `Одеса`). Note its day cards differ.
3. Search and load city A again.
**Expected:** each switch shows that city's own forecast; the previous city's
numbers never "stick" under the new city. Switching back to A shows A's data
again promptly.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-09 Pin up to 3 cities and compare the weekend
**Covers:** FR-COMPARE-01, FR-COMPARE-02, FR-COMPARE-03
**Steps:**
1. Load city A. In the compare area, click **"Pin this city"** (Закріпити).
2. Load city B, pin it. Load city C, pin it.
3. Try to pin a **fourth** city.
4. Turn on the **"Compare weekend"** (Порівняти вихідні) toggle.
5. In the comparison table, click **"make active"** (Зробити активним) on a
   column other than the current one.
6. Click the small unpin control on one chip.
**Expected:**
- A chip appears per pinned city (up to three). The **fourth** pin does nothing
  except surface an at-capacity hint — no error.
- The toggle reveals a **3-column** table for **Saturday and Sunday** with
  high/low, precipitation %, and a comfort badge per day. Each column has a
  sticky header with the city name and a "make active" button.
- "make active" switches the main view to that city while **keeping** all pins
  and leaving the table open; a non-color marker (e.g. an "active" label) moves
  to the chosen column.
- Unpinning removes that chip and its column; the others stay intact. Console
  stays clean throughout.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-10 Responsive layout — mobile, tablet, desktop
**Covers:** FR-SHELL-02
**Steps:** with a city loaded, view the page at three widths and note the column
count:
1. Phone width (~360 px).
2. Tablet width (~768 px).
3. Desktop width (~1280 px+).
**Expected:** mobile is a **single column**; tablet is **two columns**; desktop
is **three columns**. Content reflows cleanly with no overlap or cut-off, and
the map/chart are not stretched.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-11 Live header clock
**Covers:** FR-CLOCK-01
**Steps:**
1. Look at the clock in the header. Watch it for ~5 seconds.
**Expected:** the clock shows the local time and **updates live** (seconds tick)
while the page is open, without the header jumping or shifting as it updates.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-12 Shareable-URL round-trip
**Covers:** FR-SHELL-01, FR-SEARCH-03
**Steps:**
1. Load any city so the address bar shows `?lat=&lon=&name=`.
2. Copy the full URL. Open a brand-new tab (or share it to another device) and
   paste it.
**Expected:** the same location loads directly, with the forecast/map for that
place, no search needed.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-13 Footer jokes (deterministic, calm)
**Covers:** FR-JOKES-01
**Steps:**
1. Scroll to the footer. Read the weather joke.
2. Reload the page a few times **on the same day**.
**Expected:** a Ukrainian weather-themed joke is shown in the footer; it is the
**same** joke across reloads on the same day (deterministic), calm in tone, with
no exclamation mark. The footer also credits Open-Meteo and OpenStreetMap.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-14 Animated background reflects the place
**Covers:** FR-ANIM-01, FR-ANIM-02, FR-ANIM-04
**Steps:**
1. Load a city whose local time is daytime; note the background gradient.
2. Load a city that is currently at night (far time zone); note the gradient.
3. Try to click "through" the background onto the search box / buttons.
**Expected:**
- The background reflects the condition (gradient, plus rain/snow/clouds when
  applicable). Day-vs-night follows the **chosen city's** sunrise/sunset, not
  your own clock — a night-side city shows a night gradient even if it is
  daytime where you are.
- The background never blocks clicks: every control behind/around it is fully
  usable.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-15 Reduced motion = static background (accessibility) (negative)
**Covers:** FR-ANIM-03
**Steps:**
1. Turn on the OS "reduce motion" setting (macOS: System Settings → Accessibility
   → Display → Reduce motion; Windows: Settings → Accessibility → Visual effects
   → Animation effects off).
2. Reload the app and load a rainy/snowy city.
**Expected:** the background renders as a **static gradient only** — no moving
rain/snow/cloud particles — while still reflecting day/night.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-16 Theme toggle (light / dark)
**Covers:** FR-SHELL-01, NFR-A11Y-02
**Steps:**
1. Use the theme control in the header to switch between light and dark.
2. In each theme, read body text, the comfort badges, and the buttons.
**Expected:** the theme switches cleanly with no flash of the wrong colors; text
and interactive elements remain clearly legible in **both** themes (contrast
holds). No cookie is set by the app to do this.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-17 Upstream failure stays calm (negative)
**Covers:** NFR-OBS-01, FR-FORECAST-01, FR-SEARCH-05
**Steps:**
1. Open Chrome DevTools (F12) → **Network** tab → set throttling to **Offline**
   (or block requests to `open-meteo.com`).
2. With the app open, try to search a city and/or load a forecast.
3. Restore the network and retry.
**Expected:**
- No generic "500"/crash page and no blank white screen. The app shows a calm,
  visible message that something could not be loaded, in Ukrainian.
- When the network returns, retrying loads the data normally.
**Result:** ☐ Pass ☐ Fail — notes: ______

## MT-18 Keyboard-only search (accessibility)
**Covers:** NFR-A11Y-01, FR-SEARCH-01, FR-SEARCH-03
**Steps:**
1. Without using the mouse, press **Tab** until the search box is focused (note
   the visible focus outline).
2. Type a city, use the **Down/Up arrow** keys to move through suggestions, and
   press **Enter** to select.
3. Press **Escape** to close an open suggestion list.
**Expected:** every step is reachable and operable by keyboard; the focused
element always has a visible outline; arrow keys move the highlighted suggestion;
Enter selects; Escape closes the list and keeps focus in the input.
**Result:** ☐ Pass ☐ Fail — notes: ______

---

## Notes for the tester

- These cases are the human-runnable mirror of the automated suite (585 unit/
  component tests + 21 integration tests, all green — see
  `automated-verification-latest.md`). They exist to confirm the same behavior
  in a real browser, which the automated suite does not exercise visually.
- If any case fails, record the city used, the time, the browser/window width,
  and a screenshot, and file it against the requirement id shown under
  **Covers**.
