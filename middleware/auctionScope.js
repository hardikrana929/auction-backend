const Auction = require("../models/Auction");
const Team = require("../models/Team");
const Player = require("../models/Player");
const AuctionRegistration = require("../models/AuctionRegistration");
const { isObjectId } = require("../utils/permissions");

const resolveAuctionId = async (req, source) => {
  if (source === "auctionIdParam") return req.params.auctionId;
  if (source === "auctionIdBody") return req.body?.auctionId;
  if (source === "idParam") return req.params.id;
  if (source === "teamParam" || source === "teamIdParam") {
    const id = req.params.teamId || req.params.id;
    if (!isObjectId(id)) return id;
    const team = await Team.findById(id).select("auction");
    if (!team) return { notFound: true };
    req.scopedTeam = team;
    return String(team.auction);
  }
  if (source === "playerParam" || source === "playerIdParam") {
    const id = req.params.playerId || req.params.id;
    if (!isObjectId(id)) return id;
    const player = await Player.findById(id).select("auction");
    if (!player) return { notFound: true };
    req.scopedPlayer = player;
    return String(player.auction);
  }
  if (source === "registrationParam") {
    const registration = await AuctionRegistration.findById(
      req.params.registrationId,
    ).select("auction team registeredBy");
    if (!registration) return { notFound: true };
    req.scopedRegistration = registration;
    return String(registration.auction);
  }
  return null;
};

const loadScope = (source, viewer) => async (req, res, next) => {
  try {
    if (!req.user)
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    const auctionId = await resolveAuctionId(req, source);
    if (auctionId?.notFound)
      return res
        .status(404)
        .json({ success: false, message: "Resource not found" });
    if (!isObjectId(auctionId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid auction ID" });
    const auction = await Auction.findById(auctionId);
    if (!auction)
      return res
        .status(404)
        .json({ success: false, message: "Auction not found" });
    req.auction = auction;
    if (req.user.role === "admin") return next();
    const manager =
      req.user.role === "auction_manager" &&
      String(req.user.auction) === String(auction._id) &&
      String(auction.assignedUser) === String(req.user._id);
    if (manager) return next();
    if (!viewer)
      return res
        .status(403)
        .json({ success: false, message: "Auction manager access required" });
    const ownTeamIds = await Team.distinct("_id", {
      auction: auction._id,
      owner: req.user._id,
    });
    const registered = await AuctionRegistration.exists({
      auction: auction._id,
      $or: [{ registeredBy: req.user._id }, { team: { $in: ownTeamIds } }],
    });
    if (!registered && !ownTeamIds.length)
      return res
        .status(403)
        .json({
          success: false,
          message: "You are not a participant in this auction",
        });
    req.ownTeamIds = ownTeamIds;
    return next();
  } catch (error) {
    console.error("Auction scope error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to verify auction access" });
  }
};

module.exports = {
  requireAuctionManager: (source) => loadScope(source, false),
  requireAuctionViewer: (source) => loadScope(source, true),
};
