const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const AuctionSession = require("../models/AuctionSession");
const Player = require("../models/Player");

// START AUCTION

const startAuction = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const { auctionId } = req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        const auction = await Auction.findById(auctionId).session(session);

        if (!auction) {
            throw new Error("Auction not found");
        }

        if (auction.status === "completed") {
            throw new Error("Auction is already completed");
        }

        if (auction.status === "cancelled") {
            throw new Error("Cancelled auction cannot be started");
        }

        // Find existing session
        let auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        }).session(session);

        if (!auctionSession) {
            auctionSession = new AuctionSession({
                auction: auctionId,
                status: "live",
                isPaused: false,
                startedAt: new Date(),
                controlledBy: req.user._id,
                lastAction: "auction_started",
                lastActionAt: new Date(),
            });
        } else {
            if (auctionSession.status === "completed") {
                throw new Error("Auction session is already completed");
            }

            if (auctionSession.status === "live" ||
                auctionSession.status === "player_auction") {
                throw new Error("Auction is already live");
            }

            auctionSession.status = "live";
            auctionSession.isPaused = false;
            auctionSession.startedAt =
                auctionSession.startedAt || new Date();

            auctionSession.controlledBy = req.user._id;
            auctionSession.lastAction = "auction_started";
            auctionSession.lastActionAt = new Date();
        }

        // Count players
        const totalPlayers = await Player.countDocuments({
            auction: auctionId,
        }).session(session);

        auctionSession.totalPlayers = totalPlayers;

        if (totalPlayers === 0) {
            throw new Error(
                "Cannot start auction because no players are available"
            );
        }

        // Change auction status
        auction.status = "live";

        await auction.save({ session });
        await auctionSession.save({ session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: "Auction started successfully",
            data: auctionSession,
        });

    } catch (error) {
        await session.abortTransaction();

        console.error("Start Auction Error:", error);

        res.status(400).json({
            success: false,
            message: error.message,
        });

    } finally {
        session.endSession();
    }
};

// PAUSE AUCTION

const pauseAuction = async (req, res) => {
    try {
        const { auctionId } = req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        });

        if (!auctionSession) {
            return res.status(404).json({
                success: false,
                message: "Auction session not found",
            });
        }

        if (auctionSession.status === "completed") {
            return res.status(400).json({
                success: false,
                message: "Auction is already completed",
            });
        }

        if (auctionSession.isPaused) {
            return res.status(400).json({
                success: false,
                message: "Auction is already paused",
            });
        }

        if (
            auctionSession.status !== "live" &&
            auctionSession.status !== "player_auction"
        ) {
            return res.status(400).json({
                success: false,
                message: "Auction cannot be paused in current state",
            });
        }

        auctionSession.isPaused = true;
        auctionSession.status = "paused";
        auctionSession.pausedAt = new Date();

        auctionSession.controlledBy = req.user._id;
        auctionSession.lastAction = "auction_paused";
        auctionSession.lastActionAt = new Date();

        await auctionSession.save();

        res.status(200).json({
            success: true,
            message: "Auction paused successfully",
            data: auctionSession,
        });

    } catch (error) {
        console.error("Pause Auction Error:", error);

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// RESUME AUCTION

const resumeAuction = async (req, res) => {
    try {
        const { auctionId } = req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        });

        if (!auctionSession) {
            return res.status(404).json({
                success: false,
                message: "Auction session not found",
            });
        }

        if (!auctionSession.isPaused) {
            return res.status(400).json({
                success: false,
                message: "Auction is not paused",
            });
        }

        if (auctionSession.status !== "paused") {
            return res.status(400).json({
                success: false,
                message: "Auction cannot be resumed",
            });
        }

        /*
         * If there is a current player,
         * return to player auction.
         *
         * Otherwise return to live.
         */

        if (auctionSession.currentPlayer) {
            auctionSession.status = "player_auction";
        } else {
            auctionSession.status = "live";
        }

        auctionSession.isPaused = false;
        auctionSession.resumedAt = new Date();

        auctionSession.controlledBy = req.user._id;
        auctionSession.lastAction = "auction_resumed";
        auctionSession.lastActionAt = new Date();

        await auctionSession.save();

        await Auction.findByIdAndUpdate(
            auctionId,
            {
                status: "live",
            }
        );

        res.status(200).json({
            success: true,
            message: "Auction resumed successfully",
            data: auctionSession,
        });

    } catch (error) {
        console.error("Resume Auction Error:", error);

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// GET AUCTION SESSION

const getAuctionSession = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        })
            .populate("auction")
            .populate("currentPlayer")
            .populate("controlledBy", "name email");

        if (!auctionSession) {
            return res.status(404).json({
                success: false,
                message: "Auction session not found",
            });
        }

        res.status(200).json({
            success: true,
            data: auctionSession,
        });

    } catch (error) {
        console.error("Get Auction Session Error:", error);

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// START NEXT PLAYER

const startNextPlayer = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const { auctionId } = req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        }).session(session);

        if (!auctionSession) {
            throw new Error("Auction session not found");
        }

        if (auctionSession.isPaused) {
            throw new Error("Auction is paused");
        }

        if (auctionSession.status === "completed") {
            throw new Error("Auction is already completed");
        }

        /*
         * Don't allow next player while
         * another player is currently being auctioned.
         */

        if (auctionSession.status === "player_auction") {
            throw new Error(
                "Current player auction is still active"
            );
        }

        // Find next available player
        const nextPlayer = await Player.findOne({
            auction: auctionId,
            status: "available",
        })
            .sort({ auctionOrder: 1, createdAt: 1 })
            .session(session);

        // No players remaining
        if (!nextPlayer) {

            auctionSession.status = "completed";
            auctionSession.isPaused = false;
            auctionSession.currentPlayer = null;
            auctionSession.currentPlayerIndex = -1;
            auctionSession.completedAt = new Date();

            auctionSession.controlledBy = req.user._id;
            auctionSession.lastAction = "auction_completed";
            auctionSession.lastActionAt = new Date();

            await auctionSession.save({ session });

            await Auction.findByIdAndUpdate(
                auctionId,
                {
                    status: "completed",
                },
                { session }
            );

            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message: "All players completed. Auction completed.",
                data: auctionSession,
            });
        }

        /*
         * Start player auction
         */

        nextPlayer.status = "auctioning";
        nextPlayer.currentBid = 0;
        nextPlayer.currentBidder = null;

        await nextPlayer.save({ session });

        auctionSession.currentPlayer = nextPlayer._id;

        auctionSession.currentPlayerIndex =
            auctionSession.playersCompleted;

        auctionSession.status = "player_auction";
        auctionSession.isPaused = false;

        auctionSession.controlledBy = req.user._id;
        auctionSession.lastAction = "player_started";
        auctionSession.lastActionAt = new Date();

        await auctionSession.save({ session });

        await session.commitTransaction();

        const populatedSession =
            await AuctionSession.findById(auctionSession._id)
                .populate("currentPlayer");

        res.status(200).json({
            success: true,
            message: "Next player auction started",
            data: populatedSession,
        });

    } catch (error) {
        await session.abortTransaction();

        console.error("Start Next Player Error:", error);

        res.status(400).json({
            success: false,
            message: error.message,
        });

    } finally {
        session.endSession();
    }
};

// COMPLETE CURRENT PLAYER

const completeCurrentPlayer = async (req, res) => {
    try {
        const { auctionId, result } = req.body;

        if (!auctionId || !result) {
            return res.status(400).json({
                success: false,
                message: "Auction ID and result are required",
            });
        }

        if (!["sold", "unsold"].includes(result)) {
            return res.status(400).json({
                success: false,
                message: "Result must be sold or unsold",
            });
        }

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        });

        if (!auctionSession) {
            return res.status(404).json({
                success: false,
                message: "Auction session not found",
            });
        }

        if (!auctionSession.currentPlayer) {
            return res.status(400).json({
                success: false,
                message: "No current player",
            });
        }

        if (auctionSession.status !== "player_auction") {
            return res.status(400).json({
                success: false,
                message: "No active player auction",
            });
        }

        /*
         * NOTE:
         * Actual SOLD/UNSOLD operation should normally be
         * performed through your existing biddingController.
         *
         * This controller only updates the session state.
         */

        if (result === "sold") {
            auctionSession.status = "player_sold";
            auctionSession.playersSold += 1;
            auctionSession.lastAction = "player_sold";
        } else {
            auctionSession.status = "player_unsold";
            auctionSession.playersUnsold += 1;
            auctionSession.lastAction = "player_unsold";
        }

        auctionSession.playersCompleted += 1;
        auctionSession.lastActionAt = new Date();
        auctionSession.controlledBy = req.user._id;

        await auctionSession.save();

        res.status(200).json({
            success: true,
            message: `Player marked as ${result}`,
            data: auctionSession,
        });

    } catch (error) {
        console.error("Complete Current Player Error:", error);

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// EXPORT

module.exports = {
    startAuction,
    pauseAuction,
    resumeAuction,
    getAuctionSession,
    startNextPlayer,
    completeCurrentPlayer,
};