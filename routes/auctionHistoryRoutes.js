const express = require("express");

const {
    getAuctionHistory,
    getSoldPlayersHistory,
    getUnsoldPlayersHistory,
    getAuctionBidHistory,
    getPlayerTransactionHistory,
} = require("../controllers/auctionHistoryController");

const {
    protectRoute,
} = require("../middleware/authMiddleware");

const router = express.Router();

// COMPLETE AUCTION HISTORY

router.get(
    "/:auctionId",
    protectRoute,
    getAuctionHistory
);

// SOLD PLAYERS

router.get(
    "/:auctionId/sold",
    protectRoute,
    getSoldPlayersHistory
);

// UNSOLD PLAYERS

router.get(
    "/:auctionId/unsold",
    protectRoute,
    getUnsoldPlayersHistory
);

// ALL BIDS

router.get(
    "/:auctionId/bids",
    protectRoute,
    getAuctionBidHistory
);

// PLAYER TRANSACTION HISTORY

router.get(
    "/player/:playerId",
    protectRoute,
    getPlayerTransactionHistory
);


module.exports = router;