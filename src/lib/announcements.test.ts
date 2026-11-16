import assert from "node:assert/strict";
import test from "node:test";
import { freshData, liveAnnouncements } from "./catalog.ts";
import { addAnnouncement, setAnnouncements } from "./shop-logic.ts";

test("admin can create, publish, edit and delete the shared announcement list", () => {
  const data = freshData();
  const created = addAnnouncement(data, "usr_admin", "Hello", "Body text");
  assert.equal(created.error, null);
  assert.equal(created.data.announcements[0]?.title, "Hello");
  assert.equal(liveAnnouncements(created.data.announcements).some((item) => item.title === "Hello"), true);

  const hidden = setAnnouncements(
    created.data,
    "usr_admin",
    created.data.announcements.map((item) => (item.title === "Hello" ? { ...item, active: false } : item)),
  );
  assert.equal(hidden.error, null);
  assert.equal(liveAnnouncements(hidden.data.announcements).some((item) => item.title === "Hello"), false);
  assert.equal(hidden.data.announcements.some((item) => item.title === "Hello"), true);

  const edited = setAnnouncements(
    hidden.data,
    "usr_admin",
    hidden.data.announcements.map((item) => (item.title === "Hello" ? { ...item, title: "Hello edited", body: "New body", active: true } : item)),
  );
  assert.equal(edited.error, null);
  const live = liveAnnouncements(edited.data.announcements);
  assert.equal(live.some((item) => item.title === "Hello edited" && item.body === "New body"), true);

  const deleted = setAnnouncements(
    edited.data,
    "usr_admin",
    edited.data.announcements.filter((item) => item.title !== "Hello edited"),
  );
  assert.equal(deleted.error, null);
  assert.equal(deleted.data.announcements.some((item) => item.title === "Hello edited"), false);
  assert.equal(setAnnouncements(data, null, []).error, "Sign in first.");
});

test("scheduled and ended announcements stay off the customer banner", () => {
  const now = Date.parse("2026-06-01T12:00:00.000Z");
  const live = liveAnnouncements([
    { id: "1", title: "Future", body: "", createdAt: "", startsAt: "2026-07-01T00:00:00.000Z", active: true },
    { id: "2", title: "Past end", body: "", createdAt: "", endsAt: "2026-05-01T00:00:00.000Z" },
    { id: "3", title: "Hidden", body: "", createdAt: "", active: false },
    { id: "4", title: "Live", body: "now", createdAt: "" },
  ], now);
  assert.deepEqual(live.map((item) => item.title), ["Live"]);
});
