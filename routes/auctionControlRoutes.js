const express = require("express");

const {
  startAuction,
  pauseAuction,
  resumeAuction,
  getAuctionSession,
  startNextPlayer,
  completeCurrentPlayer,
  completeAuction,
  setSelectionMode,
} = require("../controllers/auctionControlController");
const { getControlDashboard } = require("../controllers/auctionDashboardController");

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

// How the next player is picked: order | manual | random
router.post(
  "/selection-mode",
  protectRoute,
  requireAuctionManager("auctionIdBody"),
  setSelectionMode,
);

// Everything the admin control dashboard needs, in one request.
router.get(
  "/dashboard/:auctionId",
  protectRoute,
  requireAuctionManager("auctionIdParam"),
  getControlDashboard,
);

module.exports = router;
