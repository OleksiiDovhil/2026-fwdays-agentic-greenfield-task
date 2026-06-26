// The internal data contract that crosses the Server↔Client boundary — design.md
// D2. Framework-free (TC-PURE-01): plain types only, no `next/*`, no `react`, no
// DOM. The route handler (`app/api/geocode`) and the client `SearchBox` both
// import these so the minimal geocoding contract has a SINGLE source of truth and
// the raw Open-Meteo response shape never leaks past the server (TC-DATA-01).

/**
 * The minimal projection of an Open-Meteo geocoding result — the only place
 * shape the client knows. The verbose upstream fields (elevation, timezone,
 * population, feature_code, …) are dropped by the mapper; `latitude`→`lat`,
 * `longitude`→`lon`, `country_code`→`countryCode`.
 */
export type GeoSuggestion = {
  /** Stable list key: the Open-Meteo place id when present, else a synthetic key. */
  id: string;
  /** Display name of the place (as returned by Open-Meteo, `language=uk`). */
  name: string;
  /** First-level admin region (e.g. oblast), when available. */
  admin1?: string;
  /** Country name, when available. */
  country?: string;
  /** ISO-3166 alpha-2 country code, when available (drives the optional flag). */
  countryCode?: string;
  /** Latitude in [-90, 90]. */
  lat: number;
  /** Longitude in [-180, 180]. */
  lon: number;
};

/**
 * The route handler's response contract (D1). On success or zero results it
 * carries `suggestions` (an empty array IS valid — zero results, not an error).
 * A non-OK upstream / network throw / zod-failed body resolves to the typed
 * error shape instead, which the client maps to the calm error Notice — never a
 * raw 500, never partial data.
 */
export type GeocodeResult =
  | { suggestions: GeoSuggestion[] }
  | { error: "failed" };
