const mongoose = require("mongoose");

const auctionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Auction name is required"],
            trim: true,
            maxlength: 100,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 500,
        },

        image: {
            type: String,
            default: "",
        },

        date: {
            type: Date,
            required: [true, "Auction date is required"],
        },

        startingBudget: {
            type: Number,
            required: [true, "Starting budget is required"],
            min: [0, "Budget cannot be negative"],
        },

        minimumBid: {
            type: Number,
            required: [true, "Minimum bid is required"],
            min: [0, "Minimum bid cannot be negative"],
        },

        bidIncrement: {
            type: Number,
            required: [true, "Bid increment is required"],
            min: [1, "Bid increment must be at least 1"],
        },

        maxTeams: {
            type: Number,
            required: [true, "Maximum teams are required"],
            min: [2, "Auction must have at least 2 teams"],
        },

        maxPlayersPerTeam: {
            type: Number,
            required: [true, "Maximum players per team are required"],
            min: [1, "Players per team must be at least 1"],
        },

        status: {
            type: String,
            enum: ["draft", "upcoming", "live", "completed", "cancelled"],
            default: "draft",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Auction", auctionSchema);