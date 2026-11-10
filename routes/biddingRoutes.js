const express = require("express");

const router = express.Router();

const {
  placeBid,
  getCurrentBid,
  getBidHistory,
  sellPlayer,
  markPlayerUnsold,
} = require("../controllers/biddingController");

const { protectRoute } = require("../middleware/authMiddleware");
const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");
const { bidLimiter } = require("../middleware/rateLimiters");

/*
|--------------------------------------------------------------------------
| Team bidding
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

router.post(
  "/sell",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  sellPlayer,
);

router.post(
  "/unsold",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  markPlayerUnsold,
);

module.exports = router;
