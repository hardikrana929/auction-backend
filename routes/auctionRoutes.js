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

// Same multer instance already used elsewhere in the app (memory storage,
// JPEG/PNG only, 2MB limit) — reused here so auction banners are validated
// the exact same way as team logos / player photos.
const upload = require("../middleware/uploadMiddleware");

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
    upload.single("image"),
    createAuction
);

// Update auction
router.put(
    "/:id",
    protectRoute,
    adminOnly,
    upload.single("image"),
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