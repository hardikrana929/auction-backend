const { parseAmount } = require("./amount");

/**
 * Excel import of players.
 *
 * COLUMNS is the single source of truth: it drives the "file format" help shown
 * in the UI, the downloadable sample file, and the row validation below.
 */
const ROLES = ["Batsman", "Bowler", "All Rounder", "Wicket Keeper"];
const GENDERS = ["Male", "Female", "Other"];
const BATTING_HANDS = ["Right Hand", "Left Hand", "Not Applicable"];
const BOWLING_STYLES = [
  "Right Arm Fast",
  "Right Arm Medium",
  "Left Arm Fast",
  "Left Arm Medium",
  "Right Arm Off Spin",
  "Right Arm Leg Spin",
  "Left Arm Orthodox",
  "Left Arm Chinaman",
  "Does Not Bowl",
];

const MAX_IMPORT_ROWS = 500;

const COLUMNS = [
  { key: "fullName", header: "First Name", required: true, example: "Rohit", note: "Letters only" },
  { key: "lastName", header: "Last Name", required: true, example: "Sharma", note: "Letters only" },
  { key: "villageTown", header: "Village/Town", required: true, example: "Rajkot" },
  { key: "role", header: "Role", required: true, example: "Batsman", options: ROLES },
  { key: "basePrice", header: "Base Price", required: false, example: 100000, note: "Rupees. 100000, 1 Lac or 50K all work. Blank = auction minimum bid" },
  { key: "contactNo", header: "Contact No", required: false, example: "9876543210", note: "10 digits" },
  { key: "whatsappNo", header: "WhatsApp No", required: false, example: "9876543210", note: "10 digits" },
  { key: "age", header: "Age", required: false, example: 24, note: "10 to 60" },
  { key: "gender", header: "Gender", required: false, example: "Male", options: GENDERS },
  { key: "battingHand", header: "Batting Hand", required: false, example: "Right Hand", options: BATTING_HANDS },
  { key: "bowlingStyle", header: "Bowling Style", required: false, example: "Right Arm Fast", options: BOWLING_STYLES },
  { key: "experience", header: "Experience (Years)", required: false, example: 3, note: "Whole number" },
  { key: "specialization", header: "Specialization", required: false, example: "Power hitter, Fielding", note: "Separate several with commas" },
  { key: "bio", header: "Bio", required: false, example: "Opening batsman", note: "Up to 500 characters" },
  { key: "photoUrl", header: "Photo URL", required: false, example: "https://example.com/photo.jpg", note: "Direct http(s) image link" },
];

const normalizeHeader = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// header text (normalized) -> column key. A few friendly aliases are accepted.
const HEADER_LOOKUP = (() => {
  const lookup = new Map();
  COLUMNS.forEach((column) => lookup.set(normalizeHeader(column.header), column.key));
  const aliases = {
    firstname: "fullName",
    name: "fullName",
    fullname: "fullName",
    village: "villageTown",
    town: "villageTown",
    city: "villageTown",
    villagetown: "villageTown",
    playerrole: "role",
    baseprice: "basePrice",
    price: "basePrice",
    contact: "contactNo",
    contactnumber: "contactNo",
    mobile: "contactNo",
    phone: "contactNo",
    whatsapp: "whatsappNo",
    whatsappnumber: "whatsappNo",
    experience: "experience",
    experienceyears: "experience",
    skills: "specialization",
    photo: "photoUrl",
    image: "photoUrl",
  };
  Object.entries(aliases).forEach(([alias, key]) => lookup.set(alias, key));
  return lookup;
})();

/** Maps the header row of the sheet to column keys. */
const mapHeaders = (headerCells) => {
  const mapping = {};
  (headerCells || []).forEach((cell, index) => {
    const key = HEADER_LOOKUP.get(normalizeHeader(cell));
    if (key && mapping[key] === undefined) mapping[key] = index;
  });
  const missing = COLUMNS.filter(
    (column) => column.required && mapping[column.key] === undefined,
  ).map((column) => column.header);
  return { mapping, missing };
};

const text = (value) => String(value ?? "").trim();

// "right hand" -> "Right Hand" (case-insensitive match against the allowed list)
const matchOption = (value, options) =>
  options.find((option) => option.toLowerCase() === text(value).toLowerCase());

const PERSON_NAME = /^[\p{L}][\p{L} .'’-]*$/u;
const PHONE = /^\d{10}$/;

// Numbers typed into Excel as phone numbers arrive as numbers: 9876543210
const digits = (value) => text(value).replace(/\.0+$/, "");

/**
 * Validates and normalizes one row.
 * @param {object} raw      { fullName, lastName, ... } (values straight from the sheet)
 * @param {object} auction  { minimumBid, teamBudget/startingBudget }
 * @returns {{ data?: object, errors: string[] }}
 */
const normalizePlayerRow = (raw, auction) => {
  const errors = [];

  const fullName = text(raw.fullName);
  const lastName = text(raw.lastName);
  const villageTown = text(raw.villageTown);

  if (!fullName) errors.push("First Name is required");
  else if (!PERSON_NAME.test(fullName)) errors.push("First Name must contain letters only");
  if (!lastName) errors.push("Last Name is required");
  else if (!PERSON_NAME.test(lastName)) errors.push("Last Name must contain letters only");
  if (!villageTown) errors.push("Village/Town is required");

  const role = matchOption(raw.role, ROLES);
  if (!text(raw.role)) errors.push("Role is required");
  else if (!role) errors.push(`Role must be one of: ${ROLES.join(", ")}`);

  const minimumBid = Number(auction?.minimumBid || 0);
  const budget = Number(auction?.teamBudget ?? auction?.startingBudget ?? 0);
  let basePrice = minimumBid;
  if (text(raw.basePrice) !== "") {
    basePrice = parseAmount(
      typeof raw.basePrice === "number" ? raw.basePrice : text(raw.basePrice),
    );
    if (!Number.isFinite(basePrice) || basePrice <= 0)
      errors.push("Base Price is not a valid amount");
    else if (basePrice < minimumBid)
      errors.push(`Base Price cannot be below the minimum bid (${minimumBid})`);
    else if (budget > 0 && basePrice > budget)
      errors.push(`Base Price cannot exceed the team budget (${budget})`);
  }

  const contactNo = digits(raw.contactNo);
  if (contactNo && !PHONE.test(contactNo)) errors.push("Contact No must be 10 digits");
  const whatsappNo = digits(raw.whatsappNo);
  if (whatsappNo && !PHONE.test(whatsappNo)) errors.push("WhatsApp No must be 10 digits");

  let age;
  if (text(raw.age) !== "") {
    age = Number(raw.age);
    if (!Number.isInteger(age) || age < 10 || age > 60)
      errors.push("Age must be a whole number from 10 to 60");
  }

  let experience = 0;
  if (text(raw.experience) !== "") {
    experience = Number(raw.experience);
    if (!Number.isInteger(experience) || experience < 0)
      errors.push("Experience must be a whole number (0 or more)");
  }

  const pick = (value, options, label, fallback) => {
    if (text(value) === "") return fallback;
    const matched = matchOption(value, options);
    if (!matched) errors.push(`${label} must be one of: ${options.join(", ")}`);
    return matched || fallback;
  };
  const gender = pick(raw.gender, GENDERS, "Gender", "Male");
  const battingHand = pick(raw.battingHand, BATTING_HANDS, "Batting Hand", "Right Hand");
  const bowlingStyle = pick(raw.bowlingStyle, BOWLING_STYLES, "Bowling Style", "Does Not Bowl");

  const bio = text(raw.bio);
  if (bio.length > 500) errors.push("Bio cannot exceed 500 characters");

  const photoUrl = text(raw.photoUrl);
  if (photoUrl && !/^https?:\/\/\S+$/i.test(photoUrl))
    errors.push("Photo URL must start with http:// or https://");

  if (errors.length) return { errors };

  return {
    errors,
    data: {
      fullName,
      lastName,
      villageTown,
      role,
      basePrice,
      contactNo,
      whatsappNo,
      age,
      gender,
      battingHand,
      bowlingStyle,
      experience,
      specialization: text(raw.specialization)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      bio,
      photo: { url: photoUrl, publicId: "" },
    },
  };
};

/** Same person = same first name + last name + village/town (case-insensitive). */
const duplicateKey = (player) =>
  [player.fullName, player.lastName, player.villageTown]
    .map((part) => text(part).toLowerCase())
    .join("|");

/**
 * Validates the whole sheet.
 * @param {any[][]} rows   first row = headers, remaining rows = players
 * @param {object} auction
 * @param {Set<string>} existingKeys duplicateKey() of players already in the auction
 */
const parsePlayerRows = (rows, auction, existingKeys = new Set()) => {
  const [headerRow, ...dataRows] = rows || [];
  const { mapping, missing } = mapHeaders(headerRow);
  if (missing.length)
    return {
      fatal: `Missing required column(s): ${missing.join(", ")}. Download the sample file to see the format.`,
      valid: [],
      errors: [],
    };

  const valid = [];
  const errors = [];
  const seen = new Set(existingKeys);
  let counted = 0;

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based rows
    const isBlank = !(cells || []).some((cell) => text(cell) !== "");
    if (isBlank) return;

    counted += 1;
    const raw = {};
    Object.entries(mapping).forEach(([key, column]) => {
      raw[key] = cells[column];
    });

    const { data, errors: rowErrors } = normalizePlayerRow(raw, auction);
    if (rowErrors.length) {
      errors.push({ row: rowNumber, message: rowErrors.join("; ") });
      return;
    }
    const key = duplicateKey(data);
    if (seen.has(key)) {
      errors.push({
        row: rowNumber,
        message: "Duplicate player (same name and village/town already exists)",
      });
      return;
    }
    seen.add(key);
    valid.push({ row: rowNumber, data });
  });

  if (counted > MAX_IMPORT_ROWS)
    return {
      fatal: `A file can contain at most ${MAX_IMPORT_ROWS} players (found ${counted}).`,
      valid: [],
      errors: [],
    };

  return { valid, errors, total: counted };
};

module.exports = {
  COLUMNS,
  ROLES,
  GENDERS,
  BATTING_HANDS,
  BOWLING_STYLES,
  MAX_IMPORT_ROWS,
  mapHeaders,
  normalizePlayerRow,
  duplicateKey,
  parsePlayerRows,
};
