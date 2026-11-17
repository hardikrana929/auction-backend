const Auction = require("../models/Auction");
const Team = require("../models/Team");
const AuctionRegistration = require("../models/AuctionRegistration");
const asyncHandler = require("../utils/asyncHandler");

/**
 * GET /api/players/my-auctions
 *
 * Auctions whose player list the current user may browse (powers the
 * "Players" tab). It mirrors the access rule in middleware/auctionScope.js:
 *  - admin            -> every auction
 *  - auction manager  -> the auction assigned to them
 *  - team owner / registrant -> auctions where they own a team or registered one
 * so every auction returned here can be opened by GET /api/players/auction/:id
 * without hitting a 403.
 */
const getMyAuctions = asyncHandler(async (req, res) => {
  let filter;

  if (req.user.role === "admin") {
    filter = {};
  } else if (req.user.role === "auction_manager") {
    filter = { assignedUser: req.user._id };
  } else {
    const [ownedTeamAuctions, registeredAuctions] = await Promise.all([
      Team.distinct("auction", { owner: req.user._id }),
      AuctionRegistration.distinct("auction", { registeredBy: req.user._id }),
    ]);
    filter = { _id: { $in: [...ownedTeamAuctions, ...registeredAuctions] } };
  }

  const auctions = await Auction.find(filter)
    .select(
      "name date status image minimumBid teamBudget startingBudget maxPlayersPerTeam",
    )
    .sort({ date: -1 });

  res.status(200).json({ success: true, count: auctions.length, auctions });
});

module.exports = { getMyAuctions };
