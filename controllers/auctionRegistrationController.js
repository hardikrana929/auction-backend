const AuctionRegistration = require("../models/AuctionRegistration");
const Auction = require("../models/Auction");
const Team = require("../models/Team");
const withTransaction = require("../utils/withTransaction");

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

        if (
            req.user.role !== "admin" &&
            team.owner.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to register this team",
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

        // Use registration records as the source of truth; the cached count can
        // be stale for auctions created before this counter was introduced.
        const actualApprovedTeamsCount = await AuctionRegistration.countDocuments({
            auction: auctionId,
            status: "approved",
        });

        if (actualApprovedTeamsCount >= Number(auction.maxTeams)) {
            if (Number(auction.approvedTeamsCount || 0) !== actualApprovedTeamsCount) {
                await Auction.updateOne(
                    { _id: auctionId },
                    { $set: { approvedTeamsCount: actualApprovedTeamsCount } }
                );
            }
            return res.status(409).json({
                success: false,
                code: "AUCTION_TEAM_LIMIT_REACHED",
                message: `This auction is full (${actualApprovedTeamsCount}/${auction.maxTeams} teams approved). No additional team applications can be submitted.`,
                maxTeams: auction.maxTeams,
                approvedTeamsCount: actualApprovedTeamsCount,
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
        });
    }
};

// APPROVE TEAM REGISTRATION
// PUT /api/auction-registration/:registrationId/approve
// ADMIN ONLY
const approveRegistration = async (req, res) => {
    try {
        const { registrationId } = req.params;

        const result = await withTransaction(async (session) => {
            const registration = await AuctionRegistration.findById(registrationId)
                .populate("auction")
                .session(session);

            if (!registration) {
                const err = new Error("Registration not found");
                err.statusCode = 404;
                throw err;
            }

            if (registration.status !== "pending") {
                const err = new Error(`Registration is already ${registration.status}`);
                err.statusCode = 400;
                throw err;
            }

            const auction = registration.auction;

            if (!["draft", "upcoming"].includes(auction.status)) {
                const err = new Error("Cannot approve registration after auction has started");
                err.statusCode = 400;
                throw err;
            }

            // Reconcile a potentially stale cached counter against the approved
            // registration records in this transaction before claiming a slot.
            const actualApprovedTeamsCount = await AuctionRegistration.countDocuments({
                auction: auction._id,
                status: "approved",
            }).session(session);

            await Auction.updateOne(
                { _id: auction._id },
                { $set: { approvedTeamsCount: actualApprovedTeamsCount } },
                { session }
            );

            // The conditional write is the atomic capacity check. Concurrent
            // approvals contend on the same Auction document and retry safely.
            const claimed = await Auction.findOneAndUpdate(
                {
                    _id: auction._id,
                    $expr: { $lt: ["$approvedTeamsCount", "$maxTeams"] },
                },
                { $inc: { approvedTeamsCount: 1 } },
                { session, new: true }
            );

            if (!claimed) {
                const err = new Error(`Maximum team limit reached. Maximum teams: ${auction.maxTeams}`);
                err.statusCode = 400;
                throw err;
            }

            registration.status = "approved";
            registration.approvedAt = new Date();
            registration.approvedBy = req.user._id;

            await registration.save({ session });

            return registration;
        });

        return res.status(200).json({
            success: true,
            message: "Team registration approved successfully",
            registration: result,
        });
    } catch (error) {
        console.error("Approve Registration Error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Failed to approve registration",
        });
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
            // Do not expose internal error details in API responses.
        });
    }
};

// CANCEL TEAM REGISTRATION
// PUT /api/auction-registration/:registrationId/cancel
const cancelRegistration = async (req, res) => {
    try {
        const { registrationId } = req.params;

        const result = await withTransaction(async (session) => {
            const registration = await AuctionRegistration.findById(registrationId).session(session);

            if (!registration) {
                const err = new Error("Registration not found");
                err.statusCode = 404;
                throw err;
            }

            if (registration.registeredBy.toString() !== req.user._id.toString()) {
                const err = new Error("You are not allowed to cancel this registration");
                err.statusCode = 403;
                throw err;
            }

            if (!["pending", "approved"].includes(registration.status)) {
                const err = new Error(`Cannot cancel registration with status ${registration.status}`);
                err.statusCode = 400;
                throw err;
            }

            // Free up the team slot this registration was holding.
            // Only decrement if it had actually consumed one (i.e. it was
            // approved) — a still-pending registration never incremented
            // approvedTeamsCount in the first place.
            if (registration.status === "approved") {
                await Auction.findByIdAndUpdate(
                    registration.auction,
                    { $inc: { approvedTeamsCount: -1 } },
                    { session }
                );
            }

            registration.status = "cancelled";
            registration.cancelledAt = new Date();

            await registration.save({ session });

            return registration;
        });

        return res.status(200).json({
            success: true,
            message: "Auction registration cancelled",
            registration: result,
        });
    } catch (error) {
        console.error("Cancel Registration Error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "Failed to cancel registration",
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

        // Always show submitted applications to admins. A full auction blocks
        // further approvals, but must not hide existing pending applications.
        const effectiveFilter = filter;
        const actualApprovedTeamsCount = await AuctionRegistration.countDocuments({
            auction: auctionId,
            status: "approved",
        });
        if (Number(auction.approvedTeamsCount || 0) !== actualApprovedTeamsCount) {
            await Auction.updateOne(
                { _id: auctionId },
                { $set: { approvedTeamsCount: actualApprovedTeamsCount } }
            );
        }

        const pageNumber = Math.max(Number(page), 1);
        const limitNumber = Math.min(Math.max(Number(limit), 1), 100);

        const skip = (pageNumber - 1) * limitNumber;

        const [registrations, total] = await Promise.all([
            AuctionRegistration.find(effectiveFilter)
                .populate(
                    { path: "team", select: "name logo ownerName totalBudget remainingBudget status owner", populate: { path: "owner", select: "name email" } }
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

            AuctionRegistration.countDocuments(effectiveFilter),
        ]);

        return res.status(200).json({
            success: true,
            count: registrations.length,
            total,
            page: pageNumber,
            pages: Math.ceil(total / limitNumber),
            maxTeams: auction.maxTeams,
            approvedTeamsCount: actualApprovedTeamsCount,
            isFull: actualApprovedTeamsCount >= Number(auction.maxTeams),
            registrations,
        });
    } catch (error) {
        console.error("Get Auction Registrations Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get auction registrations",
            // Do not expose internal error details in API responses.
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
            // Do not expose internal error details in API responses.
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
            // Do not expose internal error details in API responses.
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