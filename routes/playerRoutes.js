const express = require("express");
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
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// GET PLAYERS OF AUCTION
router.get(
    "/auction/:auctionId",
    protectRoute,
    getPlayersByAuction
);

// GET SINGLE PLAYER
router.get(
    "/:id",
    protectRoute,
    getPlayerById
);

// CREATE PLAYER
router.post(
    "/",
    protectRoute,
    adminOnly,
    upload.single("photo"),
    createPlayer
);

// UPDATE PLAYER
router.put(
    "/:id",
    protectRoute,
    adminOnly,
    upload.single("photo"),
    updatePlayer
);

// UPDATE PLAYER STATUS
router.patch(
    "/:id/status",
    protectRoute,
    adminOnly,
    updatePlayerStatus
);

// DELETE PLAYER

router.delete(
    "/:id",
    protectRoute,
    adminOnly,
    deletePlayer
);

module.exports = router;