const crypto = require("crypto");

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

// Same rule the admin createPlayer endpoint uses for names.
const PERSON_NAME = /^[\p{L}][\p{L} .'-]*$/u;
const TEN_DIGITS = /^\d{10}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

// Players can only be added/registered while the auction has not started.
const REGISTRATION_STATUSES = ["draft", "upcoming"];

// 24 random bytes -> 32 URL-safe characters (192 bits, not guessable).
const generateRegistrationToken = () =>
  crypto.randomBytes(24).toString("base64url");

const isValidRegistrationToken = (value) =>
  typeof value === "string" && TOKEN_PATTERN.test(value);

/**
 * Why a link can't accept registrations right now, or null when it can.
 * "disabled"  -> the organiser closed the link
 * "started"/"completed"/"cancelled" -> the auction status no longer allows players
 */
const getClosedReason = (auction) => {
  if (!auction) return "invalid";
  if (!REGISTRATION_STATUSES.includes(auction.status)) {
    return auction.status === "live" ? "started" : auction.status;
  }
  if (!auction.playerRegistrationOpen) return "disabled";
  return null;
};

const text = (value) => (typeof value === "string" ? value.trim() : "");

const toList = (value) => {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
};

const optionalInt = (value, { min, max, label }) => {
  if (value === undefined || value === null || value === "") {
    return { value: undefined };
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    return { error: `${label} must be a whole number between ${min} and ${max}.` };
  }
  return { value: number };
};

const optionalEnum = (value, allowed, label, fallback) => {
  if (value === undefined || value === null || value === "") {
    return { value: fallback };
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    return { error: `${label} is not a valid option.` };
  }
  return { value };
};

/**
 * Validate and normalise the body of the PUBLIC player registration form.
 * Only an explicit allow-list of fields is ever copied, so a visitor can never
 * set auction-controlled fields (status, bids, sold team, auction, order...).
 *
 * Base price is NOT chosen by the visitor: it starts at the auction's minimum
 * bid and the organiser can raise it later from Player Management.
 *
 * @returns {{ error: string } | { data: object }}
 */
const validatePublicPlayerInput = (body = {}, auction = {}) => {
  const fullName = text(body.fullName);
  const lastName = text(body.lastName);
  const villageTown = text(body.villageTown);
  const contactNo = text(body.contactNo);
  const whatsappNo = text(body.whatsappNo);
  const bio = text(body.bio);

  if (!fullName || !lastName || !villageTown || !body.role || !contactNo) {
    return {
      error:
        "First name, last name, village/town, role and contact number are required.",
    };
  }
  if (
    fullName.length > 100 ||
    lastName.length > 100 ||
    !PERSON_NAME.test(fullName) ||
    !PERSON_NAME.test(lastName)
  ) {
    return {
      error:
        "First and last name may contain letters, spaces, apostrophes, periods, and hyphens only.",
    };
  }
  if (villageTown.length > 100) {
    return { error: "Village/Town is too long." };
  }
  if (!TEN_DIGITS.test(contactNo)) {
    return { error: "Contact number must contain exactly 10 digits." };
  }
  if (whatsappNo && !TEN_DIGITS.test(whatsappNo)) {
    return { error: "WhatsApp number must contain exactly 10 digits." };
  }
  if (bio.length > 500) {
    return { error: "Bio must be 500 characters or fewer." };
  }

  const role = optionalEnum(body.role, ROLES, "Role");
  if (role.error || !role.value) {
    return { error: role.error || "Role is required." };
  }
  const gender = optionalEnum(body.gender, GENDERS, "Gender", "Male");
  if (gender.error) return { error: gender.error };
  const battingHand = optionalEnum(
    body.battingHand,
    BATTING_HANDS,
    "Batting hand",
    "Right Hand",
  );
  if (battingHand.error) return { error: battingHand.error };
  const bowlingStyle = optionalEnum(
    body.bowlingStyle,
    BOWLING_STYLES,
    "Bowling style",
    "Does Not Bowl",
  );
  if (bowlingStyle.error) return { error: bowlingStyle.error };

  const age = optionalInt(body.age, { min: 10, max: 60, label: "Age" });
  if (age.error) return { error: age.error };
  const experience = optionalInt(body.experience, {
    min: 0,
    max: 60,
    label: "Experience",
  });
  if (experience.error) return { error: experience.error };

  const specialization = toList(body.specialization)
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (specialization.length > 10 || specialization.some((s) => s.length > 40)) {
    return {
      error: "Specialization: up to 10 items of 40 characters each.",
    };
  }

  const minimumBid = Number(auction.minimumBid);
  const basePrice = Number.isFinite(minimumBid) && minimumBid > 0 ? minimumBid : 1;
  const budget = Number(auction.teamBudget ?? auction.startingBudget);
  if (Number.isFinite(budget) && basePrice > budget) {
    return {
      error:
        "This auction is not configured correctly yet. Please contact the organiser.",
    };
  }

  return {
    data: {
      fullName,
      lastName,
      villageTown,
      contactNo,
      whatsappNo,
      bio,
      role: role.value,
      gender: gender.value,
      battingHand: battingHand.value,
      bowlingStyle: bowlingStyle.value,
      age: age.value,
      experience: experience.value ?? 0,
      specialization,
      basePrice,
    },
  };
};

module.exports = {
  ROLES,
  GENDERS,
  BATTING_HANDS,
  BOWLING_STYLES,
  REGISTRATION_STATUSES,
  generateRegistrationToken,
  isValidRegistrationToken,
  getClosedReason,
  validatePublicPlayerInput,
};
