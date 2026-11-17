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

const {
  getRegistrationLink,
  generateRegistrationLink,
  setRegistrationOpen,
  disableRegistrationLink,
} = require("../controllers/playerRegistrationController");
const { getMyAuctions } = require("../controllers/playerBrowseController");

const { protectRoute } = require("../middleware/authMiddleware");

const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");

// Auctions the current user may browse players for ("Players" tab).
// Must stay above "/:id" so "my-auctions" is not treated as a player id.
router.get("/my-auctions", protectRoute, getMyAuctions);

// Shareable public "register as a player" link (admin / assigned manager).
router.get(
  "/registration-link/:auctionId",
  protectRoute,
  requireAuctionManager("auctionIdParam"),
  getRegistrationLink,
);
router.post(
  "/registration-link/:auctionId",
  protectRoute,
  requireAuctionManager("auctionIdParam"),
  generateRegistrationLink,
);
router.patch(
  "/registration-link/:auctionId",
  protectRoute,
  requireAuctionManager("auctionIdParam"),
  setRegistrationOpen,
);
router.delete(
  "/registration-link/:auctionId",
  protectRoute,
  requireAuctionManager("auctionIdParam"),
  disableRegistrationLink,
);

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
