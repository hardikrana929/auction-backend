const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
    {
        // AUCTION

        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: [true, "Auction is required"],
        },

        // PERSONAL INFORMATION

        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            maxlength: 100,
        },

        lastName: {
            type: String,
            required: [true, "Last name is required"],
            trim: true,
            maxlength: 100,
        },

        photo: {
            type: String,
            default: "",
        },

        contactNo: {
            type: String,
            trim: true,
            default: "",
        },

        whatsappNo: {
            type: String,
            trim: true,
            default: "",
        },

        villageTown: {
            type: String,
            required: [true, "Village/Town is required"],
            trim: true,
        },

        // CRICKET INFORMATION

        age: {
            type: Number,
            min: 10,
            max: 60,
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
            default: "Male",
        },

        role: {
            type: String,
            enum: [
                "Batsman",
                "Bowler",
                "All Rounder",
                "Wicket Keeper",
            ],
            required: [true, "Player role is required"],
        },

        battingHand: {
            type: String,
            enum: [
                "Right Hand",
                "Left Hand",
                "Not Applicable",
            ],
            default: "Right Hand",
        },

        bowlingStyle: {
            type: String,
            enum: [

                "Right Arm Fast",
                "Right Arm Medium",
                "Left Arm Fast",
                "Left Arm Medium",
                "Right Arm Off Spin",
                "Right Arm Leg Spin",
                "Left Arm Orthodox",
                "Left Arm Chinaman",
                "Does Not Bowl",
            ],
            default: "Does Not Bowl",
        },

        specialization: [
            {
                type: String,
                trim: true,
            },
        ],

        experience: {
            type: Number,
            min: 0,
            default: 0,
        },

        bio: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },


        // AUCTION INFORMATION

        basePrice: {
            type: Number,
            required: [true, "Base price is required"],
            min: [0, "Base price cannot be negative"],
        },

        currentBid: {
            type: Number,
            default: 0,
            min: 0,
        },

        currentBidder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            default: null,
        },

        status: {
            type: String,
            enum: [
                "available",
                "auctioning",
                "sold",
                "unsold",
            ],
            default: "available",
        },

        soldTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            default: null,
        },

        soldPrice: {
            type: Number,
            default: 0,
            min: 0,
        },

        auctionOrder: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

playerSchema.index(
    { auction: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "auctioning",
        },
    }
);

module.exports = mongoose.model("Player", playerSchema);