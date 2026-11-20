import assert from "node:assert/strict";
import test from "node:test";
import { restoreSlot } from "./number-slots.ts";

test("a selection is restored only when that provider still lists it", () => {
  const back = restoreSlot({ country: "United States", service: "WhatsApp" }, ["United States", "Nigeria"], ["WhatsApp", "Telegram"]);
  assert.deepEqual(back, { country: "United States", service: "WhatsApp" });
});

test("another provider does not keep a country or service it does not sell", () => {
  const moved = restoreSlot({ country: "United States", service: "WhatsApp" }, ["Nigeria", "Ghana"], ["Telegram"]);
  assert.deepEqual(moved, { country: "", service: "" });
  const countryOnly = restoreSlot({ country: "Nigeria", service: "WhatsApp" }, ["Nigeria"], ["Telegram"]);
  assert.deepEqual(countryOnly, { country: "Nigeria", service: "" });
});

test("USA services stay on the USA list and are not a country id for other servers", () => {
  const usa = restoreSlot({ country: "usa", service: "Google" }, [], ["Google", "WhatsApp"], "usa");
  assert.deepEqual(usa, { country: "usa", service: "Google" });
  const left = restoreSlot({ country: "usa", service: "Google" }, ["United States"], ["WhatsApp"]);
  assert.deepEqual(left, { country: "", service: "" });
});
