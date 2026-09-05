const express = require("express");

const {
    createTeam,
    getTeamsByAuction,
    getTeamById,
    updateTeam,
    updateTeamStatus,
    deleteTeam,
} = require("../controllers/teamController");

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// GET ALL TEAMS OF AUCTION
router.get(
    "/auction/:auctionId",
    protectRoute,
    getTeamsByAuction
);


// ======================================================
// GET SINGLE TEAM
// ======================================================

router.get(
    "/:id",
    protectRoute,
    getTeamById
);


// ======================================================
// CREATE TEAM
// ======================================================

router.post(
    "/",
    protectRoute,
    adminOnly,
    createTeam
);


// ======================================================
// UPDATE TEAM
// ======================================================

router.put(
    "/:id",
    protectRoute,
    adminOnly,
    updateTeam
);


// ======================================================
// UPDATE TEAM STATUS
// ======================================================

router.patch(
    "/:id/status",
    protectRoute,
    adminOnly,
    updateTeamStatus
);


// ======================================================
// DELETE TEAM
// ======================================================

router.delete(
    "/:id",
    protectRoute,
    adminOnly,
    deleteTeam
);


module.exports = router;