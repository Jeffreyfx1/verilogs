import assert from "node:assert/strict";
import test from "node:test";
import { veraFrame } from "@/lib/vera-frame";

test("phone chat stays compact until the keyboard covers the page", () => {
  const resting = veraFrame({ layoutHeight: 852, visibleHeight: 852, offsetTop: 0, width: 393 });
  assert.equal(resting.keyboard, false);
  assert.equal(resting.dockBottom, 84);
  assert.equal(resting.panelHeight, Math.round(852 * 0.68));
  assert.equal(resting.panelWidth, 393 - 16);
  assert.ok(resting.panelHeight < 852 * 0.72);

  const typing = veraFrame({ layoutHeight: 852, visibleHeight: 430, offsetTop: 0, width: 393 });
  assert.equal(typing.keyboard, true);
  assert.equal(typing.dockBottom, 852 - 430 + 4);
  assert.equal(typing.panelHeight, 430 - 8);
  assert.ok(typing.panelHeight < resting.panelHeight);

  const shifted = veraFrame({ layoutHeight: 852, visibleHeight: 400, offsetTop: 36, width: 393 });
  assert.equal(shifted.keyboard, true);
  assert.equal(shifted.dockBottom, 852 - 400 - 36 + 4);
  const top = 852 - (shifted.dockBottom || 0) - shifted.panelHeight;
  assert.ok(top >= 30 && top <= 50);
});

test("landscape and desktop panels fit the visible area", () => {
  const landscape = veraFrame({ layoutHeight: 390, visibleHeight: 390, offsetTop: 0, width: 844 });
  assert.equal(landscape.keyboard, false);
  assert.ok(landscape.panelHeight + 62 + 84 <= 390);
  assert.equal(landscape.panelWidth, 844 - 16);

  const desk = veraFrame({ layoutHeight: 900, visibleHeight: 900, offsetTop: 0, width: 1280 });
  assert.equal(desk.keyboard, false);
  assert.equal(desk.panelHeight, 544);
  assert.equal(desk.panelWidth, 376);
});
