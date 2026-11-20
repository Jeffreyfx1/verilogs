/** Marketplace category list stays available even when the selected category is empty. */

export const EMPTY_CATEGORY = "No services are currently available in this category. Please explore other categories.";

export function mergeCategories(known: string[], incoming: string[], current = "") {
  const next: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const clean = name.trim();
    if (!clean || clean.toLowerCase() === "all" || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    next.push(clean);
  };
  for (const name of known) add(name);
  for (const name of incoming) add(name);
  add(current);
  return next;
}

export function rowsOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((row): row is T => row != null && typeof row === "object") : [];
}
