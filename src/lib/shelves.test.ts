import assert from "node:assert/strict";
import test from "node:test";
import { SHELF_CATEGORIES, onShelf, shelfOf } from "./shelves.ts";

test("each marketplace shelf is one category", () => {
  assert.deepEqual(SHELF_CATEGORIES.vpn, ["vpn"]);
  assert.deepEqual(SHELF_CATEGORIES.smm, ["boost"]);
  assert.deepEqual(SHELF_CATEGORIES.random, ["other"]);
  assert.equal(shelfOf("vpn"), "vpn");
  assert.equal(shelfOf("smm"), "smm");
  assert.equal(shelfOf("shop"), "random");
  assert.equal(shelfOf(undefined), "random");
  assert.equal(onShelf("vpn", "vpn"), true);
  assert.equal(onShelf("vpn", "random"), false);
  assert.equal(onShelf("vpn", "smm"), false);
  assert.equal(onShelf("boost", "smm"), true);
  assert.equal(onShelf("boost", "vpn"), false);
  assert.equal(onShelf("other", "random"), true);
  assert.equal(onShelf("giftcard", "random"), false);
  assert.equal(onShelf("data", "vpn"), false);
  assert.equal(onShelf("airtime", "smm"), false);
});
