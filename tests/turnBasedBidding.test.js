"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextTeamId, getTurnState } = require("../utils/turnBasedBidding");

const teams = ["team-1", "team-2", "team-3"];

test("first bid belongs to the first approved team", () => {
  assert.equal(getNextTeamId(teams), "team-1");
});
test("turn moves from team 1 to team 2", () => {
  assert.equal(getNextTeamId(teams, "team-1"), "team-2");
});
test("turn moves from team 2 to team 3", () => {
  assert.equal(getNextTeamId(teams, "team-2"), "team-3");
});
test("turn wraps from last team to first team", () => {
  assert.equal(getNextTeamId(teams, "team-3"), "team-1");
});
test("unknown previous bidder safely resets to first team", () => {
  assert.equal(getNextTeamId(teams, "removed-team"), "team-1");
});
test("no approved teams means there is no next turn", () => {
  assert.equal(getNextTeamId([]), null);
});
test("turn state requires at least two approved teams", () => {
  assert.equal(getTurnState([{ _id: "team-1", name: "One" }]).canStartBidding, false);
  assert.equal(getTurnState([{ _id: "team-1" }, { _id: "team-2" }]).canStartBidding, true);
});
test("turn state includes next team's ID and name", () => {
  const state = getTurnState([{ _id: "team-1", name: "One" }, { _id: "team-2", name: "Two" }], "team-1");
  assert.equal(state.nextTeamId, "team-2");
  assert.equal(state.nextTeam.name, "Two");
});
