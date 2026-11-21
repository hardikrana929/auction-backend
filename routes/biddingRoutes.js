const express = require("express");

const router = express.Router();

const {
  placeBid,
  getCurrentBid,
  getBidHistory,
  markPlayerUnsold,
} = require("../controllers/biddingController");
const {
  raiseBid,
  undoRaise,
  sellPlayer,
  rollbackSale,
} = require("../controllers/adminBiddingController");

const { protectRoute } = require("../middleware/authMiddleware");
const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");
const { bidLimiter } = require("../middleware/rateLimiters");

/*
|--------------------------------------------------------------------------
| Bidding by an admin on behalf of a team (team owners cannot bid)
|--------------------------------------------------------------------------
*/

router.post("/place", protectRoute, bidLimiter, placeBid);

/*
|--------------------------------------------------------------------------
| Current auction state
|--------------------------------------------------------------------------
*/

router.get(
  "/current/:auctionId",
  protectRoute,
  requireAuctionViewer("auctionIdParam"),
  getCurrentBid,
);

/*
|--------------------------------------------------------------------------
| Bid history
|--------------------------------------------------------------------------
*/

router.get(
  "/history/:playerId",
  protectRoute,
  requireAuctionViewer("playerIdParam"),
  getBidHistory,
);

/*
|--------------------------------------------------------------------------
| Admin controls
|--------------------------------------------------------------------------
*/

// Admin presses "Bidding": the current bid goes up by the configured increment.
router.post(
  "/raise",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  raiseBid,
);

// Admin takes the last raise back.
router.post(
  "/undo",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  undoRaise,
);

// Admin presses "Buy Player" on a team.
router.post(
  "/sell",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  sellPlayer,
);

// Admin reverses a wrong sale (budget is returned to the team).
router.post(
  "/rollback",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  rollbackSale,
);

router.post(
  "/unsold",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  markPlayerUnsold,
);

module.exports = router;
