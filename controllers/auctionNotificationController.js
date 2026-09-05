const AuctionNotification = require("../models/AuctionNotification");
const Auction = require("../models/Auction");

// CREATE NOTIFICATION
// POST /api/auction-notification
// ADMIN / SYSTEM
const createNotification = async (req, res) => {
    try {
        const {
            auctionId,
            recipient,
            team,
            player,
            type,
            title,
            message,
            data,
        } = req.body;

        if (!auctionId || !recipient || !type || !title || !message) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId, recipient, type, title and message are required",
            });
        }

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const notification =
            await AuctionNotification.create({
                auction: auctionId,
                recipient,
                team: team || null,
                player: player || null,
                type,
                title,
                message,
                data: data || {},
            });

        const populatedNotification =
            await AuctionNotification.findById(notification._id)
                .populate("auction", "name status")
                .populate("recipient", "name email role")
                .populate("team", "name logo")
                .populate("player", "fullName photo role basePrice currentBid status");

        return res.status(201).json({
            success: true,
            message: "Notification created successfully",
            notification: populatedNotification,
        });
    } catch (error) {
        console.error(
            "Create Notification Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to create notification",
            error: error.message,
        });
    }
};


// GET MY NOTIFICATIONS
// GET /api/auction-notification

const getMyNotifications = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            unreadOnly = "false",
        } = req.query;

        const filter = { recipient: req.user._id, };

        if (unreadOnly === "true") {
            filter.isRead = false;
        }

        const pageNumber = Math.max(
            Number(page),
            1
        );

        const limitNumber = Math.min(
            Math.max(Number(limit), 1),
            100
        );

        const skip = (pageNumber - 1) * limitNumber;

        const [
            notifications,
            total,
            unreadCount,
        ] = await Promise.all([
            AuctionNotification.find(filter)
                .populate("auction", "name status date")
                .populate("team", "name logo")
                .populate("player", "fullName photo role")
                .sort({ createdAt: -1, })
                .skip(skip)
                .limit(limitNumber),

            AuctionNotification.countDocuments(filter),

            AuctionNotification.countDocuments({ recipient: req.user._id, isRead: false, }),
        ]);

        return res.status(200).json({
            success: true,
            count: notifications.length,
            total,
            unreadCount,
            page: pageNumber,
            pages: Math.ceil(total / limitNumber),
            notifications,
        });
    } catch (error) {
        console.error(
            "Get Notifications Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get notifications",
            error: error.message,
        });
    }
};


// GET SINGLE NOTIFICATION
// GET /api/auction-notification/:notificationId

const getNotificationById = async (req, res) => {
    try {
        const { notificationId, } = req.params;

        const notification =
            await AuctionNotification.findOne({
                _id: notificationId,
                recipient: req.user._id,
            })
                .populate("auction", "name description image date status")
                .populate("team", "name logo ownerName")
                .populate("player", "fullName photo role basePrice currentBid status");

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            notification,
        });
    } catch (error) {
        console.error("Get Notification Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get notification",
            error: error.message,
        });
    }
};


// MARK NOTIFICATION AS READ
// PUT /api/auction-notification/:notificationId/read

const markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId, } = req.params;

        const notification =
            await AuctionNotification.findOne({ _id: notificationId, recipient: req.user._id, });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        if (!notification.isRead) {
            notification.isRead = true;
            notification.readAt = new Date();

            await notification.save();
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification,
        });
    } catch (error) {
        console.error(
            "Mark Notification Read Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to mark notification as read",
            error: error.message,
        });
    }
};

// MARK ALL NOTIFICATIONS AS READ
// PUT /api/auction-notification/read-all

const markAllNotificationsAsRead = async (req, res) => {
    try {
        const result =
            await AuctionNotification.updateMany(
                {
                    recipient: req.user._id,
                    isRead: false,
                },
                {
                    $set: {
                        isRead: true,
                        readAt: new Date(),
                    },
                }
            );

        return res.status(200).json({
            success: true,
            message:
                "All notifications marked as read",
            modifiedCount:
                result.modifiedCount,
        });
    } catch (error) {
        console.error(
            "Mark All Notifications Read Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read",
            error: error.message,
        });
    }
};


// DELETE NOTIFICATION
// DELETE /api/auction-notification/:notificationId

const deleteNotification = async (req, res) => {
    try {
        const { notificationId, } = req.params;

        const notification =
            await AuctionNotification.findOneAndDelete(
                {
                    _id: notificationId,
                    recipient: req.user._id,
                }
            );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully",
        });
    } catch (error) {
        console.error(
            "Delete Notification Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to delete notification",
            error: error.message,
        });
    }
};

// DELETE ALL READ NOTIFICATIONS
// DELETE /api/auction-notification/read

const deleteReadNotifications = async (req, res) => {
    try {
        const result =
            await AuctionNotification.deleteMany(
                {
                    recipient: req.user._id,
                    isRead: true,
                }
            );

        return res.status(200).json({
            success: true,
            message: "Read notifications deleted successfully",
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error("Delete Read Notifications Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete read notifications",
            error: error.message,
        });
    }
};

// GET AUCTION NOTIFICATION COUNT
// GET /api/auction-notification/count/:auctionId

const getAuctionNotificationCount = async (req, res) => {
    try {
        const { auctionId, } = req.params;

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const total =
            await AuctionNotification.countDocuments(
                {
                    auction: auctionId,
                    recipient: req.user._id,
                }
            );

        const unread =
            await AuctionNotification.countDocuments(
                {
                    auction: auctionId,
                    recipient: req.user._id,
                    isRead: false,
                }
            );

        return res.status(200).json({
            success: true,
            auctionId,
            total,
            unread,
        });
    } catch (error) {
        console.error("Get Auction Notification Count Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get notification count",
            error: error.message,
        });
    }
};


module.exports = {
    createNotification,
    getMyNotifications,
    getNotificationById,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteReadNotifications,
    getAuctionNotificationCount,
};