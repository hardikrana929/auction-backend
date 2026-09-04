const Auction = require("../models/Auction");
const AuctionTransaction = require("../models/AuctionTransaction");


// GET COMPLETE AUCTION HISTORY

const getAuctionHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const {
            page = 1,
            limit = 20,
            type,
        } = req.query;

        // Check auction

        const auction = await Auction.findById(auctionId)
            .select("name status date");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        // Build filter

        const filter = {
            auction: auctionId,
        };

        if (
            type &&
            ["bid", "sold", "unsold"].includes(type)
        ) {
            filter.type = type;
        }

        // Pagination

        const pageNumber = Math.max(
            Number(page),
            1
        );

        const limitNumber = Math.min(
            Math.max(Number(limit), 1),
            100
        );

        const skip =
            (pageNumber - 1) *
            limitNumber;


        // Get transactions

        const transactions =
            await AuctionTransaction.find(filter)
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limitNumber)
                .populate(
                    "player",
                    `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    soldPrice
                    status
                    `
                )
                .populate(
                    "team",
                    `
                    name
                    logo
                    ownerName
                    `
                )
                .populate(
                    "createdBy",
                    "name email"
                );

        // Total transactions

        const totalTransactions =
            await AuctionTransaction.countDocuments(
                filter
            );

        const totalPages =
            Math.ceil(
                totalTransactions /
                limitNumber
            );

        // Response

        res.status(200).json({
            success: true,

            data: {
                auction,

                transactions,

                pagination: {
                    currentPage:
                        pageNumber,

                    totalPages,

                    totalTransactions,

                    limit:
                        limitNumber,

                    hasNextPage:
                        pageNumber < totalPages,

                    hasPreviousPage:
                        pageNumber > 1,
                },
            },
        });

    } catch (error) {

        console.error(
            "Get Auction History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get auction history",
            error: error.message,
        });
    }
};

// GET SOLD PLAYERS HISTORY

const getSoldPlayersHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(
            auctionId
        ).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        const soldTransactions =
            await AuctionTransaction.find({
                auction: auctionId,
                type: "sold",
            })
                .sort({
                    createdAt: -1,
                })
                .populate(
                    "player",
                    `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    soldPrice
                    status
                    `
                )
                .populate(
                    "team",
                    `
                    name
                    logo
                    ownerName
                    `
                )
                .populate(
                    "createdBy",
                    "name email"
                );


        res.status(200).json({
            success: true,

            data: {
                auction,

                count:
                    soldTransactions.length,

                players:
                    soldTransactions,
            },
        });

    } catch (error) {

        console.error(
            "Get Sold Players History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get sold players history",
            error: error.message,
        });
    }
};

// GET UNSOLD PLAYERS HISTORY

const getUnsoldPlayersHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(
            auctionId
        ).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        const unsoldTransactions =
            await AuctionTransaction.find({
                auction: auctionId,
                type: "unsold",
            })
                .sort({
                    createdAt: -1,
                })
                .populate(
                    "player",
                    `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    status
                    `
                )
                .populate(
                    "team",
                    `
                    name
                    logo
                    ownerName
                    `
                )
                .populate(
                    "createdBy",
                    "name email"
                );


        res.status(200).json({
            success: true,

            data: {
                auction,

                count:
                    unsoldTransactions.length,

                players:
                    unsoldTransactions,
            },
        });

    } catch (error) {

        console.error(
            "Get Unsold Players History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get unsold players history",
            error: error.message,
        });
    }
};

// GET BID HISTORY

const getAuctionBidHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(
            auctionId
        ).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        const bids =
            await AuctionTransaction.find({
                auction: auctionId,
                type: "bid",
            })
                .sort({
                    createdAt: -1,
                })
                .populate(
                    "player",
                    `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    `
                )
                .populate(
                    "team",
                    `
                    name
                    logo
                    ownerName
                    `
                )
                .populate(
                    "createdBy",
                    "name email"
                );


        res.status(200).json({
            success: true,

            data: {
                auction,

                count:
                    bids.length,

                bids,
            },
        });

    } catch (error) {

        console.error(
            "Get Auction Bid History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get auction bid history",
            error: error.message,
        });
    }
};

// GET PLAYER TRANSACTION HISTORY

const getPlayerTransactionHistory = async (
    req,
    res
) => {
    try {
        const { playerId } = req.params;

        const transactions =
            await AuctionTransaction.find({
                player: playerId,
            })
                .sort({
                    createdAt: 1,
                })
                .populate(
                    "player",
                    `
                    fullName
                    lastName
                    photo
                    role
                    basePrice
                    currentBid
                    soldPrice
                    status
                    `
                )
                .populate(
                    "team",
                    `
                    name
                    logo
                    ownerName
                    `
                )
                .populate(
                    "auction",
                    "name status"
                )
                .populate(
                    "createdBy",
                    "name email"
                );


        res.status(200).json({
            success: true,

            data: {
                playerId,

                count:
                    transactions.length,

                transactions,
            },
        });

    } catch (error) {

        console.error(
            "Get Player Transaction History Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Failed to get player transaction history",
            error: error.message,
        });
    }
};

// EXPORT

module.exports = {
    getAuctionHistory,
    getSoldPlayersHistory,
    getUnsoldPlayersHistory,
    getAuctionBidHistory,
    getPlayerTransactionHistory,
};