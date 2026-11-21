const test = require("node:test");
const assert = require("node:assert/strict");
const { planCategoryChange } = require("../utils/playerCategory");

test("auction player stays unchanged", () => {
  const r = planCategoryChange({ category: "auction", status: "available" }, {});
  assert.deepEqual(r.changes, {});
});

test("auction -> icon needs a team and becomes retained", () => {
  assert.match(planCategoryChange({ status: "available" }, { category: "icon" }).error, /select the team/i);
  const r = planCategoryChange({ status: "available" }, { category: "icon", teamId: "t1" });
  assert.deepEqual(r.changes, { category: "icon", status: "retained", team: "t1" });
  assert.equal(r.pushToTeam, "t1");
});

test("moving an icon player to another team pulls from the old one", () => {
  const r = planCategoryChange({ category: "icon", status: "retained", team: "t1" }, { teamId: "t2" });
  assert.equal(r.pullFromTeam, "t1");
  assert.equal(r.pushToTeam, "t2");
});

test("icon -> auction returns the player to the pool", () => {
  const r = planCategoryChange({ category: "owner", status: "retained", team: "t1" }, { category: "auction" });
  assert.deepEqual(r.changes, { category: "auction", status: "available", team: null });
  assert.equal(r.pullFromTeam, "t1");
});

test("sold / auctioning players cannot change category", () => {
  assert.ok(planCategoryChange({ category: "auction", status: "sold" }, { category: "icon", teamId: "t" }).error);
  assert.ok(planCategoryChange({ category: "icon", status: "auctioning" }, { category: "auction" }).error);
  assert.ok(planCategoryChange({}, { category: "nope" }).error);
});
