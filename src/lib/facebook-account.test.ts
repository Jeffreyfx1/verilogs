import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountDelivery } from "./account-delivery.ts";
import { FACEBOOK_2FA_LINKS, FACEBOOK_HEADINGS, isFacebookAccount, parseFacebookAccounts } from "./facebook-account.ts";
import { purchaseView } from "./fulfilment.ts";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const USA = `USA Facebook accounts
Account format:
Facebook Email : Facebook Password : Email Password : 2FA Code : Profile Link
OR
Facebook Email : Email Password : Facebook Password : 2FA Code : Profile Link
Step 1: Access Facebook
Visit https://2fagen.com/`;
const PAGE = `Facebook page accounts
Account format:
UID : Facebook Password : 2FA : Mail : Mail Pass : Cookies
OR
Facebook Email : Facebook Password : Email Password : 2FA Code : Profile Link
OR
Facebook Email : Email Password : Facebook Password : 2FA Code : Profile Link`;

test("a Facebook listing format keeps each credential under the requested heading", () => {
  const [account] = parseFacebookAccounts(`buyer@example.com:FbPassw0rd:MailPass99:${SECRET}:https://facebook.com/buyer`, USA);
  assert.deepEqual(account?.fields.map((field) => field.label), ["User ID (Login ID)", "Facebook Password", "2FA Key (Secret)", "Linked Email Password"]);
  assert.deepEqual(account?.fields.map((field) => field.label), account?.fields.map((field) => field.label).slice().sort((a, b) => FACEBOOK_HEADINGS.indexOf(a as typeof FACEBOOK_HEADINGS[number]) - FACEBOOK_HEADINGS.indexOf(b as typeof FACEBOOK_HEADINGS[number])));
  assert.equal(account?.fields[0]?.value, "buyer@example.com");
  assert.equal(account?.fields[1]?.value, "FbPassw0rd");
  assert.equal(account?.fields[2]?.value, SECRET);
  assert.equal(account?.fields[3]?.value, "MailPass99");
  assert.equal(account?.fields.some((field) => field.value.includes("facebook.com")), false);
  assert.equal(account?.guide?.heading, "Links to get Code from 2FA-Key");
  assert.deepEqual(account?.guide?.links, [...FACEBOOK_2FA_LINKS]);
  assert.match(account?.guide?.note || "", /authenticator/);
});

test("a UID format is not forced into the email format, and cookies stay off the page", () => {
  const cookie = `[{"name":"c_user","value":"61500000001"}]`;
  const [account] = parseFacebookAccounts(`61500000001:FbPassw0rd:${SECRET}:buyer@example.com:MailPass99:${cookie}`, PAGE);
  assert.equal(account?.fields.find((field) => field.label === "User ID (Login ID)")?.value, "61500000001");
  assert.equal(account?.fields.find((field) => field.label === "Facebook Password")?.value, "FbPassw0rd");
  assert.equal(account?.fields.find((field) => field.label === "2FA Key (Secret)")?.value, SECRET);
  assert.equal(account?.fields.find((field) => field.label === "Linked Email")?.value, "buyer@example.com");
  assert.equal(account?.fields.find((field) => field.label === "Linked Email Password")?.value, "MailPass99");
  assert.equal(account?.fields.some((field) => field.value.includes("c_user")), false);
});

test("an email-shaped row is not parsed with the UID format", () => {
  const [account] = parseFacebookAccounts(`buyer@example.com:FbPassw0rd:MailPass99:${SECRET}:https://facebook.com/buyer`, PAGE);
  assert.equal(account?.fields.find((field) => field.label === "User ID (Login ID)")?.value, "buyer@example.com");
  assert.equal(account?.fields.find((field) => field.label === "Facebook Password")?.value, "FbPassw0rd");
  assert.notEqual(account?.fields.find((field) => field.label === "Linked Email")?.value, "FbPassw0rd");
  assert.equal(account?.fields.find((field) => field.label === "Linked Email Password")?.value, "MailPass99");
});

test("missing Facebook fields are omitted and a live code is not stored as the 2FA key", () => {
  const partial = parseFacebookAccounts("buyer@example.com:FbPassw0rd", "Facebook account\nAccount format: Facebook Email : Facebook Password");
  assert.deepEqual(partial[0]?.fields.map((field) => field.label), ["User ID (Login ID)", "Facebook Password"]);
  assert.equal(partial[0]?.guide, undefined);
  const code = parseFacebookAccounts("61500000001:FbPassw0rd:123456:buyer@example.com", "Facebook account\nAccount format: UID : Facebook Password : 2FA : Mail");
  assert.equal(code[0]?.fields.some((field) => field.label === "2FA Key (Secret)"), false);
  assert.equal(code[0]?.fields.some((field) => field.value === "123456"), false);
  assert.equal(code[0]?.fields.find((field) => field.label === "User ID (Login ID)")?.value, "61500000001");
  assert.equal(code[0]?.fields.find((field) => field.label === "Linked Email")?.value, "buyer@example.com");
});

test("labelled lines, JSON keys and the pipe format use the same headings", () => {
  const labelled = parseFacebookAccounts([
    "Facebook Password : FbPassw0rd",
    "User ID : 61500000001",
    "Linked Email Password : MailPass99",
    `2FA Key : ${SECRET}`,
    "Linked Email : buyer@example.com",
  ].join("\n"), "Facebook account");
  assert.deepEqual(labelled[0]?.fields.map((field) => field.label), [...FACEBOOK_HEADINGS]);
  assert.equal(labelled[0]?.fields[0]?.value, "61500000001");
  assert.equal(labelled[0]?.fields[1]?.value, "FbPassw0rd");

  const json = parseFacebookAccounts(JSON.stringify({
    username: "61500000001",
    password: "FbPassw0rd",
    email: "buyer@example.com",
    emailpass: "MailPass99",
    "2fa": SECRET,
    cookies: "ignored-cookie",
  }), "Facebook account");
  assert.equal(json[0]?.fields.find((field) => field.label === "Linked Email")?.value, "buyer@example.com");
  assert.equal(json[0]?.fields.find((field) => field.label === "Facebook Password")?.value, "FbPassw0rd");
  assert.equal(json[0]?.fields.some((field) => field.value === "ignored-cookie"), false);

  const piped = parseAccountDelivery(
    `buyer@example.com|FbPassw0rd|${"c".repeat(140)}|tok_123456789012345678901234`,
    "Facebook account\nAccount format: Email | Password | Cookies | Auth Token",
  );
  assert.deepEqual(piped[0]?.fields.map((field) => [field.label, field.value]), [
    ["User ID (Login ID)", "buyer@example.com"],
    ["Facebook Password", "FbPassw0rd"],
  ]);
});

test("other log products stay on the generic parser", () => {
  assert.equal(isFacebookAccount("Facebook followers pack"), false);
  const followers = parseAccountDelivery("plain delivery", "Facebook followers pack");
  assert.equal(followers[0]?.layout, undefined);
  assert.equal(followers[0]?.fields[0]?.label, "Additional Information");
  const tiktok = parseAccountDelivery("ada:secret:ada@mail.com:mailpass:https://www.tiktok.com/@ada", "Account format: TikTok Username : Account Password : Recovery Email : Email Password : Profile URL");
  assert.equal(tiktok[0]?.fields[0]?.label, "TikTok Username");
});

test("only the purchaser view hides the raw Facebook response", () => {
  const delivery = `buyer@example.com:FbPassw0rd:MailPass99:${SECRET}:https://facebook.com/buyer`;
  const order = {
    id: "fb-1",
    category: "logs",
    title: "USA Facebook",
    service: "Facebook",
    amount: 1800,
    status: "completed",
    server: "AccsZone",
    providerOrderId: "az-9",
    delivery,
    detail: USA,
  };
  const customer = purchaseView(order);
  assert.equal(customer.delivery.length, 0);
  assert.equal(customer.server, "");
  assert.equal(customer.reference, "");
  assert.equal(customer.accounts[0]?.layout, "facebook");
  assert.equal(customer.accounts[0]?.fields[1]?.value, "FbPassw0rd");
  const admin = purchaseView(order, [], { admin: true });
  assert.equal(admin.delivery[0], delivery);
  assert.equal(admin.server, "AccsZone");
});
