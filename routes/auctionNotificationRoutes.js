const express = require("express");

const {
    createNotification,
    getMyNotifications,
    getNotificationById,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteReadNotifications,
    getAuctionNotificationCount,
} = require("../controllers/auctionNotificationController");

const {
    protectRoute,
    adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// CREATE NOTIFICATION
// POST /api/auction-notification
// ADMIN ONLY

router.post("/", protectRoute, adminOnly, createNotification);

// GET MY NOTIFICATIONS
// GET /api/auction-notification

router.get("/", protectRoute, getMyNotifications);

// MARK ALL AS READ
// PUT /api/auction-notification/read-all

router.put("/read-all", protectRoute, markAllNotificationsAsRead);

// DELETE ALL READ NOTIFICATIONS
// DELETE /api/auction-notification/read

router.delete("/read", protectRoute, deleteReadNotifications);

// AUCTION NOTIFICATION COUNT
// GET /api/auction-notification/count/:auctionId

router.get("/count/:auctionId", protectRoute, getAuctionNotificationCount);

// SINGLE NOTIFICATION
// GET /api/auction-notification/:notificationId

router.get("/:notificationId", protectRoute, getNotificationById);

// MARK SINGLE NOTIFICATION AS READ
// PUT /api/auction-notification/:notificationId/read

router.put("/:notificationId/read", protectRoute, markNotificationAsRead);

// DELETE SINGLE NOTIFICATION
// DELETE /api/auction-notification/:notificationId

router.delete("/:notificationId", protectRoute, deleteNotification);


module.exports = router;