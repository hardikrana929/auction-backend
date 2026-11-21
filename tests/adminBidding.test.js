const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getOpeningBid,
  getNextRaise,
  getBuyEligibility,
} = require("../utils/adminBidding");

const auction = {
  minimumBid: 100000,
  bidIncrement: 50000,
  bidRules: [
    { upTo: 500000, increment: 50000 },
    { upTo: null, increment: 100000 },
  ],
};

test("opening bid is base price but never below the minimum bid", () => {
  assert.equal(getOpeningBid({ basePrice: 200000 }, auction), 200000);
  assert.equal(getOpeningBid({ basePrice: 50000 }, auction), 100000);
});

test("each raise adds the increment of the current tier", () => {
  assert.deepEqual(getNextRaise(100000, auction), { increment: 50000, nextBid: 150000 });
  // tier boundary: at exactly 500000 the next tier applies
  assert.deepEqual(getNextRaise(500000, auction), { increment: 100000, nextBid: 600000 });
});

test("falls back to flat bidIncrement without rules", () => {
  assert.equal(getNextRaise(100000, { bidIncrement: 25000 }).nextBid, 125000);
});

test("buy is disabled when the budget is not enough", () => {
  const team = { status: "active", remainingBudget: 90000, players: [] };
  const r = getBuyEligibility({ team, amount: 100000, maxPlayersPerTeam: 5 });
  assert.equal(r.canBuy, false);
  assert.match(r.reason, /budget/i);
});

test("buy is enabled when the budget covers the bid (exactly equal too)", () => {
  const team = { status: "active", remainingBudget: 100000, players: [] };
  assert.equal(getBuyEligibility({ team, amount: 100000, maxPlayersPerTeam: 5 }).canBuy, true);
});

test("buy is disabled for a full squad, inactive team or no bid", () => {
  const full = { status: "active", remainingBudget: 1e7, players: [1, 2] };
  assert.equal(getBuyEligibility({ team: full, amount: 1, maxPlayersPerTeam: 2 }).canBuy, false);
  assert.equal(getBuyEligibility({ team: { status: "inactive", remainingBudget: 1e7 }, amount: 1 }).canBuy, false);
  assert.equal(getBuyEligibility({ team: full, amount: 0, maxPlayersPerTeam: 9 }).canBuy, false);
});
