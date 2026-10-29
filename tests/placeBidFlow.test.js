"use strict";

/**
 * End-to-end-ish test of POST /bidding/place and GET /bidding/current/:id.
 * Mongoose models are replaced with a tiny in-memory fake so the controller's
 * real validation logic runs without needing a MongoDB replica set.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const oid = () => new mongoose.Types.ObjectId();

// ---- fake data store -------------------------------------------------------
const db = { auction: null, player: null, teams: [], regs: [], bids: [], tx: [] };

// chainable, awaitable query
const q = (get) => {
  const api = {
    session: () => api, select: () => api, lean: () => api,
    populate: () => api, sort: () => api,
    then: (res, rej) => Promise.resolve().then(get).then(res, rej),
  };
  return api;
};

const same = (a, b) => String(a?._id || a) === String(b?._id || b);

const stub = (relPath, exports) => {
  const full = require.resolve(path.join("..", relPath));
  require.cache[full] = { id: full, filename: full, loaded: true, exports };
};

const Auction = { findById: () => q(() => db.auction) };
const Player = {
  findById: () => q(() => db.player),
  findOne: () => q(() => (db.player?.status === "auctioning" ? db.player : null)),
};
const Team = {
  find: (f = {}) => q(() => db.teams.filter((t) =>
    (!f._id?.$in || f._id.$in.some((id) => same(id, t._id))) &&
    (!f.status || t.status === f.status) &&
    (!f.owner || same(f.owner, t.owner)) &&
    (!f.auction || same(f.auction, t.auction)))),
  findById: (id) => q(() => db.teams.find((t) => same(t._id, id)) || null),
};
const AuctionRegistration = {
  find: (f = {}) => q(() => db.regs.filter((r) =>
    (!f.status || r.status === f.status) &&
    (!f.team?.$in || f.team.$in.some((id) => same(id, r.team))))),
  findOne: (f = {}) => q(() => db.regs.find((r) => r.status === f.status && same(r.team, f.team)) || null),
};
const Bid = {
  findOne: () => q(() => [...db.bids].reverse()[0] || null),
  create: async ([doc]) => {
    const bid = { _id: oid(), createdAt: new Date(), ...doc };
    db.bids.push(bid);
    return [bid];
  },
};

stub("models/Auction.js", Auction);
stub("models/Player.js", Player);
stub("models/Team.js", Team);
stub("models/AuctionRegistration.js", AuctionRegistration);
stub("models/Bid.js", Bid);
stub("utils/notify.js", {
  logTransaction: async (d) => db.tx.push(d),
  getAuctionParticipantOwners: async () => [],
  notifyUsers: async () => [],
});
stub("socket/auctionSocket.js", { getAuctionRoom: (id) => `auction:${id}` });

mongoose.startSession = async () => ({
  withTransaction: async (fn) => fn(),
  endSession: async () => {},
});

const { placeBid, getCurrentBid } = require("../controllers/biddingController");

// ---- helpers ---------------------------------------------------------------
const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const emitted = [];
const makeReq = (user, body) => ({
  user, body, params: { auctionId: String(db.auction._id) },
  app: { get: () => ({ to: () => ({ emit: (...a) => emitted.push(a) }) }) },
});

function seed({ rules, budgetA = 1_000_000, budgetB = 1_000_000, teams = 2, minimumBid = 10000, basePrice = 10000 } = {}) {
  const auctionId = oid();
  db.auction = {
    _id: auctionId, status: "live", minimumBid, bidIncrement: 5000,
    bidRules: rules ?? [{ upTo: 100000, increment: 5000 }, { upTo: null, increment: 10000 }],
    maxPlayersPerTeam: 15,
  };
  db.player = {
    _id: oid(), auction: auctionId, status: "auctioning", basePrice,
    currentBid: basePrice, currentBidder: null,
    toObject() { return { ...this }; }, save: async () => {},
  };
  const users = [oid(), oid(), oid()];
  db.teams = users.slice(0, teams).map((u, i) => ({
    _id: oid(), auction: auctionId, owner: u, name: `Team ${"ABC"[i]}`, status: "active",
    remainingBudget: i === 0 ? budgetA : budgetB, players: [],
  }));
  db.regs = db.teams.map((t) => ({ auction: auctionId, team: t._id, status: "approved" }));
  db.bids = []; db.tx = []; emitted.length = 0;
  return {
    A: { user: { _id: users[0], role: "user" }, team: db.teams[0] },
    B: { user: { _id: users[1], role: "user" }, team: db.teams[1] },
  };
}

const bid = async (who, amount, withTeamId = true) => {
  const res = makeRes();
  await placeBid(makeReq(who.user, {
    auctionId: String(db.auction._id), playerId: String(db.player._id),
    ...(withTeamId ? { teamId: String(who.team._id) } : {}), amount,
  }), res);
  return res;
};

// ---- tests -----------------------------------------------------------------
test("first bid at opening price succeeds and returns nextBid", async () => {
  const { A } = seed();
  const res = await bid(A, 10000);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(res.body.nextBid, 15000);
  assert.equal(res.body.lastBidTeam.name, "Team A");
  assert.equal(emitted[0][0], "bid:new");
  assert.equal(emitted[0][1].nextBid, 15000);
});

test("bid without teamId is resolved from the logged-in owner", async () => {
  const { A } = seed();
  const res = await bid(A, 10000, false);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
});

test("same team cannot bid twice in a row (409)", async () => {
  const { A } = seed();
  await bid(A, 10000);
  const res = await bid(A, 15000);
  assert.equal(res.statusCode, 409);
});

test("teams alternate with correct increments", async () => {
  const { A, B } = seed();
  assert.equal((await bid(A, 10000)).statusCode, 201);
  assert.equal((await bid(B, 15000)).statusCode, 201);
  assert.equal((await bid(A, 20000)).statusCode, 201);
});

test("too-low bid is rejected with minimumRequiredBid so the UI can resync", async () => {
  const { A, B } = seed();
  await bid(A, 10000);
  const res = await bid(B, 12000);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.minimumRequiredBid, 15000);
  assert.equal(res.body.nextBid, 15000);
});

test("tier boundary: at exactly upTo the NEXT tier increment applies", async () => {
  // upTo is exclusive on the backend. 95k -> 100k (5k tier), then 100k -> 110k (10k tier).
  const { A, B } = seed({ basePrice: 95000, minimumBid: 95000 });
  assert.equal((await bid(A, 95000)).statusCode, 201);
  assert.equal((await bid(B, 100000)).statusCode, 201);
  const low = await bid(A, 105000); // what a "<=" frontend would send
  assert.equal(low.statusCode, 400);
  assert.equal(low.body.minimumRequiredBid, 110000);
  assert.equal((await bid(A, 110000)).statusCode, 201);
});

test("only one approved team => clear 400", async () => {
  const { A } = seed({ teams: 1 });
  const res = await bid(A, 10000);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /at least two/i);
});

test("insufficient budget => 400", async () => {
  const { A } = seed({ budgetA: 5000 });
  const res = await bid(A, 10000);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /budget/i);
});

test("a user cannot bid for another user's team", async () => {
  const { A, B } = seed();
  const r = makeRes();
  await placeBid(makeReq(A.user, {
    auctionId: String(db.auction._id), playerId: String(db.player._id),
    teamId: String(B.team._id), amount: 10000,
  }), r);
  assert.equal(r.statusCode, 403);
});

test("getCurrentBid no longer crashes and returns server-computed nextBid", async () => {
  const { A } = seed();
  await bid(A, 10000);
  const res = makeRes();
  await getCurrentBid(makeReq(A.user, {}), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.nextBid, 15000);
  assert.equal(res.body.approvedTeamCount, 2);
  assert.equal(res.body.canStartBidding, true);
});

test("getCurrentBid before any bid reports the opening price", async () => {
  const { A } = seed({ basePrice: 20000, minimumBid: 10000 });
  const res = makeRes();
  await getCurrentBid(makeReq(A.user, {}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.nextBid, 20000);
  assert.equal(res.body.lastBidTeam, null);
});
