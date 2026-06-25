// The active-location shape — design.md D2. This is THE cross-cutting contract
// that city-search / map / forecast / animated-background / weekend-compare all
// consume (plan §4.1, ADR-worthy). Intentionally minimal: no timezone/elevation
// — forecast/map derive those from Open-Meteo at fetch time.
export type Location = {
  lat: number;
  lon: number;
  name: string;
};
