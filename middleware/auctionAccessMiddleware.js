const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const Team = require("../models/Team");
const AuctionRegistration = require("../models/AuctionRegistration");

// Validate Auction ID
const validateAuctionId = async (req, res, next) => {
    try {
        const { auctionId } = req.params;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(auctionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        req.auction = auction;

        next();
    } catch (error) {
        console.error("Validate Auction ID Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Check Auction Admin / Creator
const auctionAdminOnly = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        if (!req.auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not loaded",
            });
        }

        const isAdmin = req.user.role === "admin";

        const isCreator =
            req.auction.createdBy &&
            req.auction.createdBy.toString() ===
            req.user._id.toString();

        if (!isAdmin && !isCreator) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to manage this auction",
            });
        }

        next();
    } catch (error) {
        console.error("Auction Admin Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Check Team belongs to Auction
const validateTeamAccess = async (req, res, next) => {
    try {
        const { teamId } = req.params;

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: "Team ID is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(teamId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findById(teamId);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        if (req.auction && team.auction.toString() !== req.auction._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "This team does not belong to this auction",
            });
        }

        if (team.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "This team is inactive",
            });
        }

        req.team = team;

        next();
    } catch (error) {
        console.error("Team Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Check Approved Registration
const approvedTeamOnly = async (req, res, next) => {
    try {
        if (!req.auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not loaded",
            });
        }

        if (!req.team) {
            return res.status(404).json({
                success: false,
                message: "Team not loaded",
            });
        }

        const registration =
            await AuctionRegistration.findOne({
                auction: req.auction._id,
                team: req.team._id,
                status: "approved",
            });

        if (!registration) {
            return res.status(403).json({
                success: false,
                message: "This team is not approved to participate in the auction",
            });
        }

        req.registration = registration;

        next();
    } catch (error) {
        console.error("Approved Team Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Check Auction is Live
const liveAuctionOnly = async (req, res, next) => {
    try {
        if (!req.auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not loaded",
            });
        }

        if (req.auction.status !== "live") {
            return res.status(403).json({
                success: false,
                message: "Auction is not currently live",
            });
        }

        next();
    } catch (error) {
        console.error("Live Auction Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    validateAuctionId,
    auctionAdminOnly,
    validateTeamAccess,
    approvedTeamOnly,
    liveAuctionOnly,
};