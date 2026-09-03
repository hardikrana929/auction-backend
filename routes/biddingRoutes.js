const express = require("express");

const {
    startPlayerAuction,
    placeBid,
    sellPlayer,
    markPlayerUnsold,
    getCurrentAuctionPlayer,
    getBidHistory,
} = require("../controllers/biddingController");

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// CURRENT AUCTION PLAYER

router.get(
    "/current/:auctionId",
    protectRoute,
    getCurrentAuctionPlayer
);

// BID

router.post(
    "/bid",
    protectRoute,
    placeBid
);

// START PLAYER
// ADMIN ONLY

router.post(
    "/start",
    protectRoute,
    adminOnly,
    startPlayerAuction
);

// SELL PLAYER
// ADMIN ONLY

router.post(
    "/sell",
    protectRoute,
    adminOnly,
    sellPlayer
);

// UNSOLD
// ADMIN ONLY

router.post(
    "/unsold",
    protectRoute,
    adminOnly,
    markPlayerUnsold
);

// BID HISTORY

router.get(
    "/history/:playerId",
    protectRoute,
    getBidHistory
);

module.exports = router;