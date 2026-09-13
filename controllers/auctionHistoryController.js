const Auction = require("../models/Auction");
const AuctionTransaction = require("../models/AuctionTransaction");

// Shared pagination clamp, matching what getAuctionHistory already did —
// used now by every endpoint in this file instead of just one of them.
const getPagination = (query) => {
    const pageNumber = Math.max(Number(query.page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;
    return { pageNumber, limitNumber, skip };
};

const buildPaginationMeta = (pageNumber, limitNumber, total) => {
    const totalPages = Math.ceil(total / limitNumber);
    return {
        currentPage: pageNumber,
        totalPages,
        totalItems: total,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
    };
};

// GET COMPLETE AUCTION HISTORY

const getAuctionHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const { type } = req.query;

        const auction = await Auction.findById(auctionId).select("name status date");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const filter = { auction: auctionId };

        if (type && ["bid", "sold", "unsold"].includes(type)) {
            filter.type = type;
        }

        const { pageNumber, limitNumber, skip } = getPagination(req.query);

        const transactions = await AuctionTransaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .populate("player", "fullName lastName photo role basePrice soldPrice status")
            .populate("team", "name logo ownerName")
            .populate("createdBy", "name email");

        const totalTransactions = await AuctionTransaction.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                auction,
                transactions,
                pagination: buildPaginationMeta(pageNumber, limitNumber, totalTransactions),
            },
        });
    } catch (error) {
        console.error("Get Auction History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get auction history",
            // Do not expose internal error details in API responses.
        });
    }
};

// GET SOLD PLAYERS HISTORY

const getSoldPlayersHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(auctionId).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const filter = { auction: auctionId, type: "sold" };
        const { pageNumber, limitNumber, skip } = getPagination(req.query);

        const [soldTransactions, total] = await Promise.all([
            AuctionTransaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNumber)
                .populate("player", "fullName lastName photo role basePrice soldPrice status")
                .populate("team", "name logo ownerName")
                .populate("createdBy", "name email"),
            AuctionTransaction.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                auction,
                count: soldTransactions.length,
                players: soldTransactions,
                pagination: buildPaginationMeta(pageNumber, limitNumber, total),
            },
        });
    } catch (error) {
        console.error("Get Sold Players History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get sold players history",
            // Do not expose internal error details in API responses.
        });
    }
};

// GET UNSOLD PLAYERS HISTORY

const getUnsoldPlayersHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(auctionId).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const filter = { auction: auctionId, type: "unsold" };
        const { pageNumber, limitNumber, skip } = getPagination(req.query);

        const [unsoldTransactions, total] = await Promise.all([
            AuctionTransaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNumber)
                .populate("player", "fullName lastName photo role basePrice status")
                .populate("team", "name logo ownerName")
                .populate("createdBy", "name email"),
            AuctionTransaction.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                auction,
                count: unsoldTransactions.length,
                players: unsoldTransactions,
                pagination: buildPaginationMeta(pageNumber, limitNumber, total),
            },
        });
    } catch (error) {
        console.error("Get Unsold Players History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get unsold players history",
            // Do not expose internal error details in API responses.
        });
    }
};

// GET BID HISTORY

const getAuctionBidHistory = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const auction = await Auction.findById(auctionId).select("name status");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const filter = { auction: auctionId, type: "bid" };
        const { pageNumber, limitNumber, skip } = getPagination(req.query);

        const [bids, total] = await Promise.all([
            AuctionTransaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNumber)
                .populate("player", "fullName lastName photo role basePrice")
                .populate("team", "name logo ownerName")
                .populate("createdBy", "name email"),
            AuctionTransaction.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                auction,
                count: bids.length,
                bids,
                pagination: buildPaginationMeta(pageNumber, limitNumber, total),
            },
        });
    } catch (error) {
        console.error("Get Auction Bid History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get auction bid history",
            // Do not expose internal error details in API responses.
        });
    }
};

// GET PLAYER TRANSACTION HISTORY
//
// Not paginated: this one is scoped to a single player, so its result
// set is naturally small (bounded by how many bids that one player
// received, not by the whole auction) — left as a full find() on
// purpose, unlike the four auction-wide endpoints above.

const getPlayerTransactionHistory = async (req, res) => {
    try {
        const { playerId } = req.params;

        const transactions = await AuctionTransaction.find({ player: playerId })
            .sort({ createdAt: 1 })
            .populate("player", "fullName lastName photo role basePrice currentBid soldPrice status")
            .populate("team", "name logo ownerName")
            .populate("auction", "name status")
            .populate("createdBy", "name email");

        res.status(200).json({
            success: true,
            data: {
                playerId,
                count: transactions.length,
                transactions,
            },
        });
    } catch (error) {
        console.error("Get Player Transaction History Error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to get player transaction history",
            // Do not expose internal error details in API responses.
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