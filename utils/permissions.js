const isObjectId = (value) =>
  typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
module.exports = { isObjectId };
