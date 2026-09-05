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

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Start auction
router.post(
    "/start",
    protectRoute,
    adminOnly,
    startAuction
);

// Pause auction
router.post(
    "/pause",
    protectRoute,
    adminOnly,
    pauseAuction
);

// Resume auction
router.post(
    "/resume",
    protectRoute,
    adminOnly,
    resumeAuction
);

// Get live auction session
router.get(
    "/session/:auctionId",
    protectRoute,
    getAuctionSession
);

// Start next player
router.post(
    "/next-player",
    protectRoute,
    adminOnly,
    startNextPlayer
);

// Update current player session result
router.post(
    "/complete-player",
    protectRoute,
    adminOnly,
    completeCurrentPlayer
);

router.post(
    "/complete",
    protectRoute,
    adminOnly,
    completeAuction
);

module.exports = router;