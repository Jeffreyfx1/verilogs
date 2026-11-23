import assert from "node:assert/strict";
import test from "node:test";
import { fiveSimCancelDecision, mapFiveSimStatus } from "./fivesim-status.ts";

test("FiveSim RECEIVED without an SMS is still waiting", () => {
  assert.equal(mapFiveSimStatus("PENDING"), "waiting");
  assert.equal(mapFiveSimStatus("RECEIVED"), "waiting");
  assert.equal(mapFiveSimStatus("RECEIVED", true), "received");
  assert.equal(mapFiveSimStatus("FINISHED"), "completed");
  assert.equal(mapFiveSimStatus("CANCELED"), "refunded");
  assert.equal(mapFiveSimStatus("TIMEOUT"), "refunded");
});

test("cancel is allowed until an SMS arrives", () => {
  assert.equal(fiveSimCancelDecision("FINISHED"), "already_done");
  assert.equal(fiveSimCancelDecision("RECEIVED"), "cancel");
  assert.equal(fiveSimCancelDecision("RECEIVED", true), "already_done");
  assert.equal(fiveSimCancelDecision("PENDING"), "cancel");
  assert.equal(fiveSimCancelDecision("CANCELED"), "already_canceled");
});
