/** Labels for a delivered Logs or VPN account. Labels come from the listing format or from names the provider already returned. */

import { FACEBOOK_INFO_HEADING, FACEBOOK_INFO_NOTE, isFacebookAccount, parseFacebookAccounts } from "@/lib/facebook-account";

export type AccountField = { label: string; value: string };
export type AccountGuide = { heading: string; note: string; links: string[] };
export type ParsedAccount = { fields: AccountField[]; layout?: "facebook"; guide?: AccountGuide };

const SINK = /cookie|url|link|token|session|extra|raw|2fa|recovery/i;

export function formatLabels(text: string): string[] {
  const flat = String(text || "").replace(/`/g, " ");
  const marked = flat.match(/account\s*format\s*[:\-–]?\s*([^\n]+)/i) || flat.match(/(?:^|\n|\.)\s*format\s*[:\-–]\s*([^\n]+)/i);
  if (marked) {
    const labels = labelsFrom(marked[1]);
    if (labels.length >= 2) return labels;
  }
  for (const line of flat.split(/\n/)) {
    if (!/\s:\s/.test(line) || line.includes("@") || line.length > 240) continue;
    const labels = labelsFrom(line.trim());
    if (labels.length >= 2) return labels;
  }
  return [];
}

export function parseAccountDelivery(raw: string, hint = ""): ParsedAccount[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (isFacebookAccount(hint)) {
    const facebook = parseFacebookAccounts(text, hint);
    if (facebook.length) return facebook;
    return [{ fields: [], layout: "facebook", guide: { heading: FACEBOOK_INFO_HEADING, note: FACEBOOK_INFO_NOTE, links: [] } }];
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = fromJson(JSON.parse(text));
      if (parsed.length) return parsed;
    } catch {
      /* The stored text is not JSON. */
    }
  }
  const labels = formatLabels(hint);
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => fieldsForLine(line, labels));
}

export function hideSupplier(value: string, supplier = "") {
  let text = String(value || "");
  const names = [supplier, "AccsZone"].map((name) => name.trim()).filter((name) => name.length > 2);
  for (const name of names) text = text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
  return text.replace(/\s{2,}/g, " ").replace(/\s+([|·])/g, " $1").trim();
}

function labelsFrom(chunk: string) {
  const source = chunk.trim();
  const pieces = /\s:\s/.test(source) && !/^format\b/i.test(source)
    ? source.split(/\s:\s/)
    : source.replace(/^format\s*[:\-–]\s*/i, "").split(/\s:\s|:/);
  const labels: string[] = [];
  for (const piece of pieces) {
    const cut = piece.split(/[.\n]/)[0].replace(/^format\s*[:\-–]?\s*/i, "").trim();
    if (!labelName(cut)) break;
    labels.push(cut.replace(/\s+/g, " "));
  }
  return labels;
}

function labelName(label: string) {
  return label.length > 0 && label.length <= 40 && /[a-z]/i.test(label) && !label.includes("@") && !/^https?:/i.test(label) && label.split(/\s+/).length <= 6;
}

function fieldsForLine(line: string, labels: string[]): ParsedAccount {
  const named = labeledLine(line);
  if (named) return { fields: named };
  if (!labels.length || !line.includes(":")) return { fields: [{ label: "Additional Information", value: line }] };
  const parts = splitValues(line);
  if (parts.length === labels.length) return { fields: zip(labels, parts) };
  if (parts.length > labels.length && SINK.test(labels[labels.length - 1] || "")) {
    const head = parts.slice(0, labels.length - 1);
    const tail = parts.slice(labels.length - 1).join(":");
    return { fields: zip(labels, [...head, tail]) };
  }
  return { fields: [{ label: "Additional Information", value: line }] };
}

function zip(labels: string[], values: string[]) {
  return labels.map((label, index) => ({ label, value: values[index] || "" })).filter((field) => field.value);
}

function splitValues(line: string) {
  const raw = line.split(":");
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const current = raw[i] || "";
    const next = raw[i + 1] || "";
    if (/^\s*https?$/i.test(current) && next.trim().startsWith("//")) {
      out.push(`${current.trim()}:${next.trim()}`);
      i += 1;
    } else out.push(current.trim());
  }
  return out.filter((part, index) => part || index < out.length);
}

function labeledLine(line: string): AccountField[] | null {
  if (!/\s:\s|:/.test(line) || (line.match(/:/g) || []).length > 8) return null;
  const parts = line.split(/\s:\s/).map((part) => part.trim());
  if (parts.length < 2 || parts.length > 2) return null;
  const [label, value] = parts;
  if (!label || !value || !labelName(label) || label.includes("@")) return null;
  if (/^https?:\/\//i.test(label)) return null;
  return [{ label, value }];
}

function fromJson(value: unknown): ParsedAccount[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return fieldsForLine(item, []);
      return fromJson(item);
    });
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.accounts)) return fromJson(record.accounts);
  const fields = Object.entries(record)
    .filter(([, item]) => item != null && (typeof item === "string" || typeof item === "number" || typeof item === "boolean"))
    .map(([key, item]) => ({ label: key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(), value: String(item).trim() }))
    .filter((field) => field.label && field.value);
  return fields.length ? [{ fields }] : [];
}
