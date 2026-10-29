"use strict";

/**
 * Any approved team may bid, regardless of registration order, except the
 * team that placed the most recent bid. The first bid has no previous-team
 * restriction. Team eligibility and auction capacity are checked separately.
 */
function canTeamBidAfterLastBid(teamId, lastBidTeamId = null) {
  if (!teamId) return false;
  if (!lastBidTeamId) return true;
  return String(teamId) !== String(lastBidTeamId);
}

module.exports = { canTeamBidAfterLastBid };
