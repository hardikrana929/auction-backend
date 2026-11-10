const test = require("node:test");
const assert = require("node:assert/strict");
const { canTransition } = require("../utils/auctionTransitions");
const { isObjectId } = require("../utils/permissions");
const {
  generateAccessCode,
  generatePassword,
  generateUsername,
  placeholderEmail,
} = require("../utils/credentials");
const { planRequeue } = require("../utils/requeuePlan");
test("auction status transitions allow only draft/upcoming/cancelled transitions", () => {
  assert.equal(canTransition("draft", "upcoming"), true);
  assert.equal(canTransition("live", "completed"), false);
  assert.equal(canTransition("completed", "draft"), false);
});
test("ObjectId validator accepts only 24 hex strings", () => {
  assert.equal(isObjectId("0123456789abcdef01234567"), true);
  assert.equal(isObjectId({ $ne: null }), false);
  assert.equal(isObjectId("bad"), false);
});
test("credential generators produce expected formats", () => {
  assert.match(generateAccessCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.ok(generatePassword().length >= 8);
  assert.match(generateUsername("Premier League"), /^premier-league\d{4}$/);
  assert.match(placeholderEmail("owner1"), /@managers\.auctionpro\.invalid$/);
});
test("requeue plan puts unsold players after existing queue preserving relative order", () => {
  const plan = planRequeue([
    { _id: "a", status: "unsold", auctionOrder: 2 },
    { _id: "b", status: "available", auctionOrder: 8 },
    { _id: "c", status: "unsold", auctionOrder: 4 },
  ]);
  assert.deepEqual(
    plan.map((x) => x.auctionOrder),
    [9, 10],
  );
});
test("requeue plan can select one unsold player", () => {
  const plan = planRequeue(
    [
      { _id: "a", status: "unsold", auctionOrder: 2 },
      { _id: "b", status: "unsold", auctionOrder: 4 },
    ],
    "b",
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].player._id, "b");
});
