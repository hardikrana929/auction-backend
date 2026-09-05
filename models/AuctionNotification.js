const mongoose = require("mongoose");

const auctionNotificationSchema = new mongoose.Schema(
    {
        // Auction related to notification
        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: [true, "Auction is required"],
            index: true,
        },

        // User who should receive notification
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Recipient is required"],
            index: true,
        },

        // Optional team related to notification
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            default: null,
        },

        // Optional player related to notification
        player: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Player",
            default: null,
        },

        // Notification type
        type: {
            type: String,
            enum: [
                "auction_started",
                "auction_paused",
                "auction_resumed",
                "auction_completed",

                "player_started",
                "player_sold",
                "player_unsold",

                "new_bid",
                "outbid",

                "registration_submitted",
                "registration_approved",
                "registration_rejected",
                "registration_cancelled",

                "team_added",
                "team_removed",

                "system",
            ],
            required: [true, "Notification type is required"],
            index: true,
        },

        // Notification title
        title: {
            type: String,
            required: [true, "Notification title is required"],
            trim: true,
            maxlength: 200,
        },

        // Notification message
        message: {
            type: String,
            required: [true, "Notification message is required"],
            trim: true,
            maxlength: 1000,
        },

        // Extra information
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // Read/unread status
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },

        // When notification was read
        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// INDEXES

// Quickly find unread notifications for a user
auctionNotificationSchema.index({
    recipient: 1,
    isRead: 1,
    createdAt: -1,
});

// Quickly find all notifications of an auction for a user
auctionNotificationSchema.index({
    auction: 1,
    recipient: 1,
    createdAt: -1,
});

// MODEL

module.exports = mongoose.model(
    "AuctionNotification",
    auctionNotificationSchema
);