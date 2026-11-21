const test = require("node:test");
const assert = require("node:assert/strict");
const { pickNextPlayer, normalizeSelectionMode } = require("../utils/playerSelection");

const pool = [
  { _id: "c", auctionOrder: 3, auctionNumber: 3, createdAt: "2026-01-03" },
  { _id: "a", auctionOrder: 1, auctionNumber: 1, createdAt: "2026-01-02" },
  { _id: "b", auctionOrder: 1, auctionNumber: 2, createdAt: "2026-01-01" },
];

test("order: lowest auctionOrder first, ties by creation time", () => {
  assert.equal(pickNextPlayer({ mode: "order", available: pool }).player._id, "b");
});

test("random: uses the injected random index", () => {
  assert.equal(pickNextPlayer({ mode: "random", available: pool, randomInt: () => 0 }).player._id, "c");
});

test("manual: by auction number or by id", () => {
  assert.equal(pickNextPlayer({ mode: "manual", available: pool, selection: { auctionNumber: "3" } }).player._id, "c");
  assert.equal(pickNextPlayer({ mode: "manual", available: pool, selection: { playerId: "a" } }).player._id, "a");
});

test("manual: asks for a selection and rejects unavailable players", () => {
  assert.match(pickNextPlayer({ mode: "manual", available: pool }).error, /select a player/i);
  assert.match(pickNextPlayer({ mode: "manual", available: pool, selection: { auctionNumber: 99 } }).error, /not available/i);
});

test("empty pool and unknown mode", () => {
  assert.match(pickNextPlayer({ mode: "order", available: [] }).error, /no more players/i);
  assert.equal(normalizeSelectionMode("weird"), "order");
  assert.equal(pickNextPlayer({ mode: "weird", available: pool }).player._id, "b");
});
