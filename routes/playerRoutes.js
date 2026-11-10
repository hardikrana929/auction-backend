const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");

const {
  createPlayer,
  getPlayersByAuction,
  getPlayerById,
  updatePlayer,
  updatePlayerStatus,
  deletePlayer,
} = require("../controllers/playerController");

const { protectRoute } = require("../middleware/authMiddleware");

const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");

router.get(
  "/auction/:auctionId",
  protectRoute,
  requireAuctionViewer("auctionIdParam"),
  getPlayersByAuction,
);

router.get(
  "/:id",
  protectRoute,
  requireAuctionViewer("playerParam"),
  getPlayerById,
);

router.post(
  "/",
  protectRoute,
  upload.single("photo"),
  requireAuctionManager("auctionIdBody"),
  createPlayer,
);

router.put(
  "/:id",
  protectRoute,
  requireAuctionManager("playerParam"),
  upload.single("photo"),
  updatePlayer,
);

router.patch(
  "/:id/status",
  protectRoute,
  requireAuctionManager("playerParam"),
  updatePlayerStatus,
);

router.delete(
  "/:id",
  protectRoute,
  requireAuctionManager("playerParam"),
  deletePlayer,
);

module.exports = router;
