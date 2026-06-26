// Ukrainian-first dictionary (default locale) — design.md D1, NFR-I18N-01.
//
// Tone: calm, practical, reassuring; written to ship to Ukrainian users
// unchanged. No exclamation marks anywhere (BC-BRAND-01) — a unit test enforces
// this across every value, in both locales.
//
// NAMESPACING CONVENTION (§3a): strings are grouped per domain so later slices
// extend the dictionary WITHOUT key collisions. The shell owns `shell.*` here;
// future slices add sibling namespaces — `search.*`, `forecast.*`, `clock.*`,
// `jokes.*`, `map.*`, `compare.*`, `comfort.*` — never reaching into `shell.*`.
//
// This module is the SHAPE source of truth: the `Dictionary` type in
// `lib/i18n/index.ts` is derived from this object, and `lib/i18n/en.ts` mirrors
// its key shape (as a strict fallback subset).
export const uk = {
  app: {
    // Product name (logo wordmark) and the document-title / meta strings.
    name: "Погода на вихідні",
    tagline: "Куди поїхати на вихідні — підкаже погода",
    metaTitle: "Погода на вихідні — плануйте поїздку за прогнозом",
    metaDescription:
      "Спокійний помічник для вибору міста на вихідні: знайдіть місто й подивіться його прогноз, щоб спланувати поїздку за погодою.",
  },
  shell: {
    hero: {
      title: "Сплануйте вихідні за погодою",
      subtitle:
        "Знайдіть місто, і ми покажемо його прогноз — щоб ви спокійно обрали, куди поїхати на ці вихідні.",
    },
    search: {
      // SUPERSEDED by the top-level `search.*` namespace (D8, add-city-search).
      // These described the inert stub slot; the real interactive SearchBox reads
      // `search.*` and does NOT consume `shell.search.*`. Left in place because
      // removing them is a `shell.*` edit (§3a).
      label: "Пошук міста",
      placeholder: "Введіть назву міста",
      hint: "Почніть із назви міста, щоб побачити його погоду",
    },
    theme: {
      // The header theme control announces the CURRENT theme AND the action it
      // performs; the action must match the click (when light, the click switches
      // TO dark, and vice-versa). The value updates when the theme flips
      // (NFR-A11Y-01, D3). Composed in AppHeader as "<current>, <switch action>".
      light: "Світла тема",
      dark: "Темна тема",
      switchToLight: "перемкнути на світлу тему",
      switchToDark: "перемкнути на темну тему",
    },
    footer: {
      // Attribution is mandatory (BC-BRAND-02): Open-Meteo for data, OpenStreetMap
      // for map tiles, each as a hyperlink.
      dataCredit: "Дані про погоду",
      mapCredit: "Карти",
      and: "та",
      privacy: "Без реєстрації та без стеження — ваші запити нікуди не зберігаються.",
    },
    notice: {
      // The shared inline error / empty / info primitive copy (D4). Calm,
      // blame-free, actionable. These exact keys are graded by the eval suite.
      error: {
        title: "Не вдалося завантажити дані",
        description:
          "Зараз дані недоступні. Спробуйте ще раз трохи згодом — решта застосунку працює, як і раніше.",
        retry: "Спробувати ще раз",
      },
      empty: {
        title: "Поки що порожньо",
        description:
          "Знайдіть місто, щоб побачити його погоду й спланувати поїздку на вихідні.",
      },
      info: {
        title: "До відома",
        description: "Тут зʼявиться корисна підказка, коли вона знадобиться.",
      },
    },
    background: {
      // Accessible label for the decorative animated-background slot (inert here;
      // later honors pointer-events / reduced-motion).
      label: "Тло з погодою",
    },
    jokes: {
      // `label` is the footer jokes slot's accessible name — STILL used by
      // components/jokes/FooterJoke.tsx (D5). `placeholder` is SUPERSEDED by the
      // real selected joke from the top-level `jokes.items` corpus (add-bottom-
      // jokes); it is left in place because removing it is a shell.* edit (§3a),
      // but FooterJoke does NOT consume it.
      label: "Жарт про погоду",
      placeholder: "Тут зʼявиться легкий жарт про погоду",
    },
    clock: {
      // SUPERSEDED by the top-level `clock.*` namespace (D6, add-top-clock).
      // These inert keys described a REJECTED idea — the WEATHER-LOCATION's time
      // ("обраного міста"). The shipped TopClock shows the visitor's DEVICE time
      // and reads `clock.label`, NOT `shell.clock.*`. Left in place because
      // removing them is a `shell.*` edit (§3a); do NOT consume them anymore.
      label: "Місцевий час",
      placeholder: "Місцевий час обраного міста зʼявиться тут",
    },
    main: {
      // Accessible label for the main content region that hosts forecast / map /
      // compare slots in later waves.
      label: "Основний вміст",
    },
  },
  search: {
    // City-search namespace (D8, add-city-search) — sibling to shell.*, never
    // reaching into it. SUPERSEDES the inert `shell.search.*` slot copy
    // (`label`/`placeholder`/`hint`), which described the disabled stub slot; the
    // real interactive SearchBox owns its copy here. `shell.search.*` is left in
    // place (removing it is a `shell.*` edit, §3a) but is NOT consumed by SearchBox.
    //
    // Tone: calm, practical, blame-free; natural Ukrainian. No exclamation marks
    // (BC-BRAND-01) — enforced across both locales by lib/i18n/i18n.test.ts. The
    // `empty` and `geolocation*` copy is graded by the search-copy eval (≥ 90).
    //
    // Accessible name + visible label for the combobox input (NFR-A11Y-01).
    label: "Пошук міста",
    placeholder: "Введіть назву міста",
    // Accessible name for the suggestion listbox (NFR-A11Y-01).
    listLabel: "Підказки міст",
    // A quiet busy label announced while suggestions load.
    loading: "Шукаємо міста",
    // FR-SEARCH-05 zero-results literal — the shipped Ukrainian copy. Calm, reads
    // as "nothing matched, try another spelling", never an error or a dead end.
    empty: "Нічого не знайдено",
    // The search-failed Notice copy (network / non-OK / malformed payload). Calm,
    // reassuring, recoverable — the visitor can simply try again.
    failed:
      "Не вдалося завантажити підказки. Спробуйте ще раз трохи згодом або введіть назву міста.",
    // The "Use my location" button label (FR-SEARCH-06).
    geolocate: "Визначити моє місце",
    // Geolocation permission denied — blame-free; search still works (FR-SEARCH-06).
    geolocationDenied:
      "Не вдалося визначити ваше місце. Можна просто ввести назву міста — пошук працює, як і раніше.",
    // Geolocation unavailable (API absent / position error) — calm, constructive.
    geolocationUnavailable:
      "Визначення місця зараз недоступне. Введіть назву міста — і ми покажемо його погоду.",
    // Calm fallback label for a location chosen via geolocation (no reverse-geocode).
    myLocation: "Моє місце",
  },
  comfort: {
    // Comfort-score namespace (D6) — sibling to shell.*, never reaching into it.
    // Calm, practical tone; no exclamation marks (BC-BRAND-01, test-enforced).
    band: {
      // Short badge labels shown beside the numeric score; color is not the only
      // signal (NFR-A11Y-01), so each band carries a distinct textual label.
      green: "Комфортно",
      yellow: "Помірно",
      red: "Некомфортно",
    },
    a11y: {
      // Fuller accessible descriptions for assistive technology.
      green: "Комфортні умови",
      yellow: "Помірні умови",
      red: "Некомфортні умови",
    },
    weekend: {
      // Upcoming-weekend summary label and the calm out-of-range state shown when
      // the weekend is outside the forecast window (never an error toast).
      label: "Найближчі вихідні",
      outOfRange: "Вихідні поза прогнозом",
    },
  },
  clock: {
    // Top-clock namespace (D6, add-top-clock) — sibling to shell.*, never
    // reaching into it. SUPERSEDES the inert `shell.clock.*` copy, which
    // described a rejected weather-location time; this clock shows the visitor's
    // DEVICE-local time. `label` is the live header clock's accessible name
    // (NFR-A11Y-01) — a calm, stable descriptor, NOT the live digits, so the
    // announced name does not churn every second. No exclamation marks
    // (BC-BRAND-01, test-enforced across both locales).
    label: "Поточний місцевий час",
  },
  forecast: {
    // Forecast namespace (D6, add-forecast) — sibling to shell.*, never reaching
    // into it. Carries EVERY user-visible forecast string: the section's
    // accessible name, the weekday labels, the weather-code condition labels, the
    // sunrise/sunset labels, the unit labels + minus glyph + precip placeholder,
    // the chart accessible name, and the loading / error / no-location copy. Calm,
    // practical tone; no exclamation marks (BC-BRAND-01, enforced across both
    // locales by lib/i18n/i18n.test.ts). The loading / error / noLocation copy is
    // EVAL-GRADED (forecast-copy.eval.ts, target ≥ 90).
    //
    // Accessible region name for the forecast section (NFR-A11Y-01).
    sectionLabel: "Прогноз погоди",
    weekday: {
      // Seven short Ukrainian weekday labels indexed by day-of-week
      // (0=Sun … 6=Sat), the SAME index a fixed-Date.UTC parse of the location-
      // local `time` date yields (D6, never the viewer's clock). The card reads
      // forecast.weekday[index]; the dot-path keys are the numeric strings.
      "0": "Нд",
      "1": "Пн",
      "2": "Вт",
      "3": "Ср",
      "4": "Чт",
      "5": "Пт",
      "6": "Сб",
    },
    condition: {
      // Short Ukrainian weather-code condition labels, keyed to match the
      // `describeWeather` label keys (the lib returns the KEY, the card calls
      // t()). Distinct keys per WMO group so clear ≠ rain ≠ snow ≠ thunder; the
      // generic `unknown` fallback covers an unrecognised code (never blank).
      clear: "Ясно",
      mainlyClear: "Переважно ясно",
      partlyCloudy: "Мінлива хмарність",
      overcast: "Хмарно",
      fog: "Туман",
      drizzle: "Мряка",
      rain: "Дощ",
      rainShowers: "Дощ із проясненнями",
      snow: "Сніг",
      snowShowers: "Сніг із проясненнями",
      thunder: "Гроза",
      unknown: "Погода без особливостей",
    },
    // Sunrise / sunset labels for the small text under the chart (FR-FORECAST-04).
    sunrise: "Схід сонця",
    sunset: "Захід сонця",
    unit: {
      // Unit labels — never hardcoded in the card (NFR-I18N-01). The wind label
      // matches the requested windspeed_unit=ms so the value is reproducible.
      celsius: "°C",
      wind: "м/с",
      percent: "%",
    },
    // The app's standard minus glyph for sub-zero temperatures (D4). ASCII minus,
    // kept centralised so the card never hardcodes a sign.
    minus: "-",
    // Neutral placeholder for an absent value (precip / sunrise / sunset), DISTINCT
    // from a present 0 (D4).
    precipPlaceholder: "—",
    // The hourly chart's accessible name so the trend is not an unlabeled image
    // (NFR-A11Y-01).
    chartLabel: "Погодинна температура на найближчі 48 годин",
    // A quiet, reassuring busy label while a fetch for a newly selected location is
    // in flight (EVAL-GRADED). Calm, momentary, never alarmist.
    loading: "Завантажуємо прогноз",
    // The failed-fetch Notice copy (network / non-OK / malformed / zero-day)
    // (EVAL-GRADED). Calm, blame-free, recoverable: the forecast could not load
    // right now, the visitor can try again, and the rest of the app keeps working.
    error:
      "Не вдалося завантажити прогноз. Спробуйте ще раз трохи згодом — решта застосунку працює, як і раніше.",
    // The no-location empty-state copy (EVAL-GRADED). A calm, inviting state that
    // guides the visitor to search a city — never an error or a dead end.
    noLocation: "Знайдіть місто, щоб побачити його прогноз на найближчі дні.",
  },
  map: {
    // Map namespace (D8, add-map) — sibling to shell.*, never reaching into it.
    // Carries EVERY user-visible map string: the region's accessible name, the
    // marker / popup aria label, the loading / skeleton label, the coordinate-
    // fallback display label, and the calm reverse-geocode-failed copy. Calm,
    // practical tone; no exclamation marks (BC-BRAND-01, enforced across both
    // locales by lib/i18n/i18n.test.ts). The `fallbackName` / `reverseFailed`
    // copy is EVAL-GRADED (map-copy.eval.ts, target ≥ 90).
    //
    // Accessible region name for the map (NFR-A11Y-01).
    regionLabel: "Карта обраного місця",
    // Accessible name for the marker / its popup (NFR-A11Y-01).
    markerLabel: "Обране місце на карті",
    // The skeleton / loading accessible label shown while the client-only map
    // chunk loads (same-footprint placeholder, FR-MAP-05). Calm, momentary.
    loading: "Завантажуємо карту",
    // The coordinate-fallback display label shown in the marker popup when no
    // reverse name resolves (the spec's "no named place" / "malformed payload"
    // scenarios). Reads as a calm "a chosen place", never an error or a dead end.
    fallbackName: "Обране місце",
    // The calm reverse-geocode-failed copy (if the component surfaces one). The
    // location IS set and the map keeps working — only the place name could not
    // be determined; blame-free, never alarmist.
    reverseFailed:
      "Не вдалося визначити назву цього місця. Його вже обрано на карті, і прогноз працює, як і раніше.",
    // The required OSM attribution wording (FR-MAP-04). Kept here so the literal
    // is centralised; the map renders it verbatim bottom-right.
    attribution: "© OpenStreetMap contributors",
  },
  jokes: {
    // Bottom-jokes namespace (D3, add-bottom-jokes) — sibling to shell.*, never
    // reaching into it. SUPERSEDES the inert `shell.jokes.placeholder` copy
    // ("Тут зʼявиться легкий жарт про погоду"): the footer now shows a real
    // selected joke from `items`. `shell.jokes.label` is STILL used as the slot's
    // accessible name; `shell.jokes.placeholder` is left in place but NOT
    // consumed (removing it is a shell.* edit, §3a).
    //
    // `items` is the CORPUS — an ARRAY of strings, read DIRECTLY off the `uk`
    // dictionary object (`uk.jokes.items`), NOT via `t()`. `t(key)` resolves a
    // single string leaf and cannot return an array, so the footer hands this
    // array to `pickJoke` itself (D3). `en.jokes.items` mirrors it index-for-index
    // as the per-index English fallback.
    //
    // Tone: calm, gently humorous (a light smile, not slapstick), genuinely
    // weather/season-themed, natural Ukrainian, family-friendly. No exclamation
    // marks (BC-BRAND-01) — enforced by lib/i18n/i18n.test.ts (arrays flattened)
    // and the slice's own corpus test, and graded by the jokes-quality eval.
    items: [
      "Синоптики обіцяли сонячний день, але хмари вирішили прийти зі своїм планом.",
      "Гарна погода завжди настає саме тоді, коли парасолька вже зібрана в дорогу.",
      "Весняний дощ ніколи не питає дозволу — просто заходить у гості без попередження.",
      "Восени листя падає так неквапливо, ніби й воно не поспішає на роботу.",
      "Зима прийшла тихо, на пальчиках, щоб не розбудити тих, хто ще не дістав теплу куртку.",
      "Літня спека така приязна, що навіть тінь шукає, де б їй сховатися в холодок.",
      "Туман зранку повільно стирає місто, наче хтось забув домалювати горизонт.",
      "Вітер сьогодні грайливий: спершу проводжає додому, потім вертає капелюх назад.",
      "Перший сніг лягає обережно, ніби пробує, чи готове місто до зими.",
      "Веселка зʼявляється рівно тоді, коли вже й не сподіваєшся, і трохи вибачається за спізнення.",
    ],
  },
} as const;

export default uk;
