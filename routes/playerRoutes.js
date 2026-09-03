const express = require("express");

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
    createPlayer
);

// UPDATE PLAYER
router.put(
    "/:id",
    protectRoute,
    adminOnly,
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