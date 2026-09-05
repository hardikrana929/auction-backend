const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const Player = require("../models/Player");
const AuctionSession = require("../models/AuctionSession");

// --------------------------------------------------
// Helper: Get Socket.IO
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
// START AUCTION
// ==================================================

const startAuction = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const { auctionId } =
            req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required",
            });
        }

        session.startTransaction();

        // ------------------------------------------
        // Find auction
        // ------------------------------------------

        const auction =
            await Auction.findById(
                auctionId
            ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        // ------------------------------------------
        // Validate status
        // ------------------------------------------

        if (
            auction.status !==
            "upcoming" &&
            auction.status !==
            "draft"
        ) {
            throw new Error(
                `Auction cannot be started from status: ${auction.status}`
            );
        }

        // ------------------------------------------
        // Count available players
        // ------------------------------------------

        const totalPlayers =
            await Player.countDocuments({
                auction: auctionId,
            }).session(session);

        if (totalPlayers === 0) {
            throw new Error(
                "Cannot start auction without players"
            );
        }

        // ------------------------------------------
        // Update auction
        // ------------------------------------------

        auction.status = "live";

        await auction.save({
            session,
        });

        // ------------------------------------------
        // Create/update session
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

        auctionSession.status = "live";

        auctionSession.isPaused =
            false;

        auctionSession.startedAt =
            auctionSession.startedAt ||
            new Date();

        auctionSession.totalPlayers =
            totalPlayers;

        auctionSession.lastAction =
            "auction_started";

        auctionSession.lastActionAt =
            new Date();

        auctionSession.controlledBy =
            req.user._id;

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
            ).emit(
                "auction:started",
                {
                    auctionId,
                    status: "live",
                    startedAt:
                        auctionSession.startedAt,
                    totalPlayers,
                }
            );
        }

        return res.status(200).json({
            success: true,
            message:
                "Auction started successfully",
            data: {
                auction,
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Start Auction Error:",
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
// PAUSE AUCTION
// ==================================================

const pauseAuction = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const { auctionId } =
            req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required",
            });
        }

        session.startTransaction();

        const auction =
            await Auction.findById(
                auctionId
            ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (
            auction.status !== "live"
        ) {
            throw new Error(
                "Only live auction can be paused"
            );
        }

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (!auctionSession) {
            throw new Error(
                "Auction session not found"
            );
        }

        if (
            auctionSession.isPaused
        ) {
            throw new Error(
                "Auction is already paused"
            );
        }

        auctionSession.status =
            "paused";

        auctionSession.isPaused =
            true;

        auctionSession.pausedAt =
            new Date();

        auctionSession.lastAction =
            "auction_paused";

        auctionSession.lastActionAt =
            new Date();

        await auctionSession.save({
            session,
        });

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit(
                "auction:paused",
                {
                    auctionId,
                    status: "paused",
                    pausedAt:
                        auctionSession.pausedAt,
                }
            );
        }

        return res.status(200).json({
            success: true,
            message:
                "Auction paused successfully",
            data: {
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Pause Auction Error:",
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
// RESUME AUCTION
// ==================================================

const resumeAuction = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const { auctionId } =
            req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required",
            });
        }

        session.startTransaction();

        const auction =
            await Auction.findById(
                auctionId
            ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (
            auction.status !== "live"
        ) {
            throw new Error(
                "Auction is not live"
            );
        }

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (!auctionSession) {
            throw new Error(
                "Auction session not found"
            );
        }

        if (
            !auctionSession.isPaused
        ) {
            throw new Error(
                "Auction is not paused"
            );
        }

        auctionSession.status =
            auctionSession.currentPlayer
                ? "player_auction"
                : "live";

        auctionSession.isPaused =
            false;

        auctionSession.resumedAt =
            new Date();

        auctionSession.lastAction =
            "auction_resumed";

        auctionSession.lastActionAt =
            new Date();

        await auctionSession.save({
            session,
        });

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit(
                "auction:resumed",
                {
                    auctionId,
                    status: "live",
                    resumedAt:
                        auctionSession.resumedAt,
                }
            );
        }

        return res.status(200).json({
            success: true,
            message:
                "Auction resumed successfully",
            data: {
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Resume Auction Error:",
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
// GET AUCTION SESSION
// ==================================================

const getAuctionSession =
    async (req, res) => {
        try {
            const { auctionId } =
                req.params;

            const auctionSession =
                await AuctionSession.findOne({
                    auction: auctionId,
                })
                    .populate(
                        "currentPlayer"
                    )
                    .populate(
                        "controlledBy",
                        "name email role"
                    );

            if (!auctionSession) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Auction session not found",
                });
            }

            return res.status(200).json({
                success: true,
                data: auctionSession,
            });
        } catch (error) {
            console.error(
                "Get Auction Session Error:",
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
// START NEXT PLAYER
// ==================================================

const startNextPlayer = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const { auctionId } =
            req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required",
            });
        }

        session.startTransaction();

        const auction =
            await Auction.findById(
                auctionId
            ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (
            auction.status !== "live"
        ) {
            throw new Error(
                "Auction is not live"
            );
        }

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (!auctionSession) {
            throw new Error(
                "Auction session not found"
            );
        }

        if (
            auctionSession.isPaused
        ) {
            throw new Error(
                "Auction is paused"
            );
        }

        // ------------------------------------------
        // Make sure no player is currently auctioning
        // ------------------------------------------

        const currentAuctioningPlayer =
            await Player.findOne({
                auction: auctionId,
                status: "auctioning",
            }).session(session);

        if (currentAuctioningPlayer) {
            throw new Error(
                "Current player must be completed before starting next player"
            );
        }

        // ------------------------------------------
        // Find next available player
        // ------------------------------------------

        const nextPlayer =
            await Player.findOne({
                auction: auctionId,
                status: "available",
                auctionOrder: {
                    $gt:
                        auctionSession.currentPlayerIndex,
                },
            })
                .sort({
                    auctionOrder: 1,
                })
                .session(session);

        if (!nextPlayer) {
            throw new Error(
                "No more players available"
            );
        }

        // ------------------------------------------
        // Start player
        // ------------------------------------------

        nextPlayer.status =
            "auctioning";

        nextPlayer.currentBid =
            nextPlayer.basePrice;

        nextPlayer.currentBidder =
            null;

        nextPlayer.soldTo =
            null;

        nextPlayer.soldPrice =
            0;

        await nextPlayer.save({
            session,
        });

        // ------------------------------------------
        // Update session
        // ------------------------------------------

        auctionSession.currentPlayer =
            nextPlayer._id;

        auctionSession.currentPlayerIndex =
            nextPlayer.auctionOrder;

        auctionSession.status =
            "player_auction";

        auctionSession.lastAction =
            "next_player";

        auctionSession.lastActionAt =
            new Date();

        await auctionSession.save({
            session,
        });

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit(
                "auction:next-player",
                {
                    auctionId,

                    player: {
                        id:
                            nextPlayer._id,
                        fullName:
                            nextPlayer.fullName,
                        lastName:
                            nextPlayer.lastName,
                        photo:
                            nextPlayer.photo,
                        role:
                            nextPlayer.role,
                        battingHand:
                            nextPlayer.battingHand,
                        bowlingStyle:
                            nextPlayer.bowlingStyle,
                        basePrice:
                            nextPlayer.basePrice,
                        currentBid:
                            nextPlayer.currentBid,
                        status:
                            nextPlayer.status,
                    },
                }
            );
        }

        return res.status(200).json({
            success: true,
            message:
                "Next player started successfully",
            data: {
                player:
                    nextPlayer,
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Start Next Player Error:",
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
// COMPLETE CURRENT PLAYER
// ==================================================

const completeCurrentPlayer =
    async (req, res) => {
        const session =
            await mongoose.startSession();

        try {
            const { auctionId } =
                req.body;

            if (!auctionId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Auction ID is required",
                });
            }

            session.startTransaction();

            const auction =
                await Auction.findById(
                    auctionId
                ).session(session);

            if (!auction) {
                throw new Error(
                    "Auction not found"
                );
            }

            const auctionSession =
                await AuctionSession.findOne({
                    auction: auctionId,
                }).session(session);

            if (!auctionSession) {
                throw new Error(
                    "Auction session not found"
                );
            }

            if (
                !auctionSession.currentPlayer
            ) {
                throw new Error(
                    "No current player"
                );
            }

            const player =
                await Player.findById(
                    auctionSession.currentPlayer
                ).session(session);

            if (!player) {
                throw new Error(
                    "Current player not found"
                );
            }

            // ------------------------------------------------
            // IMPORTANT:
            // SOLD / UNSOLD should normally be handled by
            // biddingController.js.
            //
            // This controller only synchronizes the session
            // after the player has already been processed.
            // ------------------------------------------------

            if (
                player.status ===
                "auctioning"
            ) {
                throw new Error(
                    "Player must be sold or marked unsold before completing"
                );
            }

            auctionSession.lastAction =
                "next_player";

            auctionSession.lastActionAt =
                new Date();

            await auctionSession.save({
                session,
            });

            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message:
                    "Current player completed successfully",
                data: {
                    player,
                    auctionSession,
                },
            });
        } catch (error) {
            await session.abortTransaction();

            console.error(
                "Complete Current Player Error:",
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
// COMPLETE AUCTION
// ==================================================

const completeAuction = async (
    req,
    res
) => {
    const session =
        await mongoose.startSession();

    try {
        const { auctionId } =
            req.body;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required",
            });
        }

        session.startTransaction();

        const auction =
            await Auction.findById(
                auctionId
            ).session(session);

        if (!auction) {
            throw new Error(
                "Auction not found"
            );
        }

        if (
            auction.status !== "live"
        ) {
            throw new Error(
                "Only live auction can be completed"
            );
        }

        // ------------------------------------------
        // Make sure no player is being auctioned
        // ------------------------------------------

        const auctioningPlayer =
            await Player.findOne({
                auction: auctionId,
                status: "auctioning",
            }).session(session);

        if (auctioningPlayer) {
            throw new Error(
                "Current player must be completed before closing auction"
            );
        }

        // ------------------------------------------
        // Make sure no available players remain
        // ------------------------------------------

        const remainingPlayers =
            await Player.countDocuments({
                auction: auctionId,
                status: "available",
            }).session(session);

        if (remainingPlayers > 0) {
            throw new Error(
                `${remainingPlayers} player(s) still remain in the auction`
            );
        }

        // ------------------------------------------
        // Update auction
        // ------------------------------------------

        auction.status =
            "completed";

        await auction.save({
            session,
        });

        // ------------------------------------------
        // Update session
        // ------------------------------------------

        const auctionSession =
            await AuctionSession.findOne({
                auction: auctionId,
            }).session(session);

        if (auctionSession) {
            auctionSession.status =
                "completed";

            auctionSession.isPaused =
                false;

            auctionSession.completedAt =
                new Date();

            auctionSession.lastAction =
                "auction_completed";

            auctionSession.lastActionAt =
                new Date();

            await auctionSession.save({
                session,
            });
        }

        await session.commitTransaction();

        // ------------------------------------------
        // SOCKET
        // ------------------------------------------

        const io = getIO(req);

        if (io) {
            io.to(
                getAuctionRoom(auctionId)
            ).emit(
                "auction:completed",
                {
                    auctionId,
                    status:
                        "completed",
                    completedAt:
                        new Date(),
                }
            );
        }

        return res.status(200).json({
            success: true,
            message:
                "Auction completed successfully",
            data: {
                auction,
                auctionSession,
            },
        });
    } catch (error) {
        await session.abortTransaction();

        console.error(
            "Complete Auction Error:",
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

module.exports = {
    startAuction,
    pauseAuction,
    resumeAuction,
    getAuctionSession,
    startNextPlayer,
    completeCurrentPlayer,
    completeAuction,
};