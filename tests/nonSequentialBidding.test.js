"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { canTeamBidAfterLastBid } = require("../utils/nonSequentialBidding");

test("any approved team can place the first bid regardless of registration order", () => {
  assert.equal(canTeamBidAfterLastBid("team-3", null), true);
});
test("team 2 can bid after team 1", () => {
  assert.equal(canTeamBidAfterLastBid("team-2", "team-1"), true);
});
test("team 3 can bid after team 1 without team 2 taking a turn", () => {
  assert.equal(canTeamBidAfterLastBid("team-3", "team-1"), true);
});
test("team 1 cannot bid twice in a row", () => {
  assert.equal(canTeamBidAfterLastBid("team-1", "team-1"), false);
});
test("team 2 can bid after team 3, even if team 1 skipped", () => {
  assert.equal(canTeamBidAfterLastBid("team-2", "team-3"), true);
});
test("a missing team ID cannot bid", () => {
  assert.equal(canTeamBidAfterLastBid(null, "team-1"), false);
});
