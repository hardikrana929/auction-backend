const crypto = require("crypto");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const generateAccessCode = () =>
  Array.from(
    { length: 8 },
    () => ALPHABET[crypto.randomInt(0, ALPHABET.length)],
  )
    .join("")
    .toUpperCase();
const generatePassword = (length = 14) => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(
    { length },
    () => chars[crypto.randomInt(0, chars.length)],
  ).join("");
};
const generateUsername = (auctionName = "auction") =>
  `${
    String(auctionName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "auction"
  }${crypto.randomInt(1000, 10000)}`;
const placeholderEmail = (username) =>
  `${String(username).toLowerCase()}@managers.auctionpro.invalid`;
module.exports = {
  generateAccessCode,
  generatePassword,
  generateUsername,
  placeholderEmail,
};
