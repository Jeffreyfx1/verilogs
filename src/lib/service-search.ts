/** How many service names one dropdown page shows. Not a catalogue cap. */
export const SERVICE_PAGE = 60;

export type ServiceHit = {
  service: string;
  name?: string;
  externalId?: string;
  country?: string;
};

export function serviceTerms(q: string) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .split(/[^0-9a-z]+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((term) => term.slice(0, 40));
}

export function escapeLike(term: string) {
  return String(term || "").replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 0 exact, 1 prefix, 2 any other hit. Empty queries are not ranked. */
export function serviceMatchRank(service: string, q: string) {
  const name = String(service || "").trim().toLowerCase();
  const query = String(q || "").trim().toLowerCase();
  if (!query) return 0;
  const slug = name.replace(/[^0-9a-z]/g, "");
  const qslug = query.replace(/[^0-9a-z]/g, "");
  if (name === query || (qslug && slug === qslug)) return 0;
  if (name.startsWith(query) || (qslug && slug.startsWith(qslug))) return 1;
  return 2;
}

export function encodeServiceCursor(cursor: { rank: number; service: string }) {
  return `${cursor.rank}\u001f${cursor.service}`;
}

export function decodeServiceCursor(raw: string) {
  const text = String(raw || "");
  const cut = text.indexOf("\u001f");
  if (cut <= 0) return null;
  const rank = Number(text.slice(0, cut));
  const service = text.slice(cut + 1);
  if (!service || !Number.isInteger(rank) || rank < 0 || rank > 9) return null;
  return { rank, service };
}

function blobOf(row: ServiceHit) {
  return [row.service, row.name, row.externalId, row.country].filter(Boolean).join(" ").toLowerCase();
}

function matchesTerms(row: ServiceHit, terms: string[]) {
  if (!terms.length) return true;
  const blob = blobOf(row);
  const slug = blob.replace(/[^0-9a-z]/g, "");
  return terms.every((term) => blob.includes(term) || slug.includes(term));
}

/** Page a service list the same way the customer dropdown does. Search scans every row. */
export function pageServices<T extends ServiceHit>(rows: T[], q: string, after = "", pageSize = SERVICE_PAGE) {
  const terms = serviceTerms(q);
  const filtered = rows.filter((row) => matchesTerms(row, terms));
  const rankOf = (service: string) => (terms.length ? serviceMatchRank(service, q) : 0);
  const sorted = [...filtered].sort((a, b) => {
    const diff = rankOf(a.service) - rankOf(b.service);
    if (diff) return diff;
    return a.service.localeCompare(b.service);
  });
  const cursor = decodeServiceCursor(after);
  let start = 0;
  if (cursor) {
    const at = sorted.findIndex((row) => {
      const rank = rankOf(row.service);
      return rank > cursor.rank || (rank === cursor.rank && row.service > cursor.service);
    });
    start = at < 0 ? sorted.length : at;
  }
  const size = Math.max(1, pageSize);
  const page = sorted.slice(start, start + size);
  const more = start + size < sorted.length;
  const last = page[page.length - 1];
  return {
    rows: page,
    more,
    next: more && last ? encodeServiceCursor({ rank: rankOf(last.service), service: last.service }) : "",
  };
}

/** Keep a service even when its quoted price is 0. Cheapest positive price wins. */
export function mergeServicePrices(rows: { service: string; price: number }[]) {
  const priceOf = new Map<string, number>();
  const order: string[] = [];
  for (const row of rows) {
    const shown = row.price > 0 ? row.price : 0;
    const prev = priceOf.get(row.service);
    if (prev == null) {
      order.push(row.service);
      priceOf.set(row.service, shown);
      continue;
    }
    if (shown > 0 && (prev <= 0 || shown < prev)) priceOf.set(row.service, shown);
  }
  return order.map((service) => ({ service, price: priceOf.get(service) || 0 }));
}
