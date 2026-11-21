const test = require("node:test");
const assert = require("node:assert/strict");
const { formatShortAmount, parseAmount } = require("../utils/amount");

test("short amount: K / Lac / Cr", () => {
  assert.equal(formatShortAmount(500), "500");
  assert.equal(formatShortAmount(10000), "10K");
  assert.equal(formatShortAmount(100000), "1 Lac");
  assert.equal(formatShortAmount(250000), "2.5 Lac");
  assert.equal(formatShortAmount(10000000), "1 Cr");
  assert.equal(formatShortAmount(12500000), "1.25 Cr");
  assert.equal(formatShortAmount(0), "");
  assert.equal(formatShortAmount("abc"), "");
});

test("parseAmount understands plain numbers and K/Lac/Cr text", () => {
  assert.equal(parseAmount(100000), 100000);
  assert.equal(parseAmount("1,00,000"), 100000);
  assert.equal(parseAmount("50k"), 50000);
  assert.equal(parseAmount("1 Lac."), 100000);
  assert.equal(parseAmount("2.5 cr"), 25000000);
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("5 bananas")));
});
