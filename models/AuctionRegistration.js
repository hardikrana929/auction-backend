const mongoose = require("mongoose");

const auctionRegistrationSchema = new mongoose.Schema(
    {
        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: [true, "Auction is required"],
            index: true,
        },

        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            required: [true, "Team is required"],
            index: true,
        },

        registeredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Registered by user is required"],
        },

        status: {
            type: String,
            enum: [
                "pending",
                "approved",
                "rejected",
                "cancelled",
            ],
            default: "pending",
            index: true,
        },

        registeredAt: {
            type: Date,
            default: Date.now,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);


// Prevent the same team from having
// multiple registrations for the same auction.

auctionRegistrationSchema.index(
    {
        auction: 1,
        team: 1,
    },
    {
        unique: true,
    }
);


module.exports = mongoose.model(
    "AuctionRegistration",
    auctionRegistrationSchema
);