/** Per-provider number selections. A country or service id from one server is never reused on another. */

export type NumberSlot = { country: string; service: string };

export function sameLabel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function matchLabel(options: string[], wanted: string) {
  const needle = wanted.trim();
  if (!needle) return "";
  return options.find((item) => sameLabel(item, needle)) || "";
}

/** Keep a saved pick only when this provider still lists it. Otherwise the pick is cleared. */
export function restoreSlot(saved: NumberSlot | undefined, countries: string[], services: string[], fixedCountry = ""): NumberSlot {
  if (fixedCountry) return { country: fixedCountry, service: matchLabel(services, saved?.service || "") };
  const country = matchLabel(countries, saved?.country || "");
  if (!country) return { country: "", service: "" };
  return { country, service: matchLabel(services, saved?.service || "") };
}
