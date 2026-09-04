const express = require("express");

const {
    registerTeam,
    approveRegistration,
    rejectRegistration,
    cancelRegistration,
    getAuctionRegistrations,
    getRegistrationById,
    getRegistrationStatus,
} = require("../controllers/auctionRegistrationController");

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();


// TEAM REGISTRATION

// Register team for an auction
router.post(
    "/register",
    protectRoute,
    registerTeam
);


// ADMIN ACTIONS

// Approve registration
router.put(
    "/:registrationId/approve",
    protectRoute,
    adminOnly,
    approveRegistration
);

// Reject registration
router.put(
    "/:registrationId/reject",
    protectRoute,
    adminOnly,
    rejectRegistration
);


// TEAM ACTION

// Cancel registration
router.put(
    "/:registrationId/cancel",
    protectRoute,
    cancelRegistration
);


// GET REGISTRATIONS

// Get all registrations for an auction
router.get(
    "/:auctionId",
    protectRoute,
    getAuctionRegistrations
);


// Get registration status for a specific team
router.get(
    "/status/:auctionId/:teamId",
    protectRoute,
    getRegistrationStatus
);


// Get single registration
router.get(
    "/detail/:registrationId",
    protectRoute,
    getRegistrationById
);


module.exports = router;