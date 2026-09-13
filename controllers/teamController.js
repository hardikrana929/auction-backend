const mongoose = require("mongoose");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const User = require("../models/User");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getTeamsByAuction = async (req, res) => {
    try {
        const { auctionId } = req.params;
        if (!isValidObjectId(auctionId)) return res.status(400).json({ success: false, message: "Invalid auction ID" });

        const teams = await Team.find({ auction: auctionId })
            .populate("auction", "name date status startingBudget")
            .populate("owner", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({ success: true, count: teams.length, teams });
    } catch (error) {
        console.error("Get teams by auction error:", error);
        return res.status(500).json({ success: false, message: "Failed to load teams" });
    }
};

const getTeamById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });

        const team = await Team.findById(id)
            .populate("auction", "name date status startingBudget")
            .populate("owner", "name email");
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });

        return res.status(200).json({ success: true, team });
    } catch (error) {
        console.error("Get team error:", error);
        return res.status(500).json({ success: false, message: "Failed to load team" });
    }
};

const createTeam = async (req, res) => {
    // Tracks whether we've uploaded a logo this request, so we can
    // clean it up on Cloudinary if the DB write below fails for any
    // reason (validation error, duplicate name, etc). Without this,
    // a failed team creation still leaves a billed, orphaned asset.
    let uploadedLogo = null;

    try {
        if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
            return res.status(400).json({ success: false, message: "Invalid logo image" });
        }

        const { name, owner, ownerName, auction, status } = req.body;

        if (!name || !auction || !owner || !ownerName) {
            return res.status(400).json({ success: false, message: "name, ownerName, owner and auction are required" });
        }
        if (![auction, owner].every(isValidObjectId)) {
            return res.status(400).json({ success: false, message: "Invalid auction or owner ID" });
        }

        const [auctionDoc, ownerDoc] = await Promise.all([
            Auction.findById(auction),
            User.findById(owner).select("name email role isActive"),
        ]);
        if (!auctionDoc) return res.status(404).json({ success: false, message: "Auction not found" });
        if (!ownerDoc || !ownerDoc.isActive) return res.status(404).json({ success: false, message: "Team owner not found or inactive" });

        // NOTE: this findOne is a best-effort pre-check only. The real
        // guarantee against duplicate team names now comes from the
        // unique index on { auction, name } in the Team model — see
        // the error.code === 11000 handling below.
        const existingTeam = await Team.findOne({ name: name.trim(), auction });
        if (existingTeam) return res.status(409).json({ success: false, message: "A team with this name already exists in this auction" });

        let logo = { url: "", publicId: "" };
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "auctionpro/teams");
            logo = { url: result.secure_url, publicId: result.public_id };
            uploadedLogo = logo.publicId;
        }

        const team = await Team.create({
            name: name.trim(),
            owner,
            ownerName: ownerName.trim(),
            auction,
            totalBudget: auctionDoc.startingBudget,
            remainingBudget: auctionDoc.startingBudget,
            logo: logo || undefined,
            status: status || "active",
        });

        const populatedTeam = await Team.findById(team._id)
            .populate("auction", "name date status startingBudget")
            .populate("owner", "name email");

        return res.status(201).json({ success: true, message: "Team created successfully", team: populatedTeam });
    } catch (error) {
        console.error("Create team error:", error);

        // The DB write failed after the logo was already uploaded —
        // delete it rather than leaving it billed and unreferenced.
        if (uploadedLogo) {
            try {
                await deleteFromCloudinary(uploadedLogo);
            } catch (cleanupError) {
                console.error("Failed to clean up orphaned team logo:", cleanupError.message);
            }
        }

        if (error.code === 11000) return res.status(409).json({ success: false, message: "A team with this name already exists in this auction" });
        if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Invalid team data" });
        return res.status(500).json({ success: false, message: "Failed to create team" });
    }
};

const updateTeam = async (req, res) => {
    try {
        if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
            return res.status(400).json({ success: false, message: "Invalid logo image" });
        }

        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });

        const allowedFields = ["name", "owner", "ownerName", "auction", "status"];
        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        }

        if (updateData.name !== undefined) {
            updateData.name = String(updateData.name).trim();
            if (!updateData.name) return res.status(400).json({ success: false, message: "Team name cannot be empty" });
        }
        if (updateData.ownerName !== undefined) {
            updateData.ownerName = String(updateData.ownerName).trim();
            if (!updateData.ownerName) return res.status(400).json({ success: false, message: "Owner name cannot be empty" });
        }
        if (updateData.owner !== undefined && !isValidObjectId(updateData.owner)) return res.status(400).json({ success: false, message: "Invalid owner ID" });
        if (updateData.auction !== undefined && !isValidObjectId(updateData.auction)) return res.status(400).json({ success: false, message: "Invalid auction ID" });
        if (updateData.status !== undefined && !["active", "inactive"].includes(updateData.status)) return res.status(400).json({ success: false, message: "Invalid team status" });

        // Budget is intentionally not client-updatable. It is controlled by auction/bidding logic.
        delete updateData.totalBudget;
        delete updateData.remainingBudget;

        const existingTeam = await Team.findById(id);
        if (!existingTeam) return res.status(404).json({ success: false, message: "Team not found" });

        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "auctionpro/teams");
            updateData.logo = {
                url: result.secure_url,
                publicId: result.public_id,
            };
            if (existingTeam.logo?.publicId) {
                try {
                    await deleteFromCloudinary(existingTeam.logo.publicId);
                } catch (deleteError) {
                    console.error("Old team logo cleanup failed:", deleteError.message);
                }
            }
        }

        const team = await Team.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
            .populate("auction", "name date status startingBudget")
            .populate("owner", "name email");
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });

        return res.status(200).json({ success: true, message: "Team updated successfully", team });
    } catch (error) {
        console.error("Update team error:", error);
        if (error.code === 11000) return res.status(409).json({ success: false, message: "Team already exists" });
        return res.status(500).json({ success: false, message: "Failed to update team" });
    }
};

const updateTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });
        if (!["active", "inactive"].includes(status)) return res.status(400).json({ success: false, message: "Invalid team status" });

        const team = await Team.findByIdAndUpdate(id, { status }, { new: true, runValidators: true })
            .populate("auction", "name date status")
            .populate("owner", "name email");
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });

        return res.status(200).json({ success: true, message: "Team status updated successfully", team });
    } catch (error) {
        console.error("Update team status error:", error);
        return res.status(500).json({ success: false, message: "Failed to update team status" });
    }
};

const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid team ID" });

        const team = await Team.findById(id);
        if (!team) return res.status(404).json({ success: false, message: "Team not found" });
        if (team.players.length > 0) return res.status(400).json({ success: false, message: "Cannot delete a team that has players" });

        await team.deleteOne();
        return res.status(200).json({ success: true, message: "Team deleted successfully" });
    } catch (error) {
        console.error("Delete team error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete team" });
    }
};

module.exports = { getTeamsByAuction, getTeamById, createTeam, updateTeam, updateTeamStatus, deleteTeam };
