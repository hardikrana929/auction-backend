const express = require("express");

const {
  listLiveAuctions,
  getPublicLiveState,
} = require("../controllers/publicLiveController");
const { publicLiveLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

// PUBLIC (no login): watch an auction live.
router.get("/", publicLiveLimiter, listLiveAuctions);
router.get("/:auctionId", publicLiveLimiter, getPublicLiveState);

module.exports = router;
