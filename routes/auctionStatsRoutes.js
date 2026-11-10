const express = require("express");

const { getAuctionStats } = require("../controllers/auctionStatsController");

const { protectRoute } = require("../middleware/authMiddleware");

const router = express.Router();
const { requireAuctionViewer } = require("../middleware/auctionScope");

// Get auction statistics / dashboard data
router.get("/:auctionId", protectRoute, getAuctionStats);

module.exports = router;
