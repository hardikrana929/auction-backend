const Auction = require("../models/Auction");

/**
 * Reserves `count` consecutive "auction numbers" (player IDs inside the
 * auction) with ONE atomic $inc, so two admins importing / adding players at
 * the same time can never receive the same number.
 *
 * @returns {Promise<number>} the first reserved number
 */
const reserveAuctionNumbers = async (auctionId, count = 1, session) => {
  const updated = await Auction.findByIdAndUpdate(
    auctionId,
    { $inc: { playerCounter: count } },
    { new: true, ...(session ? { session } : {}) },
  ).select("playerCounter");

  if (!updated) throw new Error("Auction not found");
  return updated.playerCounter - count + 1;
};

module.exports = { reserveAuctionNumbers };
