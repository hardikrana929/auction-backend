"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getBidIncrement } = require("../utils/bidRules");

const rules = [
  { upTo: 1_000_000, increment: 100_000 },
  { upTo: 3_000_000, increment: 200_000 },
  { upTo: null, increment: 500_000 },
];

test("uses first tier below 1,000,000", () => {
  assert.equal(getBidIncrement(900_000, rules), 100_000);
});
test("switches to second tier when current bid reaches 1,000,000", () => {
  assert.equal(getBidIncrement(1_000_000, rules), 200_000);
});
test("uses second tier below 3,000,000", () => {
  assert.equal(getBidIncrement(2_900_000, rules), 200_000);
});
test("switches to final tier when current bid reaches 3,000,000", () => {
  assert.equal(getBidIncrement(3_000_000, rules), 500_000);
});
test("uses fallback when no rules exist", () => {
  assert.equal(getBidIncrement(10, [], 25), 25);
});
test("rejects invalid fallback values as zero", () => {
  assert.equal(getBidIncrement(10, [], "invalid"), 0);
});
