"use strict";

/**
 * Resolve the increment for the current bid. Thresholds are exclusive: once
 * the current bid reaches a threshold, the next tier applies. The first rule
 * whose upTo is null or greater than the current bid is selected.
 */
function getBidIncrement(currentBid, rules, fallbackIncrement = 0) {
  const amount = Number(currentBid);
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const validRules = Array.isArray(rules) ? rules : [];
  const matched = validRules.find((rule) =>
    rule && (rule.upTo == null || normalizedAmount < Number(rule.upTo))
  );
  const increment = Number(matched?.increment ?? fallbackIncrement);
  return Number.isFinite(increment) && increment > 0 ? increment : 0;
}

module.exports = { getBidIncrement };
