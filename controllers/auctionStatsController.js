const Auction = require("../models/Auction");
const Player = require("../models/Player");
const Team = require("../models/Team");
const AuctionSession = require("../models/AuctionSession");
const AuctionTransaction = require("../models/AuctionTransaction");


// GET AUCTION STATISTICS

const getAuctionStats = async (req, res) => {
    try {
        const { auctionId } = req.params;

        // Check Auction

        const auction = await Auction.findById(auctionId)
            .select(
                "name description image date startingBudget minimumBid bidIncrement maxTeams maxPlayersPerTeam status"
            );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        // Get Auction Session

        const auctionSession = await AuctionSession.findOne({
            auction: auctionId,
        })
            .populate({
                path: "currentPlayer",
                select: `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    currentBid
                    currentBidder
                    status
                `,
                populate: {
                    path: "currentBidder",
                    select: "name logo ownerName",
                },
            })
            .populate(
                "controlledBy",
                "name email"
            );


        // Player Statistics

        const playerStats = await Player.aggregate([
            {
                $match: {
                    auction: auction._id,
                },
            },
            {
                $group: {
                    _id: null,

                    totalPlayers: {
                        $sum: 1,
                    },

                    soldPlayers: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "sold",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    unsoldPlayers: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "unsold",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    availablePlayers: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "available",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    auctioningPlayers: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "auctioning",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },

                    totalAmountSpent: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "sold",
                                    ],
                                },
                                "$soldPrice",
                                0,
                            ],
                        },
                    },

                    highestSoldPrice: {
                        $max: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "sold",
                                    ],
                                },
                                "$soldPrice",
                                0,
                            ],
                        },
                    },

                    highestCurrentBid: {
                        $max: "$currentBid",
                    },
                },
            },
        ]);


        const stats = playerStats[0] || {
            totalPlayers: 0,
            soldPlayers: 0,
            unsoldPlayers: 0,
            availablePlayers: 0,
            auctioningPlayers: 0,
            totalAmountSpent: 0,
            highestSoldPrice: 0,
            highestCurrentBid: 0,
        };


        // Highest Sold Player

        const highestSoldPlayer = await Player.findOne({
            auction: auctionId,
            status: "sold",
        })
            .sort({
                soldPrice: -1,
            })
            .select(
                "fullName lastName photo role basePrice soldPrice soldTo"
            )
            .populate(
                "soldTo",
                "name logo ownerName"
            );


        // Highest Current Bid

        const highestBidPlayer = await Player.findOne({
            auction: auctionId,
            currentBid: {
                $gt: 0,
            },
        })
            .sort({
                currentBid: -1,
            })
            .select(
                "fullName lastName photo role basePrice currentBid currentBidder status"
            )
            .populate(
                "currentBidder",
                "name logo ownerName"
            );


        // Team Statistics

        const teams = await Team.find({
            auction: auctionId,
        })
            .select(
                "name logo ownerName totalBudget remainingBudget players status"
            )
            .populate({
                path: "players",
                select: "fullName lastName photo role soldPrice",
            });


        // Calculate Team Stats

        const teamStats = teams.map((team) => {

            const playersBought = team.players.length;

            const totalSpent = team.players.reduce(
                (total, player) => {
                    return total + (player.soldPrice || 0);
                },
                0
            );

            return {
                teamId: team._id,
                name: team.name,
                logo: team.logo,
                ownerName: team.ownerName,

                totalBudget: team.totalBudget,

                remainingBudget:
                    team.remainingBudget,

                totalSpent,

                playersBought,

                remainingSlots:
                    Math.max(
                        0,
                        auction.maxPlayersPerTeam -
                        playersBought
                    ),

                status: team.status,
            };
        });


        // Total Team Budget

        const totalTeamBudget = teams.reduce(
            (total, team) => {
                return total + (team.totalBudget || 0);
            },
            0
        );


        // Remaining Team Budget
        const totalRemainingBudget = teams.reduce(
            (total, team) => {
                return total + (team.remainingBudget || 0);
            },
            0
        );


        // Recent Transactions

        const recentTransactions =
            await AuctionTransaction.find({
                auction: auctionId,
            })
                .sort({
                    createdAt: -1,
                })
                .limit(10)
                .populate(
                    "player",
                    "fullName lastName photo role"
                )
                .populate(
                    "team",
                    "name logo ownerName"
                )
                .populate(
                    "createdBy",
                    "name email"
                );


        // Auction Progress

        const totalPlayers = stats.totalPlayers;

        const completedPlayers =
            stats.soldPlayers +
            stats.unsoldPlayers;

        const progress =
            totalPlayers > 0
                ? Number(
                    (
                        (completedPlayers /
                            totalPlayers) *
                        100
                    ).toFixed(2)
                )
                : 0;


        // Response

        res.status(200).json({
            success: true,

            data: {

                // Auction

                auction: {
                    id: auction._id,
                    name: auction.name,
                    description: auction.description,
                    image: auction.image,
                    date: auction.date,
                    status: auction.status,

                    minimumBid:
                        auction.minimumBid,

                    bidIncrement:
                        auction.bidIncrement,

                    maxTeams:
                        auction.maxTeams,

                    maxPlayersPerTeam:
                        auction.maxPlayersPerTeam,
                },


                // Summary

                summary: {

                    totalPlayers:
                        stats.totalPlayers,

                    soldPlayers:
                        stats.soldPlayers,

                    unsoldPlayers:
                        stats.unsoldPlayers,

                    availablePlayers:
                        stats.availablePlayers,

                    auctioningPlayers:
                        stats.auctioningPlayers,

                    completedPlayers,

                    progress: `${progress}%`,

                    totalTeams:
                        teams.length,

                    totalAmountSpent:
                        stats.totalAmountSpent,

                    totalTeamBudget,

                    totalRemainingBudget,

                    totalBudgetUsed:
                        totalTeamBudget -
                        totalRemainingBudget,
                },

                // Highest Sold Player

                highestSoldPlayer,


                // Highest Bid

                highestBid: {
                    amount:
                        highestBidPlayer
                            ?.currentBid || 0,

                    player:
                        highestBidPlayer || null,
                },


                // Current Player

                currentPlayer:
                    auctionSession
                        ?.currentPlayer || null,


                // Auction Session

                session: auctionSession
                    ? {
                        id: auctionSession._id,

                        status:
                            auctionSession.status,

                        isPaused:
                            auctionSession.isPaused,

                        currentPlayerIndex:
                            auctionSession.currentPlayerIndex,

                        totalPlayers:
                            auctionSession.totalPlayers,

                        playersCompleted:
                            auctionSession.playersCompleted,

                        playersSold:
                            auctionSession.playersSold,

                        playersUnsold:
                            auctionSession.playersUnsold,

                        startedAt:
                            auctionSession.startedAt,

                        pausedAt:
                            auctionSession.pausedAt,

                        resumedAt:
                            auctionSession.resumedAt,

                        completedAt:
                            auctionSession.completedAt,

                        lastAction:
                            auctionSession.lastAction,

                        lastActionAt:
                            auctionSession.lastActionAt,

                        controlledBy:
                            auctionSession.controlledBy,
                    }
                    : null,



                // Teams

                teams: teamStats,

                // Recent Transactions

                recentTransactions,
            },
        });

    } catch (error) {

        console.error(
            "Get Auction Stats Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get auction statistics",
            error: error.message,
        });
    }
};

// EXPORT
module.exports = {
    getAuctionStats,
};