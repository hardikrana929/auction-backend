const Auction = require("../models/Auction");
const Team = require("../models/Team");
const Player = require("../models/Player");
const AuctionRegistration = require("../models/AuctionRegistration");
const AuctionSession = require("../models/AuctionSession");

// VALIDATE AUCTION BEFORE START
// GET /api/auction-validation/start/:auctionId
const validateAuctionStart = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const errors = [];
        const warnings = [];

        // Auction status
        if (!["draft", "upcoming"].includes(auction.status)) {
            errors.push(
                `Auction cannot be started because its status is "${auction.status}"`
            );
        }

        // Players
        const totalPlayers = await Player.countDocuments({
            auction: auctionId,
        });

        if (totalPlayers === 0) {
            errors.push("Auction must have at least one player");
        }

        // Approved registrations
        const approvedRegistrations =
            await AuctionRegistration.countDocuments({
                auction: auctionId,
                status: "approved",
            });

        if (approvedRegistrations < 2) {
            errors.push(
                "At least 2 approved teams are required to start the auction"
            );
        }

        if (approvedRegistrations > auction.maxTeams) {
            errors.push(
                `Approved teams exceed maximum limit of ${auction.maxTeams}`
            );
        }

        // Check teams
        const teams = await Team.find({
            auction: auctionId,
            status: "active",
        });

        if (teams.length < 2) {
            errors.push("At least 2 active teams are required");
        }

        // Check minimum bid
        if (auction.minimumBid <= 0) {
            warnings.push("Minimum bid is zero");
        }

        // Check player base prices
        const playersWithoutValidPrice =
            await Player.countDocuments({
                auction: auctionId,
                basePrice: { $lte: 0 },
            });

        if (playersWithoutValidPrice > 0) {
            errors.push(
                `${playersWithoutValidPrice} player(s) have an invalid base price`
            );
        }

        // Existing session
        const session = await AuctionSession.findOne({
            auction: auctionId,
        });

        if (session && session.status !== "not_started") {
            warnings.push(
                `Auction session already exists with status "${session.status}"`
            );
        }

        const isValid = errors.length === 0;

        return res.status(200).json({
            success: true,
            valid: isValid,
            message: isValid
                ? "Auction is ready to start"
                : "Auction is not ready to start",
            validation: {
                auctionId,
                auctionName: auction.name,
                status: auction.status,
                totalPlayers,
                activeTeams: teams.length,
                approvedTeams: approvedRegistrations,
                maxTeams: auction.maxTeams,
                errors,
                warnings,
            },
        });
    } catch (error) {
        console.error("Validate Auction Start Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to validate auction",
            error: error.message,
        });
    }
};


// VALIDATE PLAYER AUCTION
// GET /api/auction-validation/player/:playerId
const validatePlayerAuction = async (req, res) => {
    try {
        const { playerId } = req.params;

        const player = await Player.findById(playerId).populate(
            "auction"
        );

        if (!player) {
            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        const errors = [];
        const warnings = [];

        // Player status
        if (player.status === "sold") {
            errors.push("Player has already been sold");
        }

        if (player.status === "auctioning") {
            errors.push("Player is already being auctioned");
        }

        if (player.status === "unsold") {
            warnings.push("Player was previously marked as unsold");
        }

        // Base price
        if (!player.basePrice || player.basePrice <= 0) {
            errors.push("Player has an invalid base price");
        }

        // Auction status
        if (player.auction && !["draft", "upcoming", "live"].includes(player.auction.status)) {
            errors.push(
                `Auction is currently "${player.auction.status}"`
            );
        }

        // Check if another player is already auctioning
        if (player.auction) {
            const anotherPlayer = await Player.findOne({
                auction: player.auction._id,
                status: "auctioning",
                _id: { $ne: player._id },
            });

            if (anotherPlayer) {
                errors.push(
                    `Another player (${anotherPlayer.fullName}) is already being auctioned`
                );
            }
        }

        return res.status(200).json({
            success: true,
            valid: errors.length === 0,
            player: {
                id: player._id,
                name: player.fullName,
                role: player.role,
                basePrice: player.basePrice,
                status: player.status,
            },
            errors,
            warnings,
        });
    } catch (error) {
        console.error("Validate Player Auction Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to validate player auction",
            error: error.message,
        });
    }
};


// VALIDATE BID
// POST /api/auction-validation/bid
const validateBid = async (req, res) => {
    try {
        const { auctionId, playerId, teamId, bidAmount } =
            req.body;

        if (
            !auctionId ||
            !playerId ||
            !teamId ||
            bidAmount === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId, playerId, teamId and bidAmount are required",
            });
        }

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const player = await Player.findOne({
            _id: playerId,
            auction: auctionId,
        });

        if (!player) {
            return res.status(404).json({
                success: false,
                message: "Player not found in this auction",
            });
        }

        const team = await Team.findOne({
            _id: teamId,
            auction: auctionId,
            status: "active",
        });

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Active team not found in this auction",
            });
        }

        const errors = [];

        // Player must be auctioning
        if (player.status !== "auctioning") {
            errors.push(
                `Player cannot receive bids because status is "${player.status}"`
            );
        }

        // Auction must be live
        if (auction.status !== "live") {
            errors.push(
                `Auction is not live. Current status: "${auction.status}"`
            );
        }

        // Check registration
        const registration =
            await AuctionRegistration.findOne({
                auction: auctionId,
                team: teamId,
                status: "approved",
            });

        if (!registration) {
            errors.push(
                "Team is not approved for this auction"
            );
        }

        // Calculate minimum valid bid
        let minimumRequiredBid = player.basePrice;

        if (player.currentBid > 0) {
            minimumRequiredBid =
                player.currentBid + auction.bidIncrement;
        } else if (auction.minimumBid > player.basePrice) {
            minimumRequiredBid = auction.minimumBid;
        }

        // Bid amount
        if (Number(bidAmount) < minimumRequiredBid) {
            errors.push(
                `Minimum valid bid is ${minimumRequiredBid}`
            );
        }

        // Budget
        if (Number(bidAmount) > team.remainingBudget) {
            errors.push(
                `Insufficient budget. Remaining budget: ${team.remainingBudget}`
            );
        }

        // Team player limit
        if (team.players.length >= auction.maxPlayersPerTeam) {
            errors.push(
                `Team has reached maximum player limit of ${auction.maxPlayersPerTeam}`
            );
        }

        return res.status(200).json({
            success: true,
            valid: errors.length === 0,
            validation: {
                auctionId,
                playerId,
                teamId,
                requestedBid: Number(bidAmount),
                currentBid: player.currentBid,
                minimumRequiredBid,
                remainingBudget: team.remainingBudget,
                playersInTeam: team.players.length,
                maxPlayersPerTeam:
                    auction.maxPlayersPerTeam,
            },
            errors,
        });
    } catch (error) {
        console.error("Validate Bid Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to validate bid",
            error: error.message,
        });
    }
};


// VALIDATE TEAM PURCHASE
// GET /api/auction-validation/team/:teamId/player/:playerId
const validateTeamPurchase = async (req, res) => {
    try {
        const { teamId, playerId } = req.params;

        const team = await Team.findById(teamId).populate("auction");

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        const player = await Player.findById(playerId);

        if (!player) {
            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        const errors = [];

        if (player.auction.toString() !== team.auction._id.toString()) {
            errors.push(
                "Player and team belong to different auctions"
            );
        }

        if (player.status !== "auctioning") {
            errors.push(
                "Player is not currently being auctioned"
            );
        }

        if (team.players.length >= team.auction.maxPlayersPerTeam) {
            errors.push(
                `Team has reached maximum player limit of ${team.auction.maxPlayersPerTeam}`
            );
        }

        if (player.currentBidder && player.currentBidder.toString() !== team._id.toString()) {
            errors.push(
                "Team is not the current highest bidder"
            );
        }

        const requiredAmount =
            player.currentBid > 0
                ? player.currentBid
                : player.basePrice;

        if (requiredAmount > team.remainingBudget) {
            errors.push(
                "Team does not have enough remaining budget"
            );
        }

        return res.status(200).json({
            success: true,
            valid: errors.length === 0,
            validation: {
                teamId,
                playerId,
                requiredAmount,
                remainingBudget: team.remainingBudget,
                currentBid: player.currentBid,
                playersInTeam: team.players.length,
                maxPlayersPerTeam:
                    team.auction.maxPlayersPerTeam,
            },
            errors,
        });
    } catch (error) {
        console.error("Validate Team Purchase Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to validate team purchase",
            error: error.message,
        });
    }
};


// VALIDATE AUCTION COMPLETION
// GET /api/auction-validation/completion/:auctionId
const validateAuctionCompletion = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const errors = [];
        const warnings = [];

        const unfinishedPlayers =
            await Player.countDocuments({
                auction: auctionId,
                status: {
                    $in: ["available", "auctioning"],
                },
            });

        const auctioningPlayers =
            await Player.countDocuments({
                auction: auctionId,
                status: "auctioning",
            });

        if (unfinishedPlayers > 0) {
            errors.push(
                `${unfinishedPlayers} player(s) have not completed the auction`
            );
        }

        if (auctioningPlayers > 0) {
            errors.push(
                "A player is still being auctioned"
            );
        }

        if (auction.status === "completed") {
            warnings.push("Auction is already completed");
        }

        return res.status(200).json({
            success: true,
            valid: errors.length === 0,
            validation: {
                auctionId,
                auctionStatus: auction.status,
                unfinishedPlayers,
                auctioningPlayers,
                errors,
                warnings,
            },
        });
    } catch (error) {
        console.error(
            "Validate Auction Completion Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to validate auction completion",
            error: error.message,
        });
    }
};


module.exports = {
    validateAuctionStart,
    validatePlayerAuction,
    validateBid,
    validateTeamPurchase,
    validateAuctionCompletion,
};