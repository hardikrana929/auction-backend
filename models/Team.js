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
            type: String,
            default: "",
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
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Team", teamSchema);