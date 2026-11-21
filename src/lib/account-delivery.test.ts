import assert from "node:assert/strict";
import test from "node:test";
import { formatLabels, hideSupplier, parseAccountDelivery } from "./account-delivery.ts";

const hint = "Ready to use. Account format: TikTok Username : Account Password : Recovery Email : Email Password : Profile URL";

test("a listing format labels each delivered value and keeps the profile URL whole", () => {
  const [account] = parseAccountDelivery("ada:secret:ada@mail.com:mailpass:https://www.tiktok.com/@ada", hint);
  assert.deepEqual(account?.fields.map((field) => field.label), ["TikTok Username", "Account Password", "Recovery Email", "Email Password", "Profile URL"]);
  assert.equal(account?.fields[2]?.value, "ada@mail.com");
  assert.equal(account?.fields[4]?.value, "https://www.tiktok.com/@ada");
});

test("unknown shapes are not split into invented labels", () => {
  const plain = parseAccountDelivery("ada:secret:ada@mail.com:mailpass", "");
  assert.deepEqual(plain[0]?.fields, [{ label: "Additional Information", value: "ada:secret:ada@mail.com:mailpass" }]);
  const mismatch = parseAccountDelivery("ada:secret:extra", "Account format: Username : Password");
  assert.equal(mismatch[0]?.fields[0]?.label, "Additional Information");
  assert.equal(mismatch[0]?.fields[0]?.value, "ada:secret:extra");
});

test("cookies stay on the last named field and other shapes are kept", () => {
  const labels = formatLabels("Format: email:password:refresh_token:client_id");
  assert.deepEqual(labels, ["email", "password", "refresh_token", "client_id"]);
  const cookie = parseAccountDelivery("ada:secret:mail:mailpass:a:b:c", "Account format: Username : Password : Email : Email Password : Cookies");
  assert.equal(cookie[0]?.fields.at(-1)?.value, "a:b:c");
  const json = parseAccountDelivery(JSON.stringify({ username: "ada", password: "secret" }), "");
  assert.equal(json[0]?.fields[0]?.label, "username");
  assert.equal(json[0]?.fields[1]?.value, "secret");
  const lines = parseAccountDelivery("one:two\nthree:four", "Format: Login : Password");
  assert.equal(lines.length, 2);
  assert.equal(lines[1]?.fields[0]?.value, "three");
  const named = parseAccountDelivery("Username : ada", "");
  assert.deepEqual(named[0]?.fields, [{ label: "Username", value: "ada" }]);
});

test("supplier names are removed from customer text only", () => {
  assert.equal(hideSupplier("AccsZone TikTok | Ready", "AccsZone"), "TikTok | Ready");
  assert.equal(hideSupplier("ada:secret"), "ada:secret");
});
