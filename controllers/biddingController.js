const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const Player = require("../models/Player");
const Team = require("../models/Team");
const AuctionTransaction = require("../models/AuctionTransaction");
const AuctionRegistration = require("../models/AuctionRegistration");
const AuctionSession = require("../models/AuctionSession");

// --------------------------------------------------
// Helper: Get Socket.IO instance
// --------------------------------------------------

const getIO = (req) => {
    return req.app.get("io");
};

// --------------------------------------------------
// Helper: Auction Room
// --------------------------------------------------

const getAuctionRoom = (auctionId) => {
    return `auction:${auctionId}`;
};

// ==================================================
// START PLAYER AUCTION
// ==================================================

const startPlayerAuction = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
        } = req.body;

        if (!auctionId || !playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId and playerId are required",
            });
        }

        session.startTransaction();

        // ------------------------------------------
        // Find auction
        // ------------------------------------------

        const auction = await Auction.findById(
            auctionId
        ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (auction.status !== "live") {
            throw new Error(
                "Auction is not live"
            );
        }

        // ------------------------------------------
        // Find player
        // ------------------------------------------

        const player = await Player.findOne({
            _id: playerId,
            auction: auctionId,
        }).session(session);

        if (!player) {
            throw new Error(
                "Player not found"
            );
        }

        if (player.status !== "available") {
            throw new Error(
                "Player is not available for auction"
            );
        }

        // ------------------------------------------
        // Make sure no other player is auctioning
        // ------------------------------------------

        const currentPlayer =
            await Player.findOne({
                auction: auctionId,
                status: "auctioning",
            }).session(session);

        if (currentPlayer) {
            throw new Error(
                "Another player is already being auctioned"
            );
        }

        // ------------------------------------------
        // Reset bidding information
        // ------------------------------------------

        player.status = "auctioning";
        player.currentBid = player.basePrice;
        player.currentBidder = null;
        player.soldTo = null;
        player.soldPrice = 0;

        await player.save({
            session,
        });

        // ------------------------------------------
        // Update Auction Session
        // ------------------------------------------

        let auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (!auctionSession) {
            auctionSession =
                new AuctionSession({
                    auction: auctionId,
                });
        }

        auctionSession.currentPlayer =
            player._id;

        auctionSession.status =
            "player_auction";

        auctionSession.isPaused = false;

        auctionSession.lastAction =
            "player_started";

        auctionSession.lastActionAt =
            new Date();

        await auctionSession.save({
            session,
        });

        // ------------------------------------------
        // Commit
        // ------------------------------------------

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET EVENT
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit("player:started", {
                auctionId,
                player: {
                    id: player._id,
                    fullName: player.fullName,
                    lastName: player.lastName,
                    photo: player.photo,
                    role: player.role,
                    battingHand:
                        player.battingHand,
                    bowlingStyle:
                        player.bowlingStyle,
                    basePrice:
                        player.basePrice,
                    currentBid:
                        player.currentBid,
                    currentBidder: null,
                    status:
                        player.status,
                },
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Player auction started successfully",
            data: {
                player,
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Start Player Auction Error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    } finally {
        await session.endSession();
    }
};

// ==================================================
// PLACE BID
// ==================================================

const placeBid = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
            teamId,
            amount,
        } = req.body;

        if (
            !auctionId ||
            !playerId ||
            !teamId ||
            amount === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId, playerId, teamId and amount are required",
            });
        }

        if (Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Bid amount must be greater than 0",
            });
        }

        session.startTransaction();

        // ------------------------------------------
        // Auction
        // ------------------------------------------

        const auction = await Auction.findById(
            auctionId
        ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (auction.status !== "live") {
            throw new Error(
                "Auction is not live"
            );
        }

        // ------------------------------------------
        // Player
        // ------------------------------------------

        const player = await Player.findOne({
            _id: playerId,
            auction: auctionId,
        }).session(session);

        if (!player) {
            throw new Error(
                "Player not found"
            );
        }

        if (player.status !== "auctioning") {
            throw new Error(
                "Player is not currently being auctioned"
            );
        }

        // ------------------------------------------
        // Team
        // ------------------------------------------

        const team = await Team.findOne({
            _id: teamId,
            auction: auctionId,
            status: "active",
        }).session(session);

        if (!team) {
            throw new Error(
                "Team not found or inactive"
            );
        }

        // ------------------------------------------
        // Registration
        // ------------------------------------------

        const registration =
            await AuctionRegistration.findOne({
                auction: auctionId,
                team: teamId,
                status: "approved",
            }).session(session);

        if (!registration) {
            throw new Error(
                "Team is not approved for this auction"
            );
        }

        // ------------------------------------------
        // Validate bid increment
        // ------------------------------------------

        const currentBid =
            player.currentBid ||
            player.basePrice;

        const minimumNextBid =
            currentBid +
            auction.bidIncrement;

        if (Number(amount) < minimumNextBid) {
            throw new Error(
                `Minimum next bid is ${minimumNextBid}`
            );
        }

        // ------------------------------------------
        // Validate budget
        // ------------------------------------------

        if (
            Number(amount) >
            team.remainingBudget
        ) {
            throw new Error(
                "Insufficient team budget"
            );
        }

        // ------------------------------------------
        // Validate roster
        // ------------------------------------------

        if (
            team.players.length >=
            auction.maxPlayersPerTeam
        ) {
            throw new Error(
                "Team has reached maximum player limit"
            );
        }

        // ------------------------------------------
        // Save previous bidder
        // ------------------------------------------

        const previousBidder =
            player.currentBidder;

        // ------------------------------------------
        // Update player
        // ------------------------------------------

        player.currentBid = Number(amount);

        player.currentBidder =
            team._id;

        await player.save({
            session,
        });

        // ------------------------------------------
        // Create transaction
        // ------------------------------------------

        const transaction =
            new AuctionTransaction({
                auction: auctionId,
                player: playerId,
                team: teamId,
                type: "bid",
                amount: Number(amount),
                createdBy: req.user._id,
            });

        await transaction.save({
            session,
        });

        // ------------------------------------------
        // Update Auction Session
        // ------------------------------------------

        await AuctionSession.findOneAndUpdate(
            {
                auction: auctionId,
            },
            {
                lastAction: "bid_placed",
                lastActionAt: new Date(),
            },
            {
                session,
            }
        );

        // ------------------------------------------
        // Commit
        // ------------------------------------------

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET EVENT
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit("bid:new", {
                auctionId,

                bid: {
                    playerId:
                        player._id,

                    playerName:
                        player.fullName,

                    teamId:
                        team._id,

                    teamName:
                        team.name,

                    amount:
                        Number(amount),

                    previousBidder:
                        previousBidder,

                    bidAt: new Date(),
                },
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Bid placed successfully",
            data: {
                player,
                team,
                transaction,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Place Bid Error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    } finally {
        await session.endSession();
    }
};

// ==================================================
// SELL PLAYER
// ==================================================

const sellPlayer = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
        } = req.body;

        if (!auctionId || !playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId and playerId are required",
            });
        }

        session.startTransaction();

        // ------------------------------------------
        // Auction
        // ------------------------------------------

        const auction = await Auction.findById(
            auctionId
        ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (auction.status !== "live") {
            throw new Error(
                "Auction is not live"
            );
        }

        // ------------------------------------------
        // Player
        // ------------------------------------------

        const player = await Player.findOne({
            _id: playerId,
            auction: auctionId,
            status: "auctioning",
        }).session(session);

        if (!player) {
            throw new Error(
                "Auctioning player not found"
            );
        }

        // ------------------------------------------
        // Check bidder
        // ------------------------------------------

        if (!player.currentBidder) {
            throw new Error(
                "Player has no bidder"
            );
        }

        // ------------------------------------------
        // Team
        // ------------------------------------------

        const team = await Team.findOne({
            _id: player.currentBidder,
            auction: auctionId,
            status: "active",
        }).session(session);

        if (!team) {
            throw new Error(
                "Winning team not found"
            );
        }

        // ------------------------------------------
        // Registration
        // ------------------------------------------

        const registration =
            await AuctionRegistration.findOne({
                auction: auctionId,
                team: team._id,
                status: "approved",
            }).session(session);

        if (!registration) {
            throw new Error(
                "Winning team is not approved"
            );
        }

        // ------------------------------------------
        // Validate budget
        // ------------------------------------------

        if (
            player.currentBid >
            team.remainingBudget
        ) {
            throw new Error(
                "Winning team has insufficient budget"
            );
        }

        // ------------------------------------------
        // Validate roster
        // ------------------------------------------

        if (
            team.players.length >=
            auction.maxPlayersPerTeam
        ) {
            throw new Error(
                "Winning team has reached maximum player limit"
            );
        }

        const soldPrice =
            player.currentBid;

        // ------------------------------------------
        // Update team
        // ------------------------------------------

        team.remainingBudget -=
            soldPrice;

        team.players.push(
            player._id
        );

        await team.save({
            session,
        });

        // ------------------------------------------
        // Update player
        // ------------------------------------------

        player.status = "sold";

        player.soldTo =
            team._id;

        player.soldPrice =
            soldPrice;

        await player.save({
            session,
        });

        // ------------------------------------------
        // Transaction
        // ------------------------------------------

        const transaction =
            new AuctionTransaction({
                auction: auctionId,
                player: player._id,
                team: team._id,
                type: "sold",
                amount: soldPrice,
                createdBy: req.user._id,
            });

        await transaction.save({
            session,
        });

        // ------------------------------------------
        // Update Auction Session
        // ------------------------------------------

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (auctionSession) {
            auctionSession.status =
                "player_sold";

            auctionSession.playersCompleted +=
                1;

            auctionSession.playersSold +=
                1;

            auctionSession.lastAction =
                "player_sold";

            auctionSession.lastActionAt =
                new Date();

            await auctionSession.save({
                session,
            });
        }

        // ------------------------------------------
        // Commit
        // ------------------------------------------

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET EVENT
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit("player:sold", {
                auctionId,

                player: {
                    id: player._id,
                    fullName:
                        player.fullName,
                    photo:
                        player.photo,
                    role:
                        player.role,
                },

                team: {
                    id: team._id,
                    name: team.name,
                    logo: team.logo,
                },

                soldPrice,

                remainingBudget:
                    team.remainingBudget,

                soldAt: new Date(),
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Player sold successfully",
            data: {
                player,
                team,
                soldPrice,
                transaction,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Sell Player Error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    } finally {
        await session.endSession();
    }
};

// ==================================================
// MARK PLAYER UNSOLD
// ==================================================

const markPlayerUnsold = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
        } = req.body;

        if (!auctionId || !playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "auctionId and playerId are required",
            });
        }

        session.startTransaction();

        // ------------------------------------------
        // Auction
        // ------------------------------------------

        const auction = await Auction.findById(
            auctionId
        ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (auction.status !== "live") {
            throw new Error(
                "Auction is not live"
            );
        }

        // ------------------------------------------
        // Player
        // ------------------------------------------

        const player = await Player.findOne({
            _id: playerId,
            auction: auctionId,
            status: "auctioning",
        }).session(session);

        if (!player) {
            throw new Error(
                "Auctioning player not found"
            );
        }

        // ------------------------------------------
        // Update player
        // ------------------------------------------

        player.status = "unsold";

        player.currentBid = 0;

        player.currentBidder = null;

        player.soldTo = null;

        player.soldPrice = 0;

        await player.save({
            session,
        });

        // ------------------------------------------
        // Transaction
        // ------------------------------------------

        const transaction =
            new AuctionTransaction({
                auction: auctionId,
                player: player._id,
                team: null,
                type: "unsold",
                amount: 0,
                createdBy: req.user._id,
            });

        await transaction.save({
            session,
        });

        // ------------------------------------------
        // Auction Session
        // ------------------------------------------

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (auctionSession) {
            auctionSession.status =
                "player_unsold";

            auctionSession.playersCompleted +=
                1;

            auctionSession.playersUnsold +=
                1;

            auctionSession.lastAction =
                "player_unsold";

            auctionSession.lastActionAt =
                new Date();

            await auctionSession.save({
                session,
            });
        }

        // ------------------------------------------
        // Commit
        // ------------------------------------------

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET EVENT
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit("player:unsold", {
                auctionId,

                player: {
                    id: player._id,
                    fullName:
                        player.fullName,
                    photo:
                        player.photo,
                    role:
                        player.role,
                },

                unsoldAt: new Date(),
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Player marked as unsold",
            data: {
                player,
                transaction,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Mark Player Unsold Error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    } finally {
        await session.endSession();
    }
};

// ==================================================
// GET CURRENT AUCTION PLAYER
// ==================================================

const getCurrentAuctionPlayer =
    async (req, res) => {
        try {
            const { auctionId } =
                req.params;

            const player =
                await Player.findOne({
                    auction: auctionId,
                    status: "auctioning",
                })
                    .populate(
                        "currentBidder",
                        "name logo ownerName"
                    )
                    .populate(
                        "auction",
                        "name status"
                    );

            if (!player) {
                return res.status(404).json({
                    success: false,
                    message:
                        "No player is currently being auctioned",
                });
            }

            return res.status(200).json({
                success: true,
                data: player,
            });
        } catch (error) {
            console.error(
                "Get Current Auction Player Error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error",
            });
        }
    };

// ==================================================
// GET BID HISTORY
// ==================================================

const getBidHistory = async (
    req,
    res
) => {
    try {
        const { playerId } =
            req.params;

        const history =
            await AuctionTransaction.find({
                player: playerId,
                type: "bid",
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
                    createdAt: -1,
                });

        return res.status(200).json({
            success: true,
            count: history.length,
            data: history,
        });
    } catch (error) {
        console.error(
            "Get Bid History Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error",
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