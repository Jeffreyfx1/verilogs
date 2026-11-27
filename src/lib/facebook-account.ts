/**
 * Facebook Logs delivery. Other account types can add a profile beside this one.
 * Values are taken only from the provider string. A field that is not there is omitted.
 */

import type { AccountField, AccountGap, AccountGuide, ParsedAccount } from "@/lib/account-delivery";

export const FACEBOOK_HEADINGS = [
  "User ID (Login ID)",
  "Facebook Password",
  "2FA Key (Secret)",
  "Linked Email",
  "Linked Email Password",
] as const;

export const FACEBOOK_INFO_HEADING = "Important Account Information";
export const FACEBOOK_INFO_NOTE = "Keep these details private. Use them only for this account. After you sign in, change the password and use the account's own security and recovery settings if you are locked out.";
export const FACEBOOK_2FA_NOTE = "The 2FA key is the authenticator secret. Paste it into either link below to get the verification code.";
export const FACEBOOK_2FA_LINKS = ["https://2fa.vn", "https://2fa-auth.com"] as const;

type Slot = "login" | "password" | "totp" | "email" | "emailPassword";
type Expect = "uid" | "email" | "password" | "totp" | "url" | "cookie" | "login" | "skip";
type Role = { slot: Slot | "ignore"; expect: Expect };

const HEADING: Record<Slot, (typeof FACEBOOK_HEADINGS)[number]> = {
  login: "User ID (Login ID)",
  password: "Facebook Password",
  totp: "2FA Key (Secret)",
  email: "Linked Email",
  emailPassword: "Linked Email Password",
};

const ORDER: Slot[] = ["login", "password", "totp", "email", "emailPassword"];

export function isFacebookAccount(text: string) {
  const value = String(text || "");
  if (!/\b(facebook|fb)\b/i.test(value)) return false;
  if (/\b(followers|likes|views|comments|shares|reactions|subscribers)\b/i.test(value) && !/\b(account format|password|2fa|uid|login|email)\b/i.test(value)) return false;
  return true;
}

export function parseFacebookAccounts(raw: string, hint = ""): ParsedAccount[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = fromJson(JSON.parse(text), hint);
      if (parsed.length) return parsed;
    } catch {
      /* Not JSON. Try the credential text. */
    }
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(labeledPair)) {
    const account = accountFromSlots(slotsFromPairs(lines));
    return account ? [account] : [];
  }
  return lines.map((line) => accountFromLine(line, hint)).filter((account): account is ParsedAccount => !!account);
}

function accountFromLine(line: string, hint: string): ParsedAccount | null {
  if (labeledPair(line)) return accountFromSlots(slotsFromPairs([line]));
  const pipes = (line.match(/\|/g) || []).length;
  const semis = (line.match(/;/g) || []).length;
  const colons = (line.match(/:/g) || []).length;
  const separator: ":" | "|" | ";" = pipes >= 2 ? "|" : semis >= 2 && colons < 2 && !line.includes("://") ? ";" : ":";
  const parts = splitCredential(line, separator);
  const decoded = parts.length === 1 ? decodedCredential(parts[0] || "") : "";
  if (decoded && decoded !== line) {
    const inner = accountFromLine(decoded, hint);
    if (inner) return inner;
  }
  const fitting = formatLists(hint).filter((labels) => formatFits(labels, parts));
  if (fitting.length) return finishAccount(combineFormats(fitting, parts));
  const slots = slotsFromShapes(parts);
  return finishAccount({ slots, gaps: shapeGaps(formatLists(hint), slots, parts) });
}

function accountFromSlots(slots: Partial<Record<Slot, string>>, gaps: AccountGap[] = []): ParsedAccount | null {
  return finishAccount({ slots, gaps });
}

function finishAccount(input: { slots: Partial<Record<Slot, string>>; gaps: AccountGap[] }): ParsedAccount | null {
  const slots = { ...input.slots };
  if (!slots.login && slots.email) {
    slots.login = slots.email;
    delete slots.email;
  }
  const fields: AccountField[] = [];
  for (const slot of ORDER) {
    const value = clean(slots[slot] || "");
    if (!value) continue;
    fields.push({ label: HEADING[slot], value });
  }
  const seen = new Set<string>();
  const gaps = input.gaps.filter((gap) => {
    if (!gap.label || seen.has(gap.label) || fields.some((field) => field.label === gap.label)) return false;
    seen.add(gap.label);
    return true;
  });
  if (!fields.length && !gaps.length) return null;
  const guide: AccountGuide = {
    heading: FACEBOOK_INFO_HEADING,
    note: slots.totp ? `${FACEBOOK_INFO_NOTE} ${FACEBOOK_2FA_NOTE}` : FACEBOOK_INFO_NOTE,
    links: slots.totp ? [...FACEBOOK_2FA_LINKS] : [],
  };
  return { fields, layout: "facebook", guide, gaps };
}

/** One documented order is followed. Two orders that both fit do not overwrite each other. */
function combineFormats(lists: string[][], parts: string[]) {
  const packed = lists.map((labels) => ({ slots: zipSlots(labels, parts), expected: expectedSlots(labels) }));
  const slots: Partial<Record<Slot, string>> = {};
  const gaps: AccountGap[] = [];
  for (const slot of ORDER) {
    const values = [...new Set(packed.map((item) => item.slots[slot] || "").filter(Boolean))];
    const required = packed.every((item) => item.expected.includes(slot));
    if (values.length === 1) slots[slot] = values[0];
    else if (values.length > 1) gaps.push({ label: HEADING[slot], reason: "unlabelled" });
    else if (required) gaps.push({ label: HEADING[slot], reason: "absent" });
  }
  return { slots, gaps };
}

function shapeGaps(lists: string[][], slots: Partial<Record<Slot, string>>, parts: string[]) {
  const gaps: AccountGap[] = [];
  const leftovers = unusedPasswords(slots, parts);
  if (lists.length) {
    const shared = ORDER.filter((slot) => lists.every((labels) => expectedSlots(labels).includes(slot)));
    for (const slot of shared) {
      if (slots[slot]) continue;
      gaps.push({ label: HEADING[slot], reason: leftovers.length ? "unlabelled" : "absent" });
    }
  }
  if (leftovers.length >= 2) {
    if (!slots.password) gaps.push({ label: HEADING.password, reason: "unlabelled" });
    if (!slots.emailPassword) gaps.push({ label: HEADING.emailPassword, reason: "unlabelled" });
  }
  return gaps;
}

function unusedPasswords(slots: Partial<Record<Slot, string>>, parts: string[]) {
  const used = new Set(Object.values(slots).filter(Boolean));
  return parts.map(clean).filter((part) => part && !used.has(part) && isPassword(part));
}

function expectedSlots(labels: string[]): Slot[] {
  const found = new Set<Slot>();
  for (const role of rolesFor(labels)) {
    if (role && role.slot !== "ignore") found.add(role.slot);
  }
  return ORDER.filter((slot) => found.has(slot));
}

function zipSlots(labels: string[], parts: string[]): Partial<Record<Slot, string>> {
  const values = align(labels, parts);
  const slots: Partial<Record<Slot, string>> = {};
  rolesFor(labels).forEach((known, index) => {
    const value = clean(values[index] || "");
    if (!known || known.slot === "ignore" || !value || !matches(known.expect, value) || slots[known.slot]) return;
    slots[known.slot] = value;
  });
  return slots;
}

function formatFits(labels: string[], parts: string[]) {
  const roles = rolesFor(labels);
  const last = roles[roles.length - 1];
  const sink = last?.expect === "cookie" || last?.expect === "url" || last?.slot === "ignore";
  if (parts.length > labels.length && !sink) return false;
  if (parts.length < labels.length) {
    const missing = roles.slice(parts.length);
    if (missing.some((role) => role?.slot !== "ignore")) return false;
  }
  const values = align(labels, parts);
  if (values.length < labels.length && !sink) return false;
  return labels.every((_, index) => {
    const known = roles[index];
    const value = clean(values[index] || "");
    if (!known) return false;
    if (!value) return known.slot === "ignore";
    return matches(known.expect, value);
  });
}

function align(labels: string[], parts: string[]) {
  if (parts.length <= labels.length) return parts;
  const last = rolesFor(labels)[labels.length - 1];
  if (last?.expect === "cookie" || last?.slot === "ignore") {
    return [...parts.slice(0, labels.length - 1), parts.slice(labels.length - 1).join(":")];
  }
  return parts.slice(0, labels.length);
}

function slotsFromShapes(parts: string[]): Partial<Record<Slot, string>> {
  const slots: Partial<Record<Slot, string>> = {};
  const used = new Set<number>();
  const take = (test: (value: string) => boolean) => {
    const index = parts.findIndex((part, place) => !used.has(place) && test(clean(part)));
    if (index < 0) return "";
    used.add(index);
    return clean(parts[index] || "");
  };
  const uid = take(isUid);
  const emails: string[] = [];
  for (let guard = 0; guard < 3; guard += 1) {
    const email = take(isEmail);
    if (!email) break;
    emails.push(email);
  }
  const totp = take(isTotp);
  parts.forEach((part, index) => {
    if (isUrl(clean(part)) || isCookie(clean(part)) || isLiveCode(clean(part))) used.add(index);
  });
  const passwords = parts.map(clean).filter((part, index) => !used.has(index) && isPassword(part));
  if (uid) slots.login = uid;
  else if (emails[0]) slots.login = emails[0];
  if (totp) slots.totp = totp;
  if (emails.length >= 2) slots.email = emails[1];
  else if (uid && emails[0]) slots.email = emails[0];
  const ordered = passwordSlots(parts.map(clean), uid, emails[0] || "", totp);
  const profile = ordered.password ? {} : profilePasswords(parts.map(clean));
  if (ordered.password) slots.password = ordered.password;
  else if (profile.password) slots.password = profile.password;
  else if (passwords.length === 1 && (uid || emails.length)) slots.password = passwords[0];
  if (ordered.emailPassword) slots.emailPassword = ordered.emailPassword;
  else if (profile.emailPassword) slots.emailPassword = profile.emailPassword;
  return slots;
}

/** Email, Facebook password, mailbox password, profile id, then a cookie. Both passwords are fixed by that order. */
function profilePasswords(parts: string[]) {
  const emailAt = parts.findIndex((part) => isEmail(part));
  const uidAt = parts.findIndex((part) => isUid(part));
  if (emailAt !== 0 || uidAt < 3) return {};
  const between = parts.slice(1, uidAt);
  const tail = parts.slice(uidAt + 1).filter(Boolean);
  if (between.length !== 2 || between.some((part) => !isPassword(part))) return {};
  if (tail.some((part) => isTotp(part) || (!isCookie(part) && !isUrl(part)))) return {};
  return { password: between[0], emailPassword: between[1] };
}

/** A uid, then a password, then a 2FA key, then the mailbox, then its password. The positions are fixed by those types. */
function passwordSlots(parts: string[], uid: string, email: string, totp: string) {
  if (!uid || !email || !totp) return {};
  const uidAt = parts.indexOf(uid);
  const emailAt = parts.indexOf(email);
  const totpAt = parts.indexOf(totp);
  if (uidAt < 0 || totpAt < 0 || emailAt < 0) return {};
  if (!(uidAt < totpAt && totpAt < emailAt)) return {};
  const facebook = parts[uidAt + 1] || "";
  const mailbox = parts[emailAt + 1] || "";
  if (facebook === totp || !isPassword(facebook)) return {};
  if (mailbox && mailbox !== totp && !isPassword(mailbox) && !isCookie(mailbox) && !isUrl(mailbox)) return { password: facebook };
  return { password: facebook, emailPassword: isPassword(mailbox) ? mailbox : "" };
}

function slotsFromPairs(lines: string[]): Partial<Record<Slot, string>> {
  const slots: Partial<Record<Slot, string>> = {};
  for (const line of lines) {
    const match = line.match(/^([^:]{1,40})\s:\s([\s\S]+)$/) || line.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
    if (!match) continue;
    const known = slotOf(match[1] || "");
    const value = clean(match[2] || "");
    if (!known || known.slot === "ignore" || !value || !matches(known.expect, value) || slots[known.slot]) continue;
    slots[known.slot] = value;
  }
  return slots;
}

function labeledPair(line: string) {
  const match = line.match(/^([^:]{1,40})\s:\s([\s\S]+)$/) || line.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
  if (!match) return false;
  const known = slotOf(match[1] || "");
  return !!known && known.slot !== "ignore" && !line.includes("|");
}

function formatLists(hint: string) {
  const flat = String(hint || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&/gi, "&").replace(/`/g, " ");
  const start = flat.search(/account\s*format/i);
  const window = start >= 0 ? flat.slice(start) : flat;
  const body = window.split(/\bstep\s+1\b|\bkey features\b|\bimportant notes\b/i)[0] || window;
  const lists: string[][] = [];
  for (const piece of body.split(/\bOR\b/i)) {
    for (const candidate of piece.split(/\n/).map((item) => item.trim()).filter(Boolean)) {
      const labels = splitFormatLabels(candidate.replace(/^.*account\s*format\s*[:\-–]?\s*/i, ""));
      if (labels && labels.length >= 2) {
        lists.push(labels);
        break;
      }
    }
  }
  return lists;
}

function splitFormatLabels(line: string) {
  const cleaned = line.replace(/^[^A-Za-z0-9]+/, "").trim();
  if (!cleaned) return null;
  const rough = cleaned.includes("|") ? cleaned.split("|") : cleaned.split(/\s:\s|:/);
  const labels = rough.map((part) => part.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim()).filter(Boolean);
  if (labels.length < 2 || labels.some((label) => !slotOf(label))) return null;
  return labels;
}

function rolesFor(labels: string[]): Array<Role | null> {
  const parsed = labels.map((label) => slotOf(label));
  const hasLogin = parsed.some((item) => item?.slot === "login");
  if (hasLogin) return parsed;
  return parsed.map((item) => item?.slot === "email" ? { slot: "login", expect: "email" } : item);
}

function slotOf(label: string): Role | null {
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (/cookie|auth token|session|base64/.test(name)) return { slot: "ignore", expect: "cookie" };
  if (/profile link|profile url|page link|backup/.test(name)) return { slot: "ignore", expect: "url" };
  if (/bm id|business manager|page id/.test(name)) return { slot: "ignore", expect: "skip" };
  if (/email ?pass|mail ?pass|mailbox pass|linked email pass|recovery pass/.test(name)) return { slot: "emailPassword", expect: "password" };
  if (/facebook pass|fb pass|account pass|^password$|^pass$|user pass|login pass/.test(name)) return { slot: "password", expect: "password" };
  if (/2fa|two fa|totp|authenticator|secret key|auth key/.test(name)) return { slot: "totp", expect: "totp" };
  if (/profile id|^uid$|facebook id|fb id|user id|login id/.test(name)) return { slot: "login", expect: "uid" };
  if (/linked email|recovery email|recovery mail|^mail$|^email$|email address|associated email|facebook email|fb email|login email/.test(name)) return { slot: "email", expect: "email" };
  if (/username|user name|^login$|^id$/.test(name)) return { slot: "login", expect: "login" };
  return null;
}

function matches(expect: Expect, value: string) {
  if (expect === "email") return isEmail(value);
  if (expect === "uid") return isUid(value);
  if (expect === "totp") return isTotp(value) || isNamedSecret(value);
  if (expect === "url") return isUrl(value);
  if (expect === "cookie") return isCookie(value) || value.length > 20;
  if (expect === "password") return isPassword(value);
  if (expect === "skip") return value.length > 0;
  return isUid(value) || isEmail(value) || isUsername(value);
}

function splitCredential(line: string, separator: ":" | "|" | ";") {
  if (separator !== ":") return line.split(separator).map((part) => part.trim()).filter(Boolean);
  const raw = line.split(":");
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index] || "";
    const next = raw[index + 1] || "";
    if (/^\s*https?$/i.test(current) && next.trim().startsWith("//")) {
      out.push(`${current.trim()}:${next.trim()}`);
      index += 1;
      continue;
    }
    const trimmed = current.trim();
    if (/^[\[{]/.test(trimmed)) {
      out.push(raw.slice(index).join(":").trim());
      break;
    }
    out.push(trimmed);
  }
  return out.filter(Boolean);
}

function fromJson(value: unknown, hint: string): ParsedAccount[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" ? parseFacebookAccounts(item, hint) : fromJson(item, hint));
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.accounts)) return fromJson(record.accounts, hint);
  if (Array.isArray(record.data)) return fromJson(record.data, hint);
  const slots: Partial<Record<Slot, string>> = {};
  for (const [key, item] of Object.entries(record)) {
    if (item == null || typeof item === "object") continue;
    const known = slotOf(key.replace(/[_-]+/g, " "));
    const text = clean(String(item));
    if (!known || known.slot === "ignore" || !text || !matches(known.expect, text) || slots[known.slot]) continue;
    slots[known.slot] = text;
  }
  const account = accountFromSlots(slots);
  return account ? [account] : [];
}

function decodedCredential(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 40 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(compact)) return "";
  let text = "";
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    text = new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
  if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return "";
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      const user = cookieUser(JSON.parse(text));
      return user ? `User ID : ${user}` : "";
    } catch {
      return "";
    }
  }
  if ((text.includes("@") || /\d{8,20}/.test(text)) && /[:|;]/.test(text)) return text.trim();
  return "";
}

function cookieUser(value: unknown): string {
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = String(record.name || record.key || "").toLowerCase();
    if (name === "c_user" && isUid(String(record.value || ""))) return String(record.value);
    const nested = cookieUser(record.cookies || record.cookie);
    if (nested) return nested;
  }
  return "";
}

function clean(value: string) {
  const text = value.trim().replace(/^["']|["']$/g, "");
  if (!text || /^null$/i.test(text) || text === "-") return "";
  return text;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUid(value: string) {
  return /^\d{8,20}$/.test(value);
}

function isUsername(value: string) {
  return /^[A-Za-z0-9._-]{3,40}$/.test(value) && !isUid(value) && !isTotp(value);
}

function isTotp(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (isLiveCode(compact)) return false;
  return /^[A-Za-z2-7]{16,64}$/.test(compact);
}

/** A column the listing names as the 2FA secret. Stricter than a guess, looser than base32. */
function isNamedSecret(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 8 || compact.length > 80) return false;
  if (isEmail(value) || isUrl(value) || isCookie(value) || isHtml(value) || isLiveCode(compact) || isUid(compact) || isTotp(value)) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(compact);
}

function isHtml(value: string) {
  return /<[a-z!/][^>]*>/i.test(value);
}

function isLiveCode(value: string) {
  return /^\d{6}$/.test(value.trim());
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isCookie(value: string) {
  if (value.length >= 100 || /^[\[{]/.test(value) || /c_user|datr=|xs=/.test(value)) return true;
  return value.length >= 80 && /^[A-Za-z0-9+/=]+$/.test(value);
}

function isPassword(value: string) {
  if (!value || isEmail(value) || isUrl(value) || isTotp(value) || isCookie(value) || isUid(value) || isLiveCode(value) || isHtml(value)) return false;
  return value.length >= 4 && value.length <= 80 && !/\s/.test(value);
}
