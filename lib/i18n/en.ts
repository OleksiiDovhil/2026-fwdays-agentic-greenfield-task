// English fallback dictionary — design.md D1, NFR-I18N-01.
//
// `en` mirrors the key shape of `uk` as a STRICT FALLBACK SUBSET: `t(key)` returns
// the Ukrainian value, and only falls back here when a key is absent from `uk`.
// `en` is never a superset of `uk` (keys are typed off `uk`). Same calm tone, no
// exclamation marks (BC-BRAND-01).
export const en = {
  app: {
    name: "Weekend Weather",
    tagline: "Let the weather pick your weekend trip",
    metaTitle: "Weekend Weather — plan your trip by the forecast",
    metaDescription:
      "A calm helper for picking a city for the weekend: search a city and see its forecast to plan your trip by the weather.",
  },
  shell: {
    hero: {
      title: "Plan your weekend by the weather",
      subtitle:
        "Search for a city and we will show its forecast, so you can calmly decide where to go this weekend.",
    },
    search: {
      // SUPERSEDED by the top-level `search.*` namespace (D8, add-city-search):
      // the real SearchBox reads `search.*` and does NOT consume `shell.search.*`.
      // Left in place (removing them is a `shell.*` edit, §3a).
      label: "City search",
      placeholder: "Enter a city name",
      hint: "Start with a city name to see its weather",
    },
    theme: {
      light: "Light theme",
      dark: "Dark theme",
      switchToLight: "switch to light theme",
      switchToDark: "switch to dark theme",
    },
    footer: {
      dataCredit: "Weather data",
      mapCredit: "Maps",
      and: "and",
      privacy: "No sign-up and no tracking — your searches are never stored.",
    },
    notice: {
      error: {
        title: "Could not load the data",
        description:
          "The data is unavailable right now. Please try again in a moment — the rest of the app keeps working.",
        retry: "Try again",
      },
      empty: {
        title: "Nothing here yet",
        description:
          "Search for a city to see its weather and plan your weekend trip.",
      },
      info: {
        title: "Good to know",
        description: "A helpful hint will appear here when it is needed.",
      },
    },
    background: {
      label: "Weather backdrop",
    },
    jokes: {
      label: "Weather joke",
      placeholder: "A light weather joke will appear here",
    },
    clock: {
      // SUPERSEDED by the top-level `clock.*` namespace (D6, add-top-clock):
      // these described a rejected weather-location time; the shipped TopClock
      // shows the DEVICE time and reads `clock.label`. Left in place (removing
      // them is a shell.* edit, §3a); do NOT consume them anymore.
      label: "Local time",
      placeholder: "The local time of the chosen city will appear here",
    },
    main: {
      label: "Main content",
    },
  },
  search: {
    // City-search namespace (D8, add-city-search) — the English fallback subset
    // mirroring `uk.search.*` key-for-key. SUPERSEDES the inert `shell.search.*`
    // slot copy; the real SearchBox owns its copy here. Same calm, blame-free
    // tone; no exclamation marks (BC-BRAND-01).
    label: "City search",
    placeholder: "Enter a city name",
    listLabel: "City suggestions",
    loading: "Searching cities",
    // FR-SEARCH-05 zero-results literal — English fallback for "Нічого не знайдено".
    empty: "Nothing found",
    failed:
      "Could not load suggestions. Please try again in a moment, or type a city name.",
    geolocate: "Use my location",
    geolocationDenied:
      "We could not find your location. You can simply type a city name — search still works.",
    geolocationUnavailable:
      "Locating you is unavailable right now. Type a city name and we will show its weather.",
    myLocation: "My location",
  },
  comfort: {
    band: {
      green: "Comfortable",
      yellow: "Moderate",
      red: "Uncomfortable",
    },
    a11y: {
      green: "Comfortable conditions",
      yellow: "Moderate conditions",
      red: "Uncomfortable conditions",
    },
    weekend: {
      label: "This weekend",
      outOfRange: "Weekend outside the forecast",
    },
  },
  clock: {
    // Top-clock namespace (D6, add-top-clock) — the live header clock's
    // accessible name (NFR-A11Y-01). Calm, stable descriptor; no exclamation
    // marks (BC-BRAND-01).
    label: "Current local time",
  },
  jokes: {
    // Bottom-jokes namespace (D3, add-bottom-jokes) — the per-index English
    // fallback for `uk.jokes.items`. SAME count and index alignment as the
    // Ukrainian corpus; the footer falls back to `en.jokes.items[i]` only when
    // the Ukrainian entry at index `i` is missing/empty. Same calm, gently
    // humorous, weather/season-themed tone; no exclamation marks (BC-BRAND-01).
    // Read DIRECTLY off the `en` dictionary object, NOT via `t()` (D3).
    items: [
      "The forecast promised a sunny day, but the clouds decided to show up with a plan of their own.",
      "Fine weather always arrives just after the umbrella has been packed away for the trip.",
      "Spring rain never asks permission — it simply drops by unannounced.",
      "In autumn the leaves fall so unhurriedly, as if they too are in no rush to get to work.",
      "Winter arrived quietly, on tiptoe, so as not to wake anyone who has not found a warm coat yet.",
      "The summer heat is so friendly that even the shade goes looking for somewhere cool to hide.",
      "The morning fog slowly erases the city, as if someone forgot to finish drawing the horizon.",
      "The wind is playful today: first it walks you home, then it hands your hat back.",
      "The first snow settles carefully, as if testing whether the city is ready for winter.",
      "A rainbow turns up exactly when you have stopped expecting one, and apologizes a little for being late.",
    ],
  },
} as const;

export default en;
