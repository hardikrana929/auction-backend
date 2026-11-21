const { getBidIncrement } = require("./bidRules");

/**
 * Admin-controlled bidding (IPL style).
 *
 * Teams do not bid themselves. The admin watches the room, and every time a
 * team "raises a hand" presses the Bidding button, which moves the current bid
 * up by the increment that applies at the current price (auction.bidRules, or
 * the flat auction.bidIncrement as a fallback).
 */

/** Price shown when a player first comes up: base price, never below the minimum bid. */
const getOpeningBid = (player, auction) =>
  Math.max(Number(player?.basePrice || 0), Number(auction?.minimumBid || 0));

/** Increment that applies at the given price. */
const getRaiseIncrement = (currentBid, auction) =>
  getBidIncrement(currentBid, auction?.bidRules, auction?.bidIncrement);

/** The amount the current bid becomes after one raise. */
const getNextRaise = (currentBid, auction) => {
  const current = Number(currentBid || 0);
  const increment = getRaiseIncrement(current, auction);
  return { increment, nextBid: current + increment };
};

/**
 * Can this team buy the player at the current bid?
 * Returns { canBuy, reason }, reason is a short text for the UI / API.
 */
const getBuyEligibility = ({ team, amount, maxPlayersPerTeam }) => {
  if (!team) return { canBuy: false, reason: "Team not found" };
  if (team.status && team.status !== "active")
    return { canBuy: false, reason: "Team is inactive" };

  const bid = Number(amount || 0);
  if (!(bid > 0)) return { canBuy: false, reason: "No bid to buy" };

  const remaining = Number(team.remainingBudget || 0);
  if (remaining < bid)
    return { canBuy: false, reason: "Not enough budget" };

  const limit = Number(maxPlayersPerTeam || 0);
  const squad = Array.isArray(team.players)
    ? team.players.length
    : Number(team.playersCount || 0);
  if (limit > 0 && squad >= limit)
    return { canBuy: false, reason: "Squad is full" };

  return { canBuy: true, reason: "" };
};

module.exports = {
  getOpeningBid,
  getRaiseIncrement,
  getNextRaise,
  getBuyEligibility,
};
