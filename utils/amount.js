/**
 * Amount helpers (Indian numbering: K / Lac / Cr).
 *
 *   formatShortAmount(10000)     -> "10K"
 *   formatShortAmount(100000)    -> "1 Lac"
 *   formatShortAmount(10000000)  -> "1 Cr"
 *   parseAmount("2.5 lac")       -> 250000
 */
const trimNumber = (value) =>
  String(Number(value.toFixed(2))); // 1.50 -> "1.5", 2.00 -> "2"

const formatShortAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (amount >= 10000000) return `${trimNumber(amount / 10000000)} Cr`;
  if (amount >= 100000) return `${trimNumber(amount / 100000)} Lac`;
  if (amount >= 1000) return `${trimNumber(amount / 1000)}K`;
  return String(amount);
};

const UNIT_MULTIPLIERS = {
  k: 1000,
  thousand: 1000,
  l: 100000,
  lac: 100000,
  lacs: 100000,
  lakh: 100000,
  lakhs: 100000,
  cr: 10000000,
  crore: 10000000,
  crores: 10000000,
};

/**
 * Turns "100000", "1,00,000", "50k", "1 lac", "2.5cr" or a number into a plain
 * number of rupees. Returns NaN when the value cannot be understood.
 */
const parseAmount = (input) => {
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  if (typeof input !== "string") return NaN;
  const text = input
    .replace(/[₹,]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!match) return NaN;
  const base = Number(match[1]);
  if (!match[2]) return base;
  const multiplier = UNIT_MULTIPLIERS[match[2]];
  return multiplier ? Math.round(base * multiplier) : NaN;
};

module.exports = { formatShortAmount, parseAmount };
