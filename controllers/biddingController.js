const mongoose = require("mongoose");

const Player = require("../models/Player");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const AuctionTransaction = require("../models/AuctionTransaction");

// START PLAYER AUCTION

const startPlayerAuction = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({
                success: false,
                message: "Player ID is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(playerId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid player ID",
            });
        }

        session.startTransaction();

        const player = await Player.findById(playerId)
            .session(session);

        if (!player) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        const auction = await Auction.findById(
            player.auction
        ).session(session);

        if (!auction) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Auction must be live

        if (auction.status !== "live") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player can only be started during a live auction",
            });
        }

        // Player must be available

        if (player.status !== "available") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    `Player is currently ${player.status}`,
            });
        }

        // Check if another player is already auctioning

        const currentPlayer = await Player.findOne({
            auction: auction._id,
            status: "auctioning",
            _id: { $ne: player._id },
        }).session(session);

        if (currentPlayer) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Another player is currently being auctioned",
                player: currentPlayer,
            });
        }

        // Initialize auction values

        player.status = "auctioning";

        player.currentBid = player.basePrice;

        player.currentBidder = null;

        player.soldTo = null;

        player.soldPrice = 0;

        await player.save({ session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Player auction started",
            player,
        });

    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Start Player Auction Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while starting player auction",
        });

    } finally {
        session.endSession();
    }
};

// PLACE BID

const placeBid = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            playerId,
            teamId,
        } = req.body;

        // Validate request

        if (!playerId || !teamId) {
            return res.status(400).json({
                success: false,
                message:
                    "Player ID and Team ID are required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(playerId) || !mongoose.Types.ObjectId.isValid(teamId)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid player ID or team ID",
            });
        }

        session.startTransaction();

        // Get Player

        const player = await Player.findById(playerId)
            .session(session);

        if (!player) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        // Player must be auctioning

        if (player.status !== "auctioning") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player is not currently available for bidding",
            });
        }

        // Get Auction

        const auction = await Auction.findById(
            player.auction
        ).session(session);

        if (!auction) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Auction must be LIVE

        if (auction.status !== "live") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Bidding is only allowed during a live auction",
            });
        }

        // Get Team

        const team = await Team.findById(teamId)
            .session(session);

        if (!team) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        // Team must belong to same auction

        if (team.auction.toString() !== auction._id.toString()) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Team does not belong to this auction",
            });
        }

        // Team must be active

        if (team.status !== "active") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message: "Team is inactive",
            });
        }

        // Maximum players

        const maxPlayers =
            auction.maxPlayersPerTeam;

        if (
            team.players.length >= maxPlayers
        ) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Team has already reached maximum player limit",
            });
        }

        // Prevent same team from bidding twice

        if (player.currentBidder && player.currentBidder.toString() === team._id.toString()) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Your team is already the highest bidder",
            });
        }

        // Calculate next bid

        const currentBid =
            player.currentBid || player.basePrice;

        const increment =
            auction.bidIncrement;

        let nextBid;

        if (!player.currentBidder) {
            // First bid

            nextBid = player.basePrice;
        } else {
            // Subsequent bids

            nextBid =
                currentBid + increment;
        }

        // Remaining player slots

        const remainingSlots =
            maxPlayers -
            team.players.length -
            1;

        // Minimum reserve

        const minimumBid =
            auction.minimumBid;

        const minimumReserve =
            remainingSlots * minimumBid;

        // Maximum allowed bid

        const maximumAllowedBid =
            team.remainingBudget -
            minimumReserve;

        // Check purse

        if (
            nextBid >
            maximumAllowedBid
        ) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    `Bid rejected. Maximum allowed bid for ${team.name} is ₹${maximumAllowedBid}`,
                currentBid,
                nextBid,
                remainingBudget:
                    team.remainingBudget,
                remainingSlots,
                minimumReserve,
            });
        }

        // Check bid increment

        if (player.currentBidder) {
            const expectedBid =
                currentBid + increment;

            if (nextBid !== expectedBid) {
                await session.abortTransaction();

                return res.status(400).json({
                    success: false,
                    message:
                        `Next bid must be ₹${expectedBid}`,
                });
            }
        }

        // Update Player

        player.currentBid = nextBid;

        player.currentBidder =
            team._id;

        await player.save({
            session,
        });

        // Count previous bids

        const previousBidCount =
            await AuctionTransaction.countDocuments({
                player: player._id,
                type: "bid",
            }).session(session);

        // Save transaction

        const transaction =
            await AuctionTransaction.create(
                [
                    {
                        auction: auction._id,
                        player: player._id,
                        team: team._id,
                        type: "bid",
                        amount: nextBid,
                        bidNumber:
                            previousBidCount + 1,
                        createdBy: req.user._id,
                    },
                ],
                { session }
            );

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Bid placed successfully",

            bid: {
                amount: nextBid,
                team: {
                    _id: team._id,
                    name: team.name,
                },
            },

            player: {
                _id: player._id,
                name:
                    `${player.fullName} ${player.lastName}`,
                currentBid:
                    player.currentBid,
                currentBidder:
                    player.currentBidder,
            },

            transaction:
                transaction[0],
        });

    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Place Bid Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while placing bid",
        });

    } finally {
        session.endSession();
    }
};


// SELL PLAYER

const sellPlayer = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({
                success: false,
                message: "Player ID is required",
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(playerId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid player ID",
            });
        }

        session.startTransaction();

        // Get Player

        const player = await Player.findById(
            playerId
        ).session(session);

        if (!player) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        // Player must be auctioning

        if (player.status !== "auctioning") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player is not currently being auctioned",
            });
        }

        // Must have bidder

        if (!player.currentBidder) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player cannot be sold because there is no bidder",
            });
        }

        // Get team

        const team = await Team.findById(
            player.currentBidder
        ).session(session);

        if (!team) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message:
                    "Highest bidder team not found",
            });
        }

        // Get auction

        const auction = await Auction.findById(
            player.auction
        ).session(session);

        if (!auction) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Final purse validation

        const soldPrice =
            player.currentBid;

        const remainingBudget =
            team.remainingBudget -
            soldPrice;

        if (remainingBudget < 0) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Team does not have enough purse",
            });
        }

        // Add player to team

        if (
            team.players.some(
                (id) =>
                    id.toString() ===
                    player._id.toString()
            )
        ) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player is already assigned to this team",
            });
        }

        team.players.push(player._id);

        team.remainingBudget =
            remainingBudget;

        await team.save({
            session,
        });

        // Update player

        player.status = "sold";

        player.soldTo =
            team._id;

        player.soldPrice =
            soldPrice;

        await player.save({
            session,
        });

        // Create SOLD transaction

        const transaction =
            await AuctionTransaction.create(
                [
                    {
                        auction: auction._id,
                        player: player._id,
                        team: team._id,
                        type: "sold",
                        amount: soldPrice,
                        createdBy: req.user._id,
                    },
                ],
                { session }
            );

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Player sold successfully",

            player: {
                _id: player._id,
                name:
                    `${player.fullName} ${player.lastName}`,
                soldPrice,
                status: "sold",
            },

            team: {
                _id: team._id,
                name: team.name,
                remainingBudget:
                    team.remainingBudget,
                playersCount:
                    team.players.length,
            },

            transaction:
                transaction[0],
        });

    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Sell Player Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while selling player",
        });

    } finally {
        session.endSession();
    }
};


// MARK PLAYER UNSOLD

const markPlayerUnsold = async (
    req,
    res
) => {
    const session = await mongoose.startSession();

    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({
                success: false,
                message: "Player ID is required",
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(
                playerId
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid player ID",
            });
        }

        session.startTransaction();

        const player = await Player.findById(
            playerId
        ).session(session);

        if (!player) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Player not found",
            });
        }

        if (player.status !== "auctioning") {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message:
                    "Player is not currently being auctioned",
            });
        }

        const auction = await Auction.findById(
            player.auction
        ).session(session);

        if (!auction) {
            await session.abortTransaction();

            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const lastBidTeam =
            player.currentBidder;

        const lastBidAmount =
            player.currentBid || 0;

        player.status = "unsold";

        player.currentBid = 0;

        player.currentBidder = null;

        player.soldTo = null;

        player.soldPrice = 0;

        await player.save({
            session,
        });

        // Unsold transaction

        const transaction =
            await AuctionTransaction.create(
                [
                    {
                        auction: auction._id,
                        player: player._id,
                        team: lastBidTeam,
                        type: "unsold",
                        amount: lastBidAmount,
                        createdBy: req.user._id,
                    },
                ],
                { session }
            );

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Player marked as unsold",

            player: {
                _id: player._id,
                name:
                    `${player.fullName} ${player.lastName}`,
                status: "unsold",
            },

            transaction:
                transaction[0],
        });

    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Unsold Player Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while marking player unsold",
        });

    } finally {
        session.endSession();
    }
};


// GET CURRENT AUCTION PLAYER

const getCurrentAuctionPlayer = async (
    req,
    res
) => {
    try {
        const { auctionId } = req.params;

        if (
            !mongoose.Types.ObjectId.isValid(
                auctionId
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const player = await Player.findOne({
            auction: auctionId,
            status: "auctioning",
        })
            .populate(
                "currentBidder",
                "name logo remainingBudget players"
            );

        if (!player) {
            return res.status(404).json({
                success: false,
                message:
                    "No player is currently being auctioned",
            });
        }

        res.status(200).json({
            success: true,
            player,
        });

    } catch (error) {
        console.error(
            "Current Player Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while getting current player",
        });
    }
};


// GET PLAYER BID HISTORY

const getBidHistory = async (
    req,
    res
) => {
    try {
        const { playerId } = req.params;

        if (
            !mongoose.Types.ObjectId.isValid(
                playerId
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid player ID",
            });
        }

        const transactions =
            await AuctionTransaction.find({
                player: playerId,
            })
                .populate(
                    "team",
                    "name logo"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .sort({
                    createdAt: 1,
                });

        res.status(200).json({
            success: true,
            count: transactions.length,
            transactions,
        });

    } catch (error) {
        console.error(
            "Bid History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while getting bid history",
        });
    }
};

module.exports = {
    startPlayerAuction,
    placeBid,
    sellPlayer,
    markPlayerUnsold,
    getCurrentAuctionPlayer,
    getBidHistory,
};