const AuctionRegistration = require("../models/AuctionRegistration");
const Auction = require("../models/Auction");
const Team = require("../models/Team");

// REGISTER TEAM FOR AUCTION
// POST /api/auction-registration/register
const registerTeam = async (req, res) => {
    try {
        const { auctionId, teamId } = req.body;

        if (!auctionId || !teamId) {
            return res.status(400).json({
                success: false,
                message: "auctionId and teamId are required",
            });
        }

        // Find auction
        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Registration allowed only before auction starts
        if (!["draft", "upcoming"].includes(auction.status)) {
            return res.status(400).json({
                success: false,
                message: "Registration is closed for this auction",
            });
        }

        // Find team and make sure team belongs to this auction
        const team = await Team.findOne({
            _id: teamId,
            auction: auctionId,
        });

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found for this auction",
            });
        }

        if (team.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Inactive team cannot register",
            });
        }

        // Check existing registration
        let registration = await AuctionRegistration.findOne({
            auction: auctionId,
            team: teamId,
        });

        // Already pending or approved
        if (
            registration &&
            ["pending", "approved"].includes(registration.status)
        ) {
            return res.status(400).json({
                success: false,
                message: `Team is already ${registration.status}`,
                registration,
            });
        }

        // If previously rejected/cancelled, reuse registration
        if (registration) {
            registration.status = "pending";
            registration.registeredBy = req.user._id;
            registration.registeredAt = new Date();

            registration.approvedAt = null;
            registration.rejectedAt = null;
            registration.cancelledAt = null;

            registration.approvedBy = null;
            registration.rejectedBy = null;
            registration.rejectionReason = "";

            await registration.save();
        } else {
            registration = await AuctionRegistration.create({
                auction: auctionId,
                team: teamId,
                registeredBy: req.user._id,
                status: "pending",
            });
        }

        return res.status(201).json({
            success: true,
            message: "Team registered successfully. Waiting for admin approval.",
            registration,
        });
    } catch (error) {
        console.error("Register Team Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to register team",
            error: error.message,
        });
    }
};

// APPROVE TEAM REGISTRATION
// PUT /api/auction-registration/:registrationId/approve
// ADMIN ONLY
const approveRegistration = async (req, res) => {
    const session = await AuctionRegistration.startSession();

    try {
        session.startTransaction();

        const { registrationId } = req.params;

        const registration = await AuctionRegistration.findById(
            registrationId
        )
            .populate("auction")
            .session(session);

        if (!registration) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Registration not found",
            });
        }

        if (registration.status !== "pending") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message: `Registration is already ${registration.status}`,
            });
        }

        const auction = registration.auction;

        // Auction must not have started
        if (!["draft", "upcoming"].includes(auction.status)) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message: "Cannot approve registration after auction has started",
            });
        }

        // Count approved teams
        const approvedCount = await AuctionRegistration.countDocuments({
            auction: auction._id,
            status: "approved",
        }).session(session);

        if (approvedCount >= auction.maxTeams) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message: `Maximum team limit reached. Maximum teams: ${auction.maxTeams}`,
            });
        }

        registration.status = "approved";
        registration.approvedAt = new Date();
        registration.approvedBy = req.user._id;

        await registration.save({ session });

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Team registration approved successfully",
            registration,
        });
    } catch (error) {
        await session.abortTransaction();

        console.error("Approve Registration Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to approve registration",
            error: error.message,
        });
    } finally {
        session.endSession();
    }
};

// REJECT TEAM REGISTRATION
// PUT /api/auction-registration/:registrationId/reject
// ADMIN ONLY
const rejectRegistration = async (req, res) => {
    try {
        const { registrationId } = req.params;
        const { rejectionReason } = req.body;

        const registration = await AuctionRegistration.findById(
            registrationId
        );

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: "Registration not found",
            });
        }

        if (registration.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Registration is already ${registration.status}`,
            });
        }

        registration.status = "rejected";
        registration.rejectedAt = new Date();
        registration.rejectedBy = req.user._id;
        registration.rejectionReason = rejectionReason || "";

        await registration.save();

        return res.status(200).json({
            success: true,
            message: "Team registration rejected",
            registration,
        });
    } catch (error) {
        console.error("Reject Registration Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to reject registration",
            error: error.message,
        });
    }
};

// CANCEL TEAM REGISTRATION
// PUT /api/auction-registration/:registrationId/cancel
const cancelRegistration = async (req, res) => {
    try {
        const { registrationId } = req.params;

        const registration = await AuctionRegistration.findById(
            registrationId
        );

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: "Registration not found",
            });
        }

        // Only person who registered the team can cancel it
        if (
            registration.registeredBy.toString() !==
            req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to cancel this registration",
            });
        }

        if (!["pending", "approved"].includes(registration.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel registration with status ${registration.status}`,
            });
        }

        registration.status = "cancelled";
        registration.cancelledAt = new Date();

        await registration.save();

        return res.status(200).json({
            success: true,
            message: "Auction registration cancelled",
            registration,
        });
    } catch (error) {
        console.error("Cancel Registration Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to cancel registration",
            error: error.message,
        });
    }
};

// GET ALL REGISTRATIONS FOR AUCTION
// GET /api/auction-registration/:auctionId
const getAuctionRegistrations = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const {
            status,
            page = 1,
            limit = 10,
        } = req.query;

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const filter = {
            auction: auctionId,
        };

        if (status) {
            filter.status = status;
        }

        const pageNumber = Math.max(Number(page), 1);
        const limitNumber = Math.min(Math.max(Number(limit), 1), 100);

        const skip = (pageNumber - 1) * limitNumber;

        const [registrations, total] = await Promise.all([
            AuctionRegistration.find(filter)
                .populate(
                    "team",
                    "name logo ownerName totalBudget remainingBudget status"
                )
                .populate(
                    "registeredBy",
                    "name email role"
                )
                .populate(
                    "approvedBy",
                    "name email"
                )
                .populate(
                    "rejectedBy",
                    "name email"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNumber),

            AuctionRegistration.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            count: registrations.length,
            total,
            page: pageNumber,
            pages: Math.ceil(total / limitNumber),
            registrations,
        });
    } catch (error) {
        console.error("Get Auction Registrations Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get auction registrations",
            error: error.message,
        });
    }
};

// GET SINGLE REGISTRATION
// GET /api/auction-registration/detail/:registrationId
const getRegistrationById = async (req, res) => {
    try {
        const { registrationId } = req.params;

        const registration = await AuctionRegistration.findById(
            registrationId
        )
            .populate("auction")
            .populate("team")
            .populate("registeredBy", "name email role")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email");

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: "Registration not found",
            });
        }

        return res.status(200).json({
            success: true,
            registration,
        });
    } catch (error) {
        console.error("Get Registration Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get registration",
            error: error.message,
        });
    }
};

// CHECK TEAM REGISTRATION STATUS
// GET /api/auction-registration/status/:auctionId/:teamId
const getRegistrationStatus = async (req, res) => {
    try {
        const { auctionId, teamId } = req.params;

        const registration = await AuctionRegistration.findOne({
            auction: auctionId,
            team: teamId,
        })
            .populate("team", "name logo ownerName status")
            .populate("auction", "name status maxTeams");

        if (!registration) {
            return res.status(200).json({
                success: true,
                registered: false,
                message: "Team is not registered for this auction",
            });
        }

        return res.status(200).json({
            success: true,
            registered: true,
            status: registration.status,
            registration,
        });
    } catch (error) {
        console.error("Get Registration Status Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get registration status",
            error: error.message,
        });
    }
};


module.exports = {
    registerTeam,
    approveRegistration,
    rejectRegistration,
    cancelRegistration,
    getAuctionRegistrations,
    getRegistrationById,
    getRegistrationStatus,
};