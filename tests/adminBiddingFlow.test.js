"use strict";

/**
 * Flow test of raise -> buy -> roll back, using a tiny in-memory fake of the
 * Mongoose models (same approach as placeBidFlow.test.js), so the controller's
 * real budget / state logic runs without MongoDB.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const oid = () => new mongoose.Types.ObjectId();
const same = (a, b) => String(a?._id || a) === String(b?._id || b);
const db = {};
const q = (get) => {
  const api = { session: () => api, select: () => api, sort: () => api, lean: () => api, then: (a, b) => Promise.resolve().then(get).then(a, b) };
  return api;
};
const stub = (rel, exports) => {
  const full = require.resolve(path.join("..", rel));
  require.cache[full] = { id: full, filename: full, loaded: true, exports };
};

const matches = (doc, f = {}) =>
  Object.entries(f).every(([k, v]) => {
    if (v && typeof v === "object" && "$ne" in v) return !same(doc[k], v.$ne);
    if (v && typeof v === "object" && "$in" in v) return v.$in.includes(doc[k]);
    return same(doc[k], v) || doc[k] === v;
  });

stub("models/Auction.js", { findById: () => q(() => db.auction) });
stub("models/AuctionSession.js", {
  findOne: () => q(() => db.session),
  updateOne: async (f, u) => {
    for (const [k, v] of Object.entries(u.$inc || {})) db.session[k] = (db.session[k] || 0) + v;
    Object.assign(db.session, u.$set || {});
  },
});
stub("models/Player.js", {
  findById: () => q(() => db.player),
  findOne: (f) => q(() => (db.other && matches(db.other, f) ? db.other : null)),
});
stub("models/Team.js", {
  findById: (id) => q(() => db.teams.find((t) => same(t._id, id)) || null),
  findOneAndUpdate: async (f, u) => {
    const t = db.teams.find((x) => same(x._id, f._id));
    if (!t || t.remainingBudget < f.remainingBudget.$gte) return null;
    t.remainingBudget += u.$inc.remainingBudget;
    if (!t.players.some((p) => same(p, u.$addToSet.players))) t.players.push(u.$addToSet.players);
    return t;
  },
  findByIdAndUpdate: async (id, u) => {
    const t = db.teams.find((x) => same(x._id, id));
    if (!t) return null;
    t.remainingBudget += u.$inc.remainingBudget;
    t.players = t.players.filter((p) => !same(p, u.$pull.players));
    return t;
  },
});
stub("models/AuctionRegistration.js", {
  findOne: (f) => q(() => db.regs.find((r) => same(r.team, f.team) && r.status === f.status) || null),
});
stub("models/Bid.js", {
  create: async (docs) => docs.map((d) => { const b = { _id: oid(), createdAt: new Date(), status: "active", ...d }; db.bids.push(b); return b; }),
  findOne: (f) => q(() => [...db.bids].filter((b) => b.status === f.status).reverse()[0] || null),
  deleteOne: async ({ _id }) => { db.bids = db.bids.filter((b) => !same(b._id, _id)); },
  updateOne: async ({ _id }, u) => Object.assign(db.bids.find((b) => same(b._id, _id)), u.$set),
  updateMany: async (f, u) => db.bids.filter((b) => b.status === f.status && (!f._id || !same(b._id, f._id.$ne))).forEach((b) => Object.assign(b, u.$set)),
});
stub("utils/notify.js", { logTransaction: async (d) => db.tx.push(d), getAuctionParticipantOwners: async () => [], notifyUsers: async () => [] });
stub("socket/auctionSocket.js", { getAuctionRoom: (id) => `auction:${id}`, emitPublicUpdate: () => {} });
mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} });

const { raiseBid, undoRaise, sellPlayer, rollbackSale } = require("../controllers/adminBiddingController");

const res = () => { const r = { code: 200 }; r.status = (c) => ((r.code = c), r); r.json = (b) => ((r.body = b), r); return r; };
const call = async (fn, body) => { const r = res(); await fn({ body, user: { _id: oid() }, app: { get: () => null } }, r); return r; };

function seed({ budget = 1_000_000, other = false } = {}) {
  const auctionId = oid();
  db.auction = { _id: auctionId, status: "live", minimumBid: 100000, bidIncrement: 50000, maxPlayersPerTeam: 2, bidRules: [{ upTo: null, increment: 50000 }] };
  db.session = { isPaused: false, playersSold: 0, playersCompleted: 0 };
  db.player = { _id: oid(), auction: auctionId, status: "auctioning", basePrice: 100000, currentBid: 100000, auctionOrder: 1, save: async () => {} };
  db.other = other ? { _id: oid(), status: "auctioning" } : null;
  db.teams = ["A", "B"].map((n) => ({ _id: oid(), auction: auctionId, name: n, status: "active", remainingBudget: budget, players: [] }));
  db.regs = db.teams.map((t) => ({ team: t._id, status: "approved" }));
  db.bids = []; db.tx = [];
  return { auctionId: String(auctionId), playerId: String(db.player._id), A: db.teams[0], B: db.teams[1] };
}

test("raise increases the bid by the increment; undo restores the previous amount", async () => {
  const s = seed();
  let r = await call(raiseBid, s);
  assert.equal(r.body.currentBid, 150000);
  r = await call(raiseBid, s);
  assert.equal(r.body.currentBid, 200000);
  assert.equal(db.player.currentBid, 200000);
  r = await call(undoRaise, s);
  assert.equal(r.body.currentBid, 150000);
  r = await call(undoRaise, s);
  assert.equal(r.body.currentBid, 100000); // back to opening price
  assert.equal((await call(undoRaise, s)).code, 400);
});

test("buy player reduces only that team's budget and adds the player", async () => {
  const s = seed();
  await call(raiseBid, s); // 150000
  const r = await call(sellPlayer, { ...s, teamId: String(s.B._id) });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(db.player.status, "sold");
  assert.equal(db.player.soldPrice, 150000);
  assert.equal(s.B.remainingBudget, 850000);
  assert.equal(s.A.remainingBudget, 1_000_000);
  assert.equal(s.B.players.length, 1);
  assert.equal(db.session.playersSold, 1);
});

test("buy is refused when the team cannot afford the current bid", async () => {
  const s = seed({ budget: 120000 });
  await call(raiseBid, s); // 150000 > 120000
  const r = await call(sellPlayer, { ...s, teamId: String(s.A._id) });
  assert.equal(r.code, 409);
  assert.match(r.body.message, /budget/i);
  assert.equal(s.A.remainingBudget, 120000);
  assert.equal(db.player.status, "auctioning");
});

test("buy without choosing a team is a clear 400", async () => {
  const s = seed();
  assert.equal((await call(sellPlayer, s)).code, 400);
});

test("roll back refunds the wrong team, frees the player and he can be sold to the right team", async () => {
  const s = seed();
  await call(raiseBid, s); // 150000
  await call(sellPlayer, { ...s, teamId: String(s.A._id) }); // wrong team
  assert.equal(s.A.remainingBudget, 850000);

  const rb = await call(rollbackSale, s);
  assert.equal(rb.code, 200, JSON.stringify(rb.body));
  assert.equal(s.A.remainingBudget, 1_000_000); // money revoked back
  assert.equal(s.A.players.length, 0);
  assert.equal(db.player.status, "auctioning"); // back on the block
  assert.equal(db.player.currentBid, 150000);
  assert.equal(db.session.playersSold, 0);

  const ok = await call(sellPlayer, { ...s, teamId: String(s.B._id) });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(s.B.remainingBudget, 850000);
  assert.equal(s.A.remainingBudget, 1_000_000);
});

test("roll back returns the player to the pool when another player is on the block", async () => {
  const s = seed();
  await call(sellPlayer, { ...s, teamId: String(s.A._id) }); // bought at opening price
  assert.equal(s.A.remainingBudget, 900000);
  db.other = { _id: oid(), status: "auctioning", auction: db.auction._id };
  const rb = await call(rollbackSale, s);
  assert.equal(rb.code, 200);
  assert.equal(db.player.status, "available");
  assert.equal(s.A.remainingBudget, 1_000_000);
});

test("only a sold player can be rolled back, and only while live", async () => {
  const s = seed();
  assert.equal((await call(rollbackSale, s)).code, 400);
  await call(sellPlayer, { ...s, teamId: String(s.A._id) });
  db.auction.status = "completed";
  assert.equal((await call(rollbackSale, s)).code, 400);
});

test("paused auction blocks raise and buy", async () => {
  const s = seed();
  db.session.isPaused = true;
  assert.equal((await call(raiseBid, s)).code, 409);
  assert.equal((await call(sellPlayer, { ...s, teamId: String(s.A._id) })).code, 409);
});
