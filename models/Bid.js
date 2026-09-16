const mongoose = require("mongoose");

const bidSchema = new mongoose.Schema(
    {
        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: true,
            index: true,
        },

        player: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Player",
            required: true,
            index: true,
        },

        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            required: true,
            index: true,
        },

        bidder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        status: {
            type: String,
            enum: ["active", "winning", "lost", "sold", "unsold"],
            default: "active",
        },
    },
    {
        timestamps: true,
    }
);

bidSchema.index({ auction: 1, player: 1, createdAt: -1 });
bidSchema.index({ auction: 1, team: 1, createdAt: -1 });

module.exports = mongoose.model("Bid", bidSchema);

