const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
    {
        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: [true, "Auction is required"],
        },

        name: {
            type: String,
            required: [true, "Team name is required"],
            trim: true,
            maxlength: 100,
        },

        logo: {
            url: {
                type: String,
                default: "",
            },
            publicId: {
                type: String,
                default: "",
            },
        },

        ownerName: {
            type: String,
            required: [true, "Owner name is required"],
            trim: true,
            maxlength: 100,
        },

        totalBudget: {
            type: Number,
            required: true,
            min: 0,
        },

        remainingBudget: {
            type: Number,
            required: true,
            min: 0,
        },

        players: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Player",
            },
        ],

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// The application-level findOne() duplicate-name check in
// teamController.createTeam is race-prone on its own (two concurrent
// requests can both pass it). This index makes MongoDB itself the
// source of truth and backs the error.code === 11000 handling that
// teamController.js already expects to exist.
teamSchema.index({ auction: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Team", teamSchema);