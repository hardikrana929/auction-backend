const express = require("express");

const {
    checkAuctionAccess,
    checkTeamAccess,
    getAuctionParticipants,
} = require("../controllers/auctionAccessController");

const { protectRoute } = require("../middleware/authMiddleware");

const {
    validateAuctionId,
    validateTeamAccess,
    approvedTeamOnly,
} = require("../middleware/auctionAccessMiddleware");

const router = express.Router();

// Check current user's auction access
router.get("/:auctionId/check", protectRoute, validateAuctionId, checkAuctionAccess);

// Check team access
router.get("/:auctionId/team/:teamId", protectRoute, validateAuctionId, validateTeamAccess, checkTeamAccess);

// Get approved auction participants
router.get("/:auctionId/participants", protectRoute, validateAuctionId, getAuctionParticipants);

// Example protectRouteed route for approved teams
// This can be reused later for bidding
router.get("/:auctionId/team/:teamId/verify", protectRoute, validateAuctionId, validateTeamAccess,
    approvedTeamOnly,
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "Team is authorized to participate in this auction",
            data: {
                auctionId: req.auction._id,
                teamId: req.team._id,
                registrationId:
                    req.registration._id,
                registrationStatus:
                    req.registration.status,
            },
        });
    }
);

module.exports = router;