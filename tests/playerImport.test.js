const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePlayerRows, mapHeaders, duplicateKey, COLUMNS, MAX_IMPORT_ROWS } = require("../utils/playerImport");

const auction = { minimumBid: 100000, teamBudget: 10000000 };
const header = ["First Name", "Last Name", "Village/Town", "Role", "Base Price", "Contact No"];

test("format has 4 required and the rest optional columns", () => {
  assert.equal(COLUMNS.filter((c) => c.required).length, 4);
  assert.ok(COLUMNS.length > 4);
});

test("headers are matched case/punctuation-insensitively, with aliases", () => {
  const { mapping, missing } = mapHeaders(["first name *", "LAST NAME", "village", "role"]);
  assert.deepEqual(missing, []);
  assert.equal(mapping.villageTown, 2);
});

test("missing required column is a fatal error", () => {
  const r = parsePlayerRows([["First Name", "Role"], ["A", "Bowler"]], auction);
  assert.match(r.fatal, /Last Name/);
});

test("valid rows are normalized; amounts accept Lac/K text; blank price = minimum bid", () => {
  const r = parsePlayerRows(
    [
      header,
      ["Rohit", "Sharma", "Rajkot", "batsman", "1.5 Lac", 9876543210],
      ["Jasprit", "Bumrah", "Surat", "Bowler", "", ""],
    ],
    auction,
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.valid[0].data.role, "Batsman");
  assert.equal(r.valid[0].data.basePrice, 150000);
  assert.equal(r.valid[0].data.contactNo, "9876543210");
  assert.equal(r.valid[1].data.basePrice, 100000);
});

test("bad rows are reported with their sheet row number; good rows still import", () => {
  const r = parsePlayerRows(
    [
      header,
      ["Rohit", "Sharma", "Rajkot", "Batsman", "", ""],
      ["R2D2", "X", "", "Pilot", "50", "123"],
      [],
      ["Rohit", "Sharma", "rajkot", "Bowler", "", ""],
    ],
    auction,
  );
  assert.equal(r.valid.length, 1);
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].row, 3);
  assert.match(r.errors[0].message, /Role must be one of/);
  assert.match(r.errors[0].message, /Village\/Town is required/);
  assert.equal(r.errors[1].row, 5);
  assert.match(r.errors[1].message, /Duplicate/);
});

test("duplicates against existing players are skipped", () => {
  const existing = new Set([duplicateKey({ fullName: "Rohit", lastName: "Sharma", villageTown: "Rajkot" })]);
  const r = parsePlayerRows([header, ["rohit", "sharma", "RAJKOT", "Batsman", "", ""]], auction, existing);
  assert.equal(r.valid.length, 0);
  assert.match(r.errors[0].message, /Duplicate/);
});

test("price below minimum / above budget is rejected; too many rows is fatal", () => {
  const r = parsePlayerRows([header, ["A", "B", "C", "Bowler", "50K", ""], ["A", "C", "C", "Bowler", "2 Cr", ""]], auction);
  assert.equal(r.errors.length, 2);
  const rows = [header, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ["Name", "L" + "x".repeat(i % 5), "V" + i, "Bowler", "", ""])];
  assert.match(parsePlayerRows(rows, auction).fatal, /at most/);
});
