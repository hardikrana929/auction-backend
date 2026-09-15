const mongoose = require("mongoose");
const Auction = require("../models/Auction");
const asyncHandler = require("../utils/asyncHandler");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");

// Auction creation

const createAuction = asyncHandler(async (req, res) => {
    // Tracks whether we've uploaded a banner this request, so it can be
    // cleaned up on Cloudinary if the DB write below fails for any reason
    // (validation error, etc). Without this, a failed create still leaves
    // a billed, orphaned asset — same pattern as createTeam.
    let uploadedImage = null;

    try {
        if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Invalid banner image",
            });
        }

        const {
            name,
            description,
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

        let image = "";
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "auctionpro/auctions");
            image = result.secure_url;
            uploadedImage = result.public_id;
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
        // The DB write failed after the banner was already uploaded —
        // delete it rather than leaving it billed and unreferenced.
        if (uploadedImage) {
            try {
                await deleteFromCloudinary(uploadedImage);
            } catch (cleanupError) {
                console.error("Failed to clean up orphaned auction banner:", cleanupError.message);
            }
        }
        throw error;
    }
});

// Get all Auctions

const getAllAuctions = asyncHandler(async (req, res) => {
    const auctions = await Auction.find()
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: auctions.length,
        auctions,
    });
});

// GET SINGLE AUCTION

const getAuctionById = asyncHandler(async (req, res) => {
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
});

// UPDATE AUCTION

const updateAuction = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid auction ID",
        });
    }

    if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
            success: false,
            message: "Invalid banner image",
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
    if (auction.status === "live" || auction.status === "completed") {
        return res.status(400).json({
            success: false,
            message: `Cannot update a ${auction.status} auction`,
        });
    }

    // "image" is handled separately below (file upload / removal), so it's
    // deliberately left out of this generic text-field loop.
    const allowedFields = [
        "name",
        "description",
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

    // Image: a new upload replaces it, an explicit removeImage flag clears
    // it, and otherwise (no file, no flag) the existing image is left alone.
    // NOTE: unlike team logos, the previous Cloudinary asset isn't deleted
    // here — Auction.image only stores the URL, not a publicId to delete by.
    if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "auctionpro/auctions");
        auction.image = result.secure_url;
    } else if (req.body.removeImage === "true") {
        auction.image = "";
    }

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

    // runValidators isn't needed here since auction.save() always
    // re-validates the whole document; a bad value in one of the
    // allowedFields (e.g. a negative startingBudget) now surfaces as
    // a clean field-level 400 via errorMiddleware.js instead of a
    // generic 500.
    await auction.save();

    res.status(200).json({
        success: true,
        message: "Auction updated successfully",
        auction,
    });
});

// UPDATE AUCTION STATUS

const updateAuctionStatus = asyncHandler(async (req, res) => {
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
});

// DELETE AUCTION

const deleteAuction = asyncHandler(async (req, res) => {
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
    if (auction.status === "live" || auction.status === "completed") {
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
});

module.exports = {
    createAuction,
    getAllAuctions,
    getAuctionById,
    updateAuction,
    updateAuctionStatus,
    deleteAuction,
};