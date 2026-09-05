const Auction = require("../models/Auction");
const Team = require("../models/Team");
const AuctionRegistration = require("../models/AuctionRegistration");

// Check Auction Access
const checkAuctionAccess = async (req, res) => {
    try {
        const auction = req.auction;
        const isAdmin = req.user.role === "admin";

        const isCreator =
            auction.createdBy &&
            auction.createdBy.toString() ===
            req.user._id.toString();

        const registrations =
            await AuctionRegistration.find({
                auction: auction._id,
                registeredBy: req.user._id,
            }).populate("team", "name logo status");

        return res.status(200).json({
            success: true,
            message: "Auction access checked successfully",
            data: {
                auction: {
                    id: auction._id,
                    name: auction.name,
                    status: auction.status,
                },
                user: {
                    id: req.user._id,
                    role: req.user.role,
                },
                access: {
                    isAdmin,
                    isCreator,
                    canManageAuction:
                        isAdmin || isCreator,
                },
                registrations,
            },
        });
    } catch (error) {
        console.error("Check Auction Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Check Team Access
const checkTeamAccess = async (req, res) => {
    try {
        const auction = req.auction;
        const team = req.team;

        const registration =
            await AuctionRegistration.findOne({
                auction: auction._id,
                team: team._id,
            });

        const isApproved = registration?.status === "approved";

        return res.status(200).json({
            success: true,
            message: "Team access checked successfully",
            data: {
                auction: {
                    id: auction._id,
                    name: auction.name,
                    status: auction.status,
                },
                team: {
                    id: team._id,
                    name: team.name,
                    status: team.status,
                },
                registration: registration
                    ? {
                        id: registration._id,
                        status: registration.status,
                        registeredAt:
                            registration.registeredAt,
                        approvedAt:
                            registration.approvedAt,
                    }
                    : null,
                access: {
                    belongsToAuction:
                        team.auction.toString() ===
                        auction._id.toString(),

                    isActive: team.status === "active",

                    isApproved,

                    canParticipate:
                        team.status === "active" &&
                        isApproved &&
                        auction.status !== "completed" &&
                        auction.status !== "cancelled",
                },
            },
        });
    } catch (error) {
        console.error("Check Team Access Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

// Get Auction Participants
const getAuctionParticipants = async (req, res) => {
    try {
        const registrations =
            await AuctionRegistration.find({
                auction: req.auction._id,
                status: "approved",
            }).populate(
                "team",
                "name logo ownerName totalBudget remainingBudget players status"
            ).populate(
                "registeredBy",
                "name email role"
            ).sort({ approvedAt: 1 });

        return res.status(200).json({
            success: true,
            count: registrations.length,
            data: registrations,
        });
    } catch (error) {
        console.error(
            "Get Auction Participants Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

module.exports = {
    checkAuctionAccess,
    checkTeamAccess,
    getAuctionParticipants,
};