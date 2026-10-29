"use strict";

/**
 * Opening bid is the greater of the player's base price and auction minimum.
 * A player.currentBid is initialized to basePrice before anyone bids, so only
 * currentBidder tells us that an actual bid has already been placed.
 */
function getExpectedMinimumBid({ player, auction, currentBid, increment }) {
  const hasActualBid = Boolean(player?.currentBidder);
  if (hasActualBid) {
    return Number(currentBid || 0) + Number(increment || 0);
  }
  return Math.max(
    Number(player?.basePrice || 0),
    Number(auction?.minimumBid || 0),
  );
}

module.exports = { getExpectedMinimumBid };
