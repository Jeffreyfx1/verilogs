/** One product category belongs to one shelf. Matching is the category column only. */
export const SHELF_CATEGORIES = {
  vpn: ["vpn"],
  smm: ["smm"],
  random: ["logs"],
} as const;

export type Shelf = keyof typeof SHELF_CATEGORIES;

export function shelfOf(kind: string | undefined): Shelf {
  if (kind === "vpn" || kind === "smm") return kind;
  return "random";
}

export function onShelf(category: string, shelf: Shelf) {
  return (SHELF_CATEGORIES[shelf] as readonly string[]).includes(category);
}
