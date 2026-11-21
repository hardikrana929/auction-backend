const Auction = require("../models/Auction");
const AuctionRegistration = require("../models/AuctionRegistration");
const AuctionSession = require("../models/AuctionSession");
const Bid = require("../models/Bid");
const Player = require("../models/Player");
const Team = require("../models/Team");
const asyncHandler = require("../utils/asyncHandler");
const {
  getOpeningBid,
  getNextRaise,
  getBuyEligibility,
} = require("../utils/adminBidding");
const { normalizeSelectionMode } = require("../utils/playerSelection");

/**
 * GET /api/auction-control/dashboard/:auctionId  (admin / assigned auction admin)
 *
 * One request with everything the control dashboard shows:
 *   player on the block, current bid, team list with live budgets and the
 *   "can buy" flag, bid history, recent sales and the manual-pick list.
 * "canBuy" is computed here so the UI never has to guess budget rules.
 */
const getControlDashboard = asyncHandler(async (req, res) => {
  const auction = req.auction; // loaded by requireAuctionManager
  const auctionId = auction._id;

  const [session, registrations, counts] = await Promise.all([
    AuctionSession.findOne({ auction: auctionId })
      .populate("currentPlayer")
      .lean(),
    AuctionRegistration.find({ auction: auctionId, status: "approved" })
      .select("team")
      .lean(),
    Player.aggregate([
      { $match: { auction: auctionId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  // ---- player on the block
  let currentPlayer = session?.currentPlayer || null;
  let bids = [];
  let currentBid = 0;
  let nextRaise = { increment: 0, nextBid: 0 };

  const onTheBlock = currentPlayer?.status === "auctioning";
  if (onTheBlock) {
    const history = await Bid.find({
      auction: auctionId,
      player: currentPlayer._id,
      status: "active",
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .select("amount createdAt")
      .lean();
    bids = history;
    currentBid = history.length
      ? Number(history[0].amount)
      : getOpeningBid(currentPlayer, auction);
    nextRaise = getNextRaise(currentBid, auction);
  } else if (currentPlayer?.status === "sold") {
    currentBid = Number(currentPlayer.soldPrice || 0);
  }

  // ---- teams (approved for this auction), with live budget + buy flag
  const teamIds = registrations.map((item) => item.team);
  const teams = await Team.find({ _id: { $in: teamIds } })
    .select("name logo ownerName totalBudget remainingBudget players status")
    .sort({ name: 1 })
    .lean();

  const teamRows = teams.map((team) => {
    const eligibility = onTheBlock
      ? getBuyEligibility({
          team,
          amount: currentBid,
          maxPlayersPerTeam: auction.maxPlayersPerTeam,
        })
      : { canBuy: false, reason: "No player on the block" };
    return {
      _id: team._id,
      name: team.name,
      logo: team.logo,
      ownerName: team.ownerName,
      status: team.status,
      totalBudget: team.totalBudget,
      remainingBudget: team.remainingBudget,
      playersCount: (team.players || []).length,
      maxPlayers: auction.maxPlayersPerTeam,
      canBuy: eligibility.canBuy,
      reason: eligibility.reason,
      balanceAfter: onTheBlock
        ? Number(team.remainingBudget || 0) - currentBid
        : null,
    };
  });

  // ---- recent sales (for the Roll back action)
  const recentSold = await Player.find({ auction: auctionId, status: "sold" })
    .sort({ updatedAt: -1 })
    .limit(10)
    .populate("soldTo", "name logo")
    .select("fullName lastName photo role soldTo soldPrice updatedAt")
    .lean();

  // ---- players the admin can pick manually
  const availablePlayers = await Player.find({
    auction: auctionId,
    status: "available",
  })
    .sort({ auctionOrder: 1, createdAt: 1 })
    .limit(500)
    .select("fullName lastName role basePrice auctionNumber auctionOrder")
    .lean();

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  res.status(200).json({
    success: true,
    auction: {
      _id: auction._id,
      name: auction.name,
      status: auction.status,
      date: auction.date,
      image: auction.image,
      minimumBid: auction.minimumBid,
      bidIncrement: auction.bidIncrement,
      teamBudget: auction.teamBudget ?? auction.startingBudget,
      maxPlayersPerTeam: auction.maxPlayersPerTeam,
      playerSelectionMode: normalizeSelectionMode(auction.playerSelectionMode),
    },
    session: session
      ? {
          status: session.status,
          isPaused: Boolean(session.isPaused),
          playersSold: session.playersSold,
          playersUnsold: session.playersUnsold,
          playersCompleted: session.playersCompleted,
          totalPlayers: session.totalPlayers,
        }
      : null,
    currentPlayer,
    onTheBlock,
    bidding: {
      currentBid,
      nextBid: nextRaise.nextBid,
      increment: nextRaise.increment,
      bids,
    },
    teams: teamRows,
    recentSales: recentSold.map((player) => ({
      player: {
        _id: player._id,
        fullName: player.fullName,
        lastName: player.lastName,
        photo: player.photo,
        role: player.role,
      },
      team: player.soldTo,
      price: player.soldPrice,
      soldAt: player.updatedAt,
    })),
    availablePlayers,
    stats: {
      available: byStatus.available || 0,
      auctioning: byStatus.auctioning || 0,
      sold: byStatus.sold || 0,
      unsold: byStatus.unsold || 0,
      retained: byStatus.retained || 0,
    },
  });
});

module.exports = { getControlDashboard };
