import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "../worker/src/index.js";

test("東京の21:30を次回UTC時刻に変換する", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  assert.equal(nextOccurrence("Asia/Tokyo", 21 * 60 + 30, now), Date.parse("2026-11-20T12:30:00Z") / 1000);
});

test("当日の時刻を過ぎた場合は翌日へ送る", () => {
  const now = Date.parse("2026-11-20T13:00:00Z");
  assert.equal(nextOccurrence("Asia/Tokyo", 21 * 60 + 30, now), Date.parse("2026-11-21T12:30:00Z") / 1000);
});

test("夏時間開始をまたいでも現地時刻を維持する", () => {
  const before = Date.parse("2026-03-07T15:00:00Z");
  assert.equal(nextOccurrence("America/New_York", 9 * 60, before), Date.parse("2026-03-08T13:00:00Z") / 1000);
});

test("夏時間終了をまたいでも現地時刻を維持する", () => {
  const before = Date.parse("2026-10-31T14:00:00Z");
  assert.equal(nextOccurrence("America/New_York", 9 * 60, before), Date.parse("2026-11-01T14:00:00Z") / 1000);
});
