import assert from "node:assert/strict";
import test from "node:test";
import { mergeCategories, rowsOf } from "./shelf-nav.ts";

test("an empty category does not remove the other categories", () => {
  const known = mergeCategories([], ["TikTok", "Instagram", "Telegram"]);
  const stuck = mergeCategories(known, [], "Instagram");
  assert.deepEqual(stuck, ["TikTok", "Instagram", "Telegram"]);
});

test("a bad catalogue response is an empty list, not a crash", () => {
  assert.deepEqual(rowsOf(null), []);
  assert.deepEqual(rowsOf({ data: [] }), []);
  assert.equal(rowsOf([{ id: "1" }]).length, 1);
});
