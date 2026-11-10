const express = require("express");

const {
  startAuction,
  pauseAuction,
  resumeAuction,
  getAuctionSession,
  startNextPlayer,
  completeCurrentPlayer,
  completeAuction,
} = require("../controllers/auctionControlController");

const { protectRoute } = require("../middleware/authMiddleware");
const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");

const router = express.Router();

// Start auction
router.post(
  "/start",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  startAuction,
);

// Pause auction
router.post(
  "/pause",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  pauseAuction,
);

// Resume auction
router.post(
  "/resume",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  resumeAuction,
);

// Get live auction session
router.get("/session/:auctionId", protectRoute, getAuctionSession);

// Start next player
router.post(
  "/next-player",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  startNextPlayer,
);

// Update current player session result
router.post(
  "/complete-player",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  completeCurrentPlayer,
);

router.post(
  "/complete",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  completeAuction,
);

module.exports = router;
