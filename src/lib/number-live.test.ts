import assert from "node:assert/strict";
import test from "node:test";
import { applyLiveToOrder, easternWallToIso, getatextCancelResult, mapFiveSimActivation, mapGetaTextRental, orderIsOpen, phaseFromStored } from "./number-live.ts";

test("GetaText end_time is New York wall time, not UTC and not the SIM deadline", () => {
  assert.equal(easternWallToIso("2026-01-15 12:00:00"), "2026-01-15T17:00:00.000Z");
  assert.equal(easternWallToIso("2026-07-06 15:43:37"), "2026-07-06T19:43:37.000Z");
  const live = mapGetaTextRental({
    status: "active",
    number: "12025550123",
    end_time: "2026-07-06 15:43:37",
    deadline: "2026-07-08 14:30:00",
    code: null,
    codes: [],
  });
  assert.equal(live.expiresAt, "2026-07-06T19:43:37.000Z");
  assert.notEqual(live.expiresAt, "2026-07-06T15:43:37.000Z");
  assert.equal(live.phase, "waiting");
  assert.equal(live.terminal, false);
  assert.equal(live.cancellable, true);
  assert.equal(live.messages.length, 0);
});

test("a GetaText purchase success and an SMS do not complete the rental", () => {
  const bought = mapGetaTextRental({ status: "success", number: "12025550123", end_time: "2026-07-06 15:43:37", code: null });
  assert.equal(bought.phase, "waiting");
  assert.equal(bought.terminal, false);
  const sms = mapGetaTextRental({
    status: "active",
    number: "12025550123",
    end_time: "2026-07-06 15:43:37",
    service_name: "Whatsapp",
    code: "654321",
    codes: ["111111", "654321"],
  });
  assert.equal(sms.phase, "received");
  assert.equal(sms.terminal, false);
  assert.equal(sms.cancellable, false);
  assert.deepEqual(sms.messages.map((item) => item.code), ["111111", "654321"]);
  assert.equal(sms.messages.every((item) => item.text === ""), true);
  const viewed = mapGetaTextRental({ status: "viewed", code: "654321", codes: ["654321"] });
  assert.equal(viewed.phase, "received");
  assert.equal(viewed.terminal, false);
});

test("GetaText completed, expired and cancelled stay distinct and a code is not invented", () => {
  assert.equal(mapGetaTextRental({ status: "completed", code: "1", codes: ["1"] }).phase, "completed");
  assert.equal(mapGetaTextRental({ status: "expired", code: null, codes: [] }).phase, "expired");
  assert.equal(mapGetaTextRental({ status: "cancelled" }).phase, "cancelled");
  const empty = mapGetaTextRental({ status: "active", code: null, codes: [] });
  assert.equal(empty.messages.length, 0);
  const applied = applyLiveToOrder(
    { status: "waiting", code: "", providerStatus: "active", messages: [] },
    mapGetaTextRental({ status: "active", code: "222", codes: ["222"], end_time: "2026-07-06 15:43:37" }),
  );
  assert.equal(applied.order.status, "received");
  assert.equal(applied.refund, false);
  const done = applyLiveToOrder(applied.order, mapGetaTextRental({ status: "completed", code: "222", codes: ["222"] }));
  assert.equal(done.order.status, "completed");
  assert.equal(done.refund, false);
  const expired = applyLiveToOrder({ status: "waiting", providerStatus: "active" }, mapGetaTextRental({ status: "expired" }));
  assert.equal(expired.order.status, "waiting");
  assert.equal(expired.order.providerStatus, "expired");
  assert.equal(expired.refund, false);
  assert.equal(orderIsOpen(expired.order), false);
  const cancelled = applyLiveToOrder({ status: "waiting" }, mapGetaTextRental({ status: "cancelled" }));
  assert.equal(cancelled.order.status, "refunded");
  assert.equal(cancelled.refund, true);
  const again = applyLiveToOrder(cancelled.order, mapGetaTextRental({ status: "cancelled" }));
  assert.equal(again.refund, false);
});

test("a later GetaText code stored first is put back into the provider order", () => {
  const applied = applyLiveToOrder(
    { status: "received", code: "654321", providerStatus: "active", messages: [{ at: "2026-07-06 15:40:00", sender: "Whatsapp", text: "", code: "654321" }] },
    mapGetaTextRental({ status: "active", number: "12025550123", service_name: "Whatsapp", code: "654321", codes: ["111111", "654321"], end_time: "2026-07-06 15:43:37" }),
  );
  assert.deepEqual(applied.order.messages?.map((item) => item.code), ["111111", "654321"]);
  assert.equal(applied.order.messages?.[1]?.at, "2026-07-06 15:40:00");
  assert.equal(applied.order.code, "654321");
  assert.equal(applied.order.status, "received");
  assert.equal(applied.refund, false);
});

test("GetaText cancellation is confirmed only by a cancelled status", () => {
  assert.equal(getatextCancelResult({ status: "cancelled" }, true), "confirmed");
  assert.equal(getatextCancelResult({ status: "active", errors: "EARLY_CANCEL_DENIED" }, false), "rejected");
  assert.equal(getatextCancelResult({ status: "active" }, true), "unknown");
  assert.equal(getatextCancelResult(null, false), "rejected");
});

test("FiveSim keeps its own statuses and does not finish when an SMS arrives", () => {
  const pending = mapFiveSimActivation({ status: "PENDING", phone: "+100", expires: "2026-07-06T19:43:37.000Z", sms: [] });
  assert.equal(pending.phase, "waiting");
  assert.equal(pending.expiresAt, "2026-07-06T19:43:37.000Z");
  assert.equal(pending.cancellable, true);
  const sms = mapFiveSimActivation({ status: "RECEIVED", phone: "+100", sms: [{ sender: "Google", text: "code 444", code: "444", created_at: "2026-01-01T00:00:00Z" }] });
  assert.equal(sms.phase, "received");
  assert.equal(sms.terminal, false);
  assert.equal(sms.cancellable, false);
  assert.equal(sms.messages[0]?.code, "444");
  assert.equal(mapFiveSimActivation({ status: "RECEIVED", sms: [] }).phase, "waiting");
  assert.equal(mapFiveSimActivation({ status: "FINISHED", sms: [{ code: "444", text: "444" }] }).phase, "completed");
  assert.equal(mapFiveSimActivation({ status: "TIMEOUT" }).phase, "expired");
  assert.equal(mapFiveSimActivation({ status: "CANCELED" }).phase, "cancelled");
  assert.equal(phaseFromStored({ status: "received", providerStatus: "RECEIVED", code: "444" }), "received");
  assert.equal(orderIsOpen({ status: "received", providerStatus: "RECEIVED" }), true);
  assert.equal(orderIsOpen({ status: "waiting", providerStatus: "expired" }), false);
});
