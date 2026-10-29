"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getExpectedMinimumBid } = require("../utils/expectedBidAmount");

test("first bid opens at base price even though currentBid is initialized", () => {
  assert.equal(getExpectedMinimumBid({
    player: { basePrice: 100000, currentBidder: null },
    auction: { minimumBid: 50000 },
    currentBid: 100000,
    increment: 200000,
  }), 100000);
});

test("opening bid respects auction minimum when it exceeds base price", () => {
  assert.equal(getExpectedMinimumBid({
    player: { basePrice: 100000, currentBidder: null },
    auction: { minimumBid: 150000 },
    currentBid: 100000,
    increment: 200000,
  }), 150000);
});

test("subsequent bid must increase the actual leading bid by the increment", () => {
  assert.equal(getExpectedMinimumBid({
    player: { basePrice: 100000, currentBidder: "team-1" },
    auction: { minimumBid: 50000 },
    currentBid: 100000,
    increment: 200000,
  }), 300000);
});
