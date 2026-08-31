const express = require("express");

const {
    createAuction,
    getAllAuctions,
    getAuctionById,
    updateAuction,
    updateAuctionStatus,
    deleteAuction,
} = require("../controllers/auctionController");

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// PUBLIC / AUTHENTICATED

// Get all auctions
router.get("/", protectRoute, getAllAuctions);

// Get single auction
router.get("/:id", protectRoute, getAuctionById);

// ADMIN ONLY

// Create auction
router.post(
    "/",
    protectRoute,
    adminOnly,
    createAuction
);

// Update auction
router.put(
    "/:id",
    protectRoute,
    adminOnly,
    updateAuction
);

// Update auction status
router.patch(
    "/:id/status",
    protectRoute,
    adminOnly,
    updateAuctionStatus
);

// Delete auction
router.delete(
    "/:id",
    protectRoute,
    adminOnly,
    deleteAuction
);

module.exports = router;