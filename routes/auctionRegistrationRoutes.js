const express = require("express");
const { adminOnly } = require("../middleware/authMiddleware");
const {
  registerTeam,
  approveRegistration,
  rejectRegistration,
  cancelRegistration,
  getAuctionRegistrations,
  getRegistrationById,
  getRegistrationStatus,
} = require("../controllers/auctionRegistrationController");

const { protectRoute } = require("../middleware/authMiddleware");
const {
  requireAuctionManager,
  requireAuctionViewer,
} = require("../middleware/auctionScope");

const router = express.Router();

// TEAM REGISTRATION

// Register team for an auction
router.post("/register", protectRoute, registerTeam);

// ADMIN ACTIONS

// Approve registration
router.put(
  "/:registrationId/approve",
  protectRoute,
  adminOnly,
  approveRegistration,
);

// Reject registration
router.put(
  "/:registrationId/reject",
  protectRoute,
  adminOnly,
  rejectRegistration,
);

// TEAM ACTION

// Cancel registration
router.put("/:registrationId/cancel", protectRoute, cancelRegistration);

// GET REGISTRATIONS

// Get all registrations for an auction
router.get("/:auctionId", protectRoute, adminOnly, getAuctionRegistrations);

// Get registration status for a specific team
router.get("/status/:auctionId/:teamId", protectRoute, getRegistrationStatus);

// Get single registration
router.get("/detail/:registrationId", protectRoute, getRegistrationById);

module.exports = router;
