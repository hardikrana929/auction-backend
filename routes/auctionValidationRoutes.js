const express = require("express");

const {
    validateAuctionStart,
    validatePlayerAuction,
    validateBid,
    validateTeamPurchase,
    validateAuctionCompletion,
} = require("../controllers/auctionValidationController");

const {
    protectRoute,
} = require("../middleware/authMiddleware");

const router = express.Router();


// VALIDATE AUCTION START
// GET /api/auction-validation/start/:auctionId
router.get(
    "/start/:auctionId",
    protectRoute,
    validateAuctionStart
);


// VALIDATE PLAYER AUCTION
// GET /api/auction-validation/player/:playerId

router.get(
    "/player/:playerId",
    protectRoute,
    validatePlayerAuction
);


// VALIDATE BID
// POST /api/auction-validation/bid

router.post(
    "/bid",
    protectRoute,
    validateBid
);

// VALIDATE TEAM PURCHASE
// GET /api/auction-validation/team/:teamId/player/:playerId
router.get(
    "/team/:teamId/player/:playerId",
    protectRoute,
    validateTeamPurchase
);

// VALIDATE AUCTION COMPLETION
// GET /api/auction-validation/completion/:auctionId

router.get(
    "/completion/:auctionId",
    protectRoute,
    validateAuctionCompletion
);


module.exports = router;