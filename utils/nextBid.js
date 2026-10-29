"use strict";

const { getBidIncrement } = require("./bidRules");
const { getExpectedMinimumBid } = require("./expectedBidAmount");

/**
 * Single source of truth for "what is the lowest bid a team may place now?".
 * Used by placeBid (validation) and getCurrentBid / socket payloads (so the
 * frontend shows exactly the amount the backend will accept).
 *
 * latestBid is the most recent persisted Bid for this player (or null).
 */
function computeNextBid({ player, auction, latestBid = null }) {
  const latestBidTeamId = latestBid?.team ? String(latestBid.team._id || latestBid.team) : null;
  const openingBid = Math.max(Number(player?.basePrice || 0), Number(auction?.minimumBid || 0));

  const currentBid = latestBid
    ? Number(latestBid.amount)
    : Number(player?.basePrice || auction?.minimumBid || 0);

  const increment = getBidIncrement(currentBid, auction?.bidRules, auction?.bidIncrement);

  const plainPlayer = typeof player?.toObject === "function" ? player.toObject() : { ...(player || {}) };
  const nextBid = getExpectedMinimumBid({
    player: { ...plainPlayer, currentBidder: latestBidTeamId },
    auction,
    currentBid,
    increment,
  });

  return {
    currentBid: latestBid ? currentBid : openingBid,
    increment,
    nextBid,
    openingBid,
    hasActualBid: Boolean(latestBidTeamId),
    latestBidTeamId,
  };
}

module.exports = { computeNextBid };
