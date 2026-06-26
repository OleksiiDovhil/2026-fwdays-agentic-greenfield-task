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
      label: "Local time",
      placeholder: "The local time of the chosen city will appear here",
    },
    main: {
      label: "Main content",
    },
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
} as const;

export default en;
