const mongoose = require("mongoose");
const Auction = require("../models/Auction");

// Auction creatrion

const createAuction = async (req, res) => {
    try {
        const {
            name,
            description,
            image,
            date,
            startingBudget,
            minimumBid,
            bidIncrement,
            maxTeams,
            maxPlayersPerTeam,
        } = req.body;

        // Required fields
        if (
            !name ||
            !date ||
            startingBudget === undefined ||
            minimumBid === undefined ||
            bidIncrement === undefined ||
            maxTeams === undefined ||
            maxPlayersPerTeam === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required auction details",
            });
        }

        // Validate date
        const auctionDate = new Date(date);

        if (isNaN(auctionDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction date",
            });
        }

        // Date should be future
        if (auctionDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: "Auction date must be in the future",
            });
        }

        // Validate numbers
        if (startingBudget <= 0) {
            return res.status(400).json({
                success: false,
                message: "Starting budget must be greater than 0",
            });
        }

        if (minimumBid <= 0) {
            return res.status(400).json({
                success: false,
                message: "Minimum bid must be greater than 0",
            });
        }

        if (bidIncrement <= 0) {
            return res.status(400).json({
                success: false,
                message: "Bid increment must be greater than 0",
            });
        }

        if (maxTeams < 2) {
            return res.status(400).json({
                success: false,
                message: "Auction must have at least 2 teams",
            });
        }

        if (maxPlayersPerTeam < 1) {
            return res.status(400).json({
                success: false,
                message: "Players per team must be at least 1",
            });
        }

        // Create auction
        const auction = await Auction.create({
            name,
            description,
            image,
            date: auctionDate,
            startingBudget,
            minimumBid,
            bidIncrement,
            maxTeams,
            maxPlayersPerTeam,
            status: "upcoming",
            createdBy: req.user._id,
        });

        res.status(201).json({
            success: true,
            message: "Auction created successfully",
            auction,
        });

    } catch (error) {
        console.error("Create Auction Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while creating auction",
        });
    }
};


// Get all Auctions

const getAllAuctions = async (req, res) => {
    try {
        const auctions = await Auction.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: auctions.length,
            auctions,
        });

    } catch (error) {
        console.error("Get Auctions Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while fetching auctions",
        });
    }
};

// GET SINGLE AUCTION

const getAuctionById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const auction = await Auction.findById(id)
            .populate("createdBy", "name email");

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        res.status(200).json({
            success: true,
            auction,
        });

    } catch (error) {
        console.error("Get Auction Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while fetching auction",
        });
    }
};

// UPDATE AUCTION

const updateAuction = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const auction = await Auction.findById(id);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Do not modify completed/live auctions
        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot update a ${auction.status} auction`,
            });
        }

        const allowedFields = [
            "name",
            "description",
            "image",
            "date",
            "startingBudget",
            "minimumBid",
            "bidIncrement",
            "maxTeams",
            "maxPlayersPerTeam",
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                auction[field] = req.body[field];
            }
        });

        // Validate date if changed
        if (req.body.date) {
            const newDate = new Date(req.body.date);

            if (isNaN(newDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid auction date",
                });
            }

            if (newDate <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Auction date must be in the future",
                });
            }

            auction.date = newDate;
        }

        await auction.save();

        res.status(200).json({
            success: true,
            message: "Auction updated successfully",
            auction,
        });

    } catch (error) {
        console.error("Update Auction Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while updating auction",
        });
    }
};

// UPDATE AUCTION STATUS

const updateAuctionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const allowedStatuses = [
            "draft",
            "upcoming",
            "live",
            "completed",
            "cancelled",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction status",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const auction = await Auction.findById(id);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        auction.status = status;

        await auction.save();

        res.status(200).json({
            success: true,
            message: `Auction status changed to ${status}`,
            auction,
        });

    } catch (error) {
        console.error("Status Update Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while updating auction status",
        });
    }
};


// DELETE AUCTION

const deleteAuction = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const auction = await Auction.findById(id);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Don't delete live/completed auctions
        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete a ${auction.status} auction`,
            });
        }

        await auction.deleteOne();

        res.status(200).json({
            success: true,
            message: "Auction deleted successfully",
        });

    } catch (error) {
        console.error("Delete Auction Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while deleting auction",
        });
    }
};


module.exports = {
    createAuction,
    getAllAuctions,
    getAuctionById,
    updateAuction,
    updateAuctionStatus,
    deleteAuction,
};