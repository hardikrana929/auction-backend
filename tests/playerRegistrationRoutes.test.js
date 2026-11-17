const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const app = require("../server");
const Auction = require("../models/Auction");
const Player = require("../models/Player");
const playerRoutes = require("../routes/playerRoutes");
const { generateRegistrationToken } = require("../utils/playerRegistration");

const token = generateRegistrationToken();
const openAuction = {
  _id: "64b000000000000000000001",
  name: "Premier Cup",
  status: "upcoming",
  minimumBid: 5000,
  teamBudget: 100000,
  playerRegistrationOpen: true,
};

const withServer = async (fn) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const formWith = (fields, files = []) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of [].concat(value)) form.append(key, item);
  }
  for (const [name, blob, filename] of files) form.append(name, blob, filename);
  return form;
};

const goodFields = {
  fullName: "Rohit",
  lastName: "Sharma",
  villageTown: "Nagpur",
  contactNo: "9876543210",
  role: "Batsman",
};

test("route order: /my-auctions is registered before /:id", () => {
  const paths = playerRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
  assert.ok(
    paths.indexOf("get /my-auctions") < paths.indexOf("get /:id"),
    "my-auctions must come before /:id",
  );
  for (const method of ["get", "post", "patch", "delete"]) {
    assert.ok(paths.includes(`${method} /registration-link/:auctionId`));
  }
});

test("manager link endpoints and my-auctions require authentication", async () => {
  await withServer(async (base) => {
    for (const [method, path] of [
      ["GET", "/api/players/my-auctions"],
      ["GET", "/api/players/registration-link/64b000000000000000000001"],
      ["POST", "/api/players/registration-link/64b000000000000000000001"],
      ["PATCH", "/api/players/registration-link/64b000000000000000000001"],
      ["DELETE", "/api/players/registration-link/64b000000000000000000001"],
    ]) {
      const res = await fetch(base + path, { method });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });
});

test("public GET: unknown/garbage token -> 404; valid token -> safe auction info", async () => {
  await withServer(async (base) => {
    let res = await fetch(`${base}/api/public/player-registration/short`);
    assert.equal(res.status, 404);

    Auction.findOne = () => ({ select: async () => ({ ...openAuction, accessCode: "SECRET" }) });
    res = await fetch(`${base}/api/public/player-registration/${token}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.auction.name, "Premier Cup");
    assert.equal(body.registration.open, true);
    assert.equal(JSON.stringify(body).includes("SECRET"), false);
    assert.equal(JSON.stringify(body).includes(token), false);
  });
});

test("public POST (multipart, no auth header) creates a self_registered player", async () => {
  await withServer(async (base) => {
    Auction.findOne = () => ({ select: async () => openAuction });
    Player.exists = async () => null;
    let created;
    Player.create = async (doc) => ((created = doc), doc);

    const res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith({ ...goodFields, specialization: ["Opener", "Fielding"], status: "sold", soldPrice: "99" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(created.specialization, ["Opener", "Fielding"]); // repeated multipart field -> array
    assert.equal(created.status, "available");
    assert.equal(created.soldPrice, 0);
    assert.equal(created.registrationSource, "self_registered");
    assert.equal(created.basePrice, 5000);
  });
});

test("public POST: a single specialization value is still stored as an array", async () => {
  await withServer(async (base) => {
    Auction.findOne = () => ({ select: async () => openAuction });
    Player.exists = async () => null;
    let created;
    Player.create = async (doc) => ((created = doc), doc);
    const res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith({ ...goodFields, specialization: "Opener" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(created.specialization, ["Opener"]);
  });
});

test("public POST: bad uploads are rejected before anything is stored", async () => {
  await withServer(async (base) => {
    Auction.findOne = () => ({ select: async () => openAuction });
    Player.exists = async () => null;
    let created = false;
    Player.create = async () => ((created = true), {});

    // wrong type
    let res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith(goodFields, [["photo", new Blob(["GIF89a"], { type: "image/gif" }), "x.gif"]]),
    });
    assert.equal(res.status, 400);

    // right mime/extension but not a real PNG
    res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith(goodFields, [["photo", new Blob(["not a png"], { type: "image/png" }), "x.png"]]),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Invalid image/);

    // over 2 MB
    res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith(goodFields, [["photo", new Blob([new Uint8Array(2.5 * 1024 * 1024)], { type: "image/png" }), "big.png"]]),
    });
    assert.equal(res.status, 400);
    assert.equal(created, false);
  });
});

test("public POST: closed link -> 403, validation error -> 400", async () => {
  await withServer(async (base) => {
    Player.exists = async () => null;
    Player.create = async () => ({});
    Auction.findOne = () => ({ select: async () => ({ ...openAuction, status: "live" }) });
    let res = await fetch(`${base}/api/public/player-registration/${token}`, { method: "POST", body: formWith(goodFields) });
    assert.equal(res.status, 403);

    Auction.findOne = () => ({ select: async () => openAuction });
    res = await fetch(`${base}/api/public/player-registration/${token}`, {
      method: "POST",
      body: formWith({ ...goodFields, contactNo: "123" }),
    });
    assert.equal(res.status, 400);
  });
});
