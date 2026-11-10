const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");

const {
  getTeamsByAuction,
  getTeamById,
  createTeam,
  updateTeam,
  updateTeamStatus,
  deleteTeam,
} = require("../controllers/teamController");

const { protectRoute } = require("../middleware/authMiddleware");

const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");

// GET ALL TEAMS OF AN AUCTION
router.get(
  "/auction/:auctionId",
  protectRoute,
  requireAuctionViewer("auctionIdParam"),
  getTeamsByAuction,
);

// GET SINGLE TEAM
router.get(
  "/:id",
  protectRoute,
  requireAuctionViewer("teamParam"),
  getTeamById,
);

// CREATE TEAM
// Multer must execute before auction scope because auctionId
// comes through multipart/form-data.
router.post(
  "/",
  protectRoute,
  upload.single("logo"),
  requireAuctionManager("auctionIdBody"),
  createTeam,
);

// UPDATE TEAM
router.put(
  "/:id",
  protectRoute,
  requireAuctionManager("teamParam"),
  upload.single("logo"),
  updateTeam,
);

// UPDATE TEAM STATUS
router.patch(
  "/:id/status",
  protectRoute,
  requireAuctionManager("teamParam"),
  updateTeamStatus,
);

// DELETE TEAM
router.delete(
  "/:id",
  protectRoute,
  requireAuctionManager("teamParam"),
  deleteTeam,
);

module.exports = router;
