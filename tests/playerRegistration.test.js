const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateRegistrationToken,
  isValidRegistrationToken,
  getClosedReason,
  validatePublicPlayerInput,
} = require("../utils/playerRegistration");

const auction = { minimumBid: 5000, teamBudget: 100000, status: "upcoming" };
const validBody = {
  fullName: "Rohit",
  lastName: "Sharma",
  villageTown: "Nagpur",
  contactNo: "9876543210",
  role: "Batsman",
};

test("registration tokens are url-safe, long and unique", () => {
  const a = generateRegistrationToken();
  const b = generateRegistrationToken();
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(a, b);
  assert.equal(isValidRegistrationToken(a), true);
});

test("token validator rejects short strings and non-strings (NoSQL injection)", () => {
  assert.equal(isValidRegistrationToken("short"), false);
  assert.equal(isValidRegistrationToken({ $ne: null }), false);
  assert.equal(isValidRegistrationToken(undefined), false);
  assert.equal(isValidRegistrationToken("a".repeat(30) + "/../"), false);
});

test("closed reason follows link switch and auction status", () => {
  assert.equal(getClosedReason({ status: "upcoming", playerRegistrationOpen: true }), null);
  assert.equal(getClosedReason({ status: "draft", playerRegistrationOpen: true }), null);
  assert.equal(getClosedReason({ status: "upcoming", playerRegistrationOpen: false }), "disabled");
  assert.equal(getClosedReason({ status: "live", playerRegistrationOpen: true }), "started");
  assert.equal(getClosedReason({ status: "completed", playerRegistrationOpen: true }), "completed");
  assert.equal(getClosedReason(null), "invalid");
});

test("valid public input is normalised and base price comes from the auction", () => {
  const result = validatePublicPlayerInput(
    { ...validBody, specialization: "Opener", age: "24", experience: "3" },
    auction,
  );
  assert.equal(result.error, undefined);
  assert.equal(result.data.basePrice, 5000);
  assert.deepEqual(result.data.specialization, ["Opener"]);
  assert.equal(result.data.age, 24);
  assert.equal(result.data.gender, "Male");
  assert.equal(result.data.bowlingStyle, "Does Not Bowl");
});

test("auction-controlled fields sent by a visitor are never copied", () => {
  const result = validatePublicPlayerInput(
    {
      ...validBody,
      status: "sold",
      soldTo: "abc",
      soldPrice: 999999,
      currentBid: 999999,
      basePrice: 1,
      auction: "someOtherAuction",
      auctionOrder: 1,
      registrationSource: "admin",
    },
    auction,
  );
  const keys = Object.keys(result.data);
  for (const forbidden of ["status", "soldTo", "soldPrice", "currentBid", "auction", "auctionOrder", "registrationSource"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not be copied`);
  }
  assert.equal(result.data.basePrice, 5000);
});

test("required fields, formats and enums are enforced", () => {
  assert.match(validatePublicPlayerInput({ ...validBody, contactNo: "" }, auction).error, /required/);
  assert.match(validatePublicPlayerInput({ ...validBody, contactNo: "12345" }, auction).error, /10 digits/);
  assert.match(validatePublicPlayerInput({ ...validBody, whatsappNo: "abc" }, auction).error, /WhatsApp/);
  assert.match(validatePublicPlayerInput({ ...validBody, fullName: "R0hit<script>" }, auction).error, /letters/);
  assert.match(validatePublicPlayerInput({ ...validBody, role: "Umpire" }, auction).error, /Role/);
  assert.match(validatePublicPlayerInput({ ...validBody, age: "9" }, auction).error, /Age/);
  assert.match(validatePublicPlayerInput({ ...validBody, age: "24.5" }, auction).error, /Age/);
  assert.match(validatePublicPlayerInput({ ...validBody, bio: "x".repeat(501) }, auction).error, /Bio/);
  assert.match(validatePublicPlayerInput({ ...validBody, battingHand: { $gt: "" } }, auction).error, /Batting hand/);
});

test("zero minimum bid falls back to a positive base price", () => {
  const result = validatePublicPlayerInput(validBody, { ...auction, minimumBid: 0 });
  assert.equal(result.data.basePrice, 1);
});

/* ---------- controller behaviour with the database mocked out ---------- */

const Auction = require("../models/Auction");
const Player = require("../models/Player");
const {
  submitPublicRegistration,
  getPublicRegistration,
} = require("../controllers/playerRegistrationController");

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (payload) => ((res.body = payload), res);
  return res;
};
const run = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = makeRes();
    const originalJson = res.json;
    res.json = (payload) => {
      originalJson(payload);
      resolve(res);
      return res;
    };
    handler(req, res, reject);
  });

const token = generateRegistrationToken();
const stubAuction = (doc) => {
  Auction.findOne = () => ({ select: async () => doc });
};

test("public GET reports an unknown token as 404 without touching the database", async () => {
  let queried = false;
  Auction.findOne = () => ((queried = true), { select: async () => null });
  const res = await run(getPublicRegistration, { params: { token: "nope" } });
  assert.equal(res.statusCode, 404);
  assert.equal(queried, false);
});

test("public GET exposes only safe auction fields", async () => {
  stubAuction({ ...auction, name: "IPL", date: "2026-12-01", playerRegistrationOpen: true, accessCode: "SECRET", minimumBid: 5000 });
  const res = await run(getPublicRegistration, { params: { token } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.auction).sort(), ["date", "description", "image", "name"]);
  assert.equal(res.body.registration.open, true);
});

test("submitting to a closed link is rejected with 403", async () => {
  stubAuction({ ...auction, _id: "a1", playerRegistrationOpen: false });
  const res = await run(submitPublicRegistration, { params: { token }, body: validBody });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.closedReason, "disabled");
});

test("honeypot submissions are acknowledged but never stored", async () => {
  let touched = false;
  Auction.findOne = () => ((touched = true), { select: async () => auction });
  const res = await run(submitPublicRegistration, {
    params: { token },
    body: { ...validBody, website: "http://spam.example" },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(touched, false);
});

test("duplicate contact number in the same auction returns 409", async () => {
  stubAuction({ ...auction, _id: "a1", playerRegistrationOpen: true });
  Player.exists = async () => ({ _id: "existing" });
  let created = false;
  Player.create = async () => ((created = true), {});
  const res = await run(submitPublicRegistration, { params: { token }, body: validBody });
  assert.equal(res.statusCode, 409);
  assert.equal(created, false);
});

test("successful self-registration creates an available, self_registered player", async () => {
  stubAuction({ ...auction, _id: "a1", playerRegistrationOpen: true });
  Player.exists = async () => null;
  let payload;
  Player.create = async (doc) => ((payload = doc), doc);
  const res = await run(submitPublicRegistration, {
    params: { token },
    body: { ...validBody, status: "sold", soldPrice: 50 },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(payload.auction, "a1");
  assert.equal(payload.status, "available");
  assert.equal(payload.soldPrice, 0);
  assert.equal(payload.registrationSource, "self_registered");
  assert.equal(payload.basePrice, 5000);
  assert.deepEqual(Object.keys(res.body.player).sort(), ["fullName", "lastName", "role"]);
});
