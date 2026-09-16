const express = require("express");

const router =
    express.Router();

const {
    placeBid,
    getCurrentBid,
    getBidHistory,
    sellPlayer,
    markPlayerUnsold,
} = require(
    "../controllers/biddingController",
);

const {
    protectRoute,
    adminOnly,
} = require(
    "../middleware/authMiddleware",
);

/*
|--------------------------------------------------------------------------
| Team bidding
|--------------------------------------------------------------------------
*/

router.post(
    "/place",
    protectRoute,
    placeBid,
);

/*
|--------------------------------------------------------------------------
| Current auction state
|--------------------------------------------------------------------------
*/

router.get(
    "/current/:auctionId",
    protectRoute,
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
    adminOnly,
    sellPlayer,
);

router.post(
    "/unsold",
    protectRoute,
    adminOnly,
    markPlayerUnsold,
);

module.exports = router;