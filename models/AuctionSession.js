const mongoose = require("mongoose");

const auctionSessionSchema = new mongoose.Schema(
    {
        // AUCTION

        auction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auction",
            required: [true, "Auction is required"],
            unique: true,
            index: true,
        },

        // CURRENT PLAYER

        currentPlayer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Player",
            default: null,
        },

        // CURRENT PLAYER INDEX

        currentPlayerIndex: {
            type: Number,
            default: -1,
            min: -1,
        },

        // AUCTION STATUS

        status: {
            type: String,
            enum: [
                "not_started",
                "live",
                "paused",
                "player_auction",
                "player_sold",
                "player_unsold",
                "completed",
            ],
            default: "not_started",
            index: true,
        },

        // PAUSE STATE

        isPaused: {
            type: Boolean,
            default: false,
        },

        // TIMING

        startedAt: {
            type: Date,
            default: null,
        },

        pausedAt: {
            type: Date,
            default: null,
        },

        resumedAt: {
            type: Date,
            default: null,
        },

        completedAt: {
            type: Date,
            default: null,
        },

        // AUCTION STATISTICS

        totalPlayers: {
            type: Number,
            default: 0,
            min: 0,
        },

        playersCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        playersSold: {
            type: Number,
            default: 0,
            min: 0,
        },

        playersUnsold: {
            type: Number,
            default: 0,
            min: 0,
        },

        // LAST ACTION

        lastAction: {
            type: String,
            enum: [
                "auction_started",
                "player_started",
                "bid_placed",
                "player_sold",
                "player_unsold",
                "auction_paused",
                "auction_resumed",
                "next_player",
                "auction_completed",
            ],
            default: null,
        },

        lastActionAt: {
            type: Date,
            default: null,
        },

        // WHO IS CONTROLLING AUCTION

        controlledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);


// VALIDATION

// Current player should exist when auction is
// in a player-related state.

auctionSessionSchema.pre("validate", function () {
    const playerRequiredStatuses = [
        "player_auction",
        "player_sold",
        "player_unsold",
    ];

    if (
        playerRequiredStatuses.includes(this.status) &&
        !this.currentPlayer
    ) {
        throw new Error(
            "Current player is required for this auction status"
        );
    }
});

module.exports = mongoose.model(
    "AuctionSession",
    auctionSessionSchema
);