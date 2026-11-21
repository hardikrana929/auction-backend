const mongoose = require("mongoose");
const Auction = require("../models/Auction");
const AuctionSession = require("../models/AuctionSession");
const Bid = require("../models/Bid");
const asyncHandler = require("../utils/asyncHandler");
const { getOpeningBid } = require("../utils/adminBidding");

/*
|--------------------------------------------------------------------------
| Public live screen (NO login)
|--------------------------------------------------------------------------
| Anyone with the link can watch an auction. Only the player's photo and
| details and the current bid are returned: no teams, budgets, bid history,
| contact numbers or owners.
*/

const toPublicPlayer = (player) => ({
  _id: player._id,
  auctionNumber: player.auctionNumber || null,
  fullName: player.fullName,
  lastName: player.lastName,
  photo: player.photo?.url || "",
  role: player.role,
  villageTown: player.villageTown,
  age: player.age ?? null,
  battingHand: player.battingHand,
  bowlingStyle: player.bowlingStyle,
  experience: player.experience ?? 0,
  specialization: player.specialization || [],
  bio: player.bio || "",
  basePrice: player.basePrice,
});

/**
 * Reduces auction + session + player to one simple screen state:
 *   upcoming | waiting | bidding | sold | unsold | paused | completed
 */
const resolvePhase = ({ auction, session, player }) => {
  if (auction.status === "completed") return "completed";
  if (auction.status !== "live") return "upcoming";
  if (session?.isPaused) return "paused";
  if (!player) return "waiting";
  if (player.status === "auctioning") return "bidding";
  if (player.status === "sold") return "sold";
  if (player.status === "unsold") return "unsold";
  return "waiting";
};

// GET /api/public/live  -> auctions that are live right now
const listLiveAuctions = asyncHandler(async (req, res) => {
  const auctions = await Auction.find({ status: "live" })
    .select("name image date")
    .sort({ date: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    count: auctions.length,
    auctions: auctions.map((item) => ({
      _id: item._id,
      name: item.name,
      image: item.image || "",
      date: item.date,
    })),
  });
});

// GET /api/public/live/:auctionId
const getPublicLiveState = asyncHandler(async (req, res) => {
  const { auctionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid auction ID" });
  }

  const auction = await Auction.findById(auctionId).select(
    "name image status date minimumBid",
  );

  // Drafts and cancelled auctions are not public.
  if (!auction || ["draft", "cancelled"].includes(auction.status)) {
    return res
      .status(404)
      .json({ success: false, message: "Auction not found" });
  }

  const session = await AuctionSession.findOne({ auction: auction._id })
    .populate("currentPlayer")
    .lean();
  const player = session?.currentPlayer || null;
  const phase = resolvePhase({ auction, session, player });

  let currentBid = 0;
  if (player && phase === "bidding") {
    const latest = await Bid.findOne({
      auction: auction._id,
      player: player._id,
      status: "active",
    })
      .sort({ createdAt: -1, _id: -1 })
      .select("amount")
      .lean();
    currentBid = latest
      ? Number(latest.amount)
      : getOpeningBid(player, auction);
  } else if (player && phase === "sold") {
    currentBid = Number(player.soldPrice || 0);
  }

  res.status(200).json({
    success: true,
    auction: {
      _id: auction._id,
      name: auction.name,
      image: auction.image || "",
      date: auction.date,
      status: auction.status,
    },
    phase,
    player: player && ["bidding", "sold", "unsold"].includes(phase)
      ? toPublicPlayer(player)
      : null,
    currentBid,
    updatedAt: new Date().toISOString(),
  });
});

module.exports = { listLiveAuctions, getPublicLiveState, resolvePhase };
