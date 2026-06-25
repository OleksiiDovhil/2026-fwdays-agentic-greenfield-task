// Centralized string layer — design.md D1, NFR-I18N-01, BC-BRAND-01.
//
// A hand-rolled, framework-free dictionary + `t()` accessor (no runtime i18n
// library, TC-PURE-01). `t(key)` returns the Ukrainian value by default and
// falls back to the English value when a key is absent from Ukrainian. A key
// absent from BOTH locales degrades QUIETLY: it returns an empty string with no
// missing-key placeholder and no console error/warning (NFR-OBS-01).
import uk from "./uk";
import en from "./en";

/** The dictionary type is derived from the Ukrainian (default) dictionary. */
export type Dictionary = typeof uk;

/**
 * Dotted leaf paths of a nested string dictionary, e.g. `"shell.hero.title"`.
 * Object branches recurse; string leaves terminate. Keys are typed off `uk`, so
 * a key present only in `en` is intentionally not reachable by type (D1).
 */
type Leaves<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

export type MessageKey = Leaves<Dictionary>;

/** Walk a dotted path through a nested record; return the string leaf or null. */
function lookup(dict: unknown, key: string): string | null {
  const segments = key.split(".");
  let node: unknown = dict;
  for (const segment of segments) {
    if (node && typeof node === "object" && segment in node) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return null;
    }
  }
  return typeof node === "string" ? node : null;
}

/**
 * Resolve a message key to its display string.
 *
 * Order: Ukrainian value → English fallback → empty string. The empty-string
 * degrade is deliberate: it is calm (never a `__MISSING__`-style placeholder),
 * contains no exclamation mark, and emits nothing to the console, so an
 * unforeseen missing key never shouts at the user or noises up a healthy session
 * (the spec's "no missing-key placeholder or console error" guarantee).
 */
export function t(key: MessageKey): string {
  const fromUk = lookup(uk, key);
  if (fromUk !== null) return fromUk;

  const fromEn = lookup(en, key);
  if (fromEn !== null) return fromEn;

  return "";
}

export { uk, en };
