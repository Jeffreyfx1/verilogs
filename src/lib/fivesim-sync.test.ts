import assert from "node:assert/strict";
import test from "node:test";
import { fiveSimCancelDecision, mapFiveSimStatus } from "./fivesim-status.ts";

test("FiveSim statuses map without treating an SMS as completed", () => {
  assert.equal(mapFiveSimStatus("PENDING"), "waiting");
  assert.equal(mapFiveSimStatus("RECEIVED"), "received");
  assert.equal(mapFiveSimStatus("FINISHED"), "completed");
  assert.equal(mapFiveSimStatus("CANCELED"), "refunded");
  assert.equal(mapFiveSimStatus("TIMEOUT"), "refunded");
});

test("a completed or received order cannot be cancelled", () => {
  assert.equal(fiveSimCancelDecision("FINISHED"), "already_done");
  assert.equal(fiveSimCancelDecision("RECEIVED"), "already_done");
  assert.equal(fiveSimCancelDecision("PENDING"), "cancel");
  assert.equal(fiveSimCancelDecision("CANCELED"), "already_canceled");
});
