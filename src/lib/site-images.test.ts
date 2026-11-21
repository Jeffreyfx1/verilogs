import assert from "node:assert/strict";
import test from "node:test";
import { fallbackPhoto, imageKind, photoSlotFor, siteSlot } from "./site-images.ts";

test("image kind accepts photos and rejects other files", () => {
  const jpeg = new Uint8Array(32);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  assert.equal(imageKind(jpeg), "jpeg");

  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(imageKind(png), "png");

  const webp = new Uint8Array(32);
  webp.set(Array.from("RIFF0000WEBP").map((char) => char.charCodeAt(0)));
  assert.equal(imageKind(webp), "webp");

  const exe = new Uint8Array(64);
  exe[0] = 0x4d;
  exe[1] = 0x5a;
  assert.equal(imageKind(exe), "");
  assert.equal(imageKind(new Uint8Array(8)), "");
  assert.equal(imageKind(new Uint8Array(1_500_001)), "");
});

test("homepage cards map onto the real photo slots", () => {
  assert.equal(photoSlotFor("Virtual numbers"), "numbers");
  assert.equal(photoSlotFor("Data"), "data");
  assert.equal(photoSlotFor("MTN Airtime"), "data");
  assert.equal(photoSlotFor("Logs and social"), "logs");
  assert.equal(siteSlot("hero"), "hero");
  assert.equal(siteSlot("banner"), null);
  assert.equal(fallbackPhoto("numbers"), "/photos/numbers.webp");
});
