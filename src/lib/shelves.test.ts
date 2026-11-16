import assert from "node:assert/strict";
import test from "node:test";
import { SHELF_CATEGORIES, onShelf, shelfOf } from "./shelves.ts";

test("each marketplace shelf is one import category", () => {
  assert.deepEqual(SHELF_CATEGORIES.vpn, ["vpn"]);
  assert.deepEqual(SHELF_CATEGORIES.smm, ["smm"]);
  assert.deepEqual(SHELF_CATEGORIES.random, ["logs"]);
  assert.equal(shelfOf("vpn"), "vpn");
  assert.equal(shelfOf("smm"), "smm");
  assert.equal(shelfOf("shop"), "random");
  assert.equal(shelfOf(undefined), "random");
  assert.equal(onShelf("vpn", "vpn"), true);
  assert.equal(onShelf("logs", "random"), true);
  assert.equal(onShelf("vpn", "random"), false);
  assert.equal(onShelf("smm", "smm"), true);
  assert.equal(onShelf("smm", "vpn"), false);
  assert.equal(onShelf("other", "random"), false);
  assert.equal(onShelf("boost", "smm"), false);
  assert.equal(onShelf("number", "random"), false);
  assert.equal(onShelf("usa", "random"), false);
  assert.equal(onShelf("data", "vpn"), false);
  assert.equal(onShelf("airtime", "smm"), false);
});
