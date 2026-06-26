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
      // Accessible label + placeholder for the centered search slot (the slot
      // itself is an inert stub in this slice; the real input arrives with
      // city-search).
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
