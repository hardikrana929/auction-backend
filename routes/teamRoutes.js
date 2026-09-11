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

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

/*
|--------------------------------------------------------------------------
| TEAM ROUTES
|--------------------------------------------------------------------------
| Base URL:
| /api/teams
|--------------------------------------------------------------------------
*/

/*
 * IMPORTANT:
 * Put /auction/:auctionId BEFORE /:id
 * so "auction" is not treated as a team ID.
 */
router.get(
    "/auction/:auctionId",
    protectRoute,
    getTeamsByAuction
);

router.get(
    "/:id",
    protectRoute,
    getTeamById
);

router.post(
    "/",
    protectRoute,
    adminOnly,
    upload.single("logo"),
    createTeam
);

router.put(
    "/:id",
    protectRoute,
    adminOnly,
    upload.single("logo"),
    updateTeam
);

router.patch(
    "/:id/status",
    protectRoute,
    adminOnly,
    updateTeamStatus
);

router.delete(
    "/:id",
    protectRoute,
    adminOnly,
    deleteTeam
);

module.exports = router;