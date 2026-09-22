const mongoose = require("mongoose");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const User = require("../models/User");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/*
 * The team owner is identified by email — the UI collects
 * "Owner name / Owner email / Owner phone" — but the account is now
 * required to already exist and be active.
 *
 * Previously a team could be created for ANY email: if no account existed,
 * one was silently created with a random password nobody was ever told,
 * so that owner could never log in normally, and (separately) any small
 * mismatch between that hidden account and the one the real owner later
 * registered with caused bidding to fail with a 403. Requiring a real,
 * already-registered account removes both problems: the email you type
 * here is always the account that will actually log in and bid.
 */
const findOwnerOrExplain = async (ownerEmail) => {
    const email = ownerEmail.trim().toLowerCase();

    const user = await User.findOne({ email }).select("name email role isActive");

    if (!user) {
        const err = new Error(
            `No account is registered with ${email}. Ask the team owner to create an account ` +
                "at /register first (or register one for them), then create the team using that same email.",
        );
        err.statusCode = 404;
        throw err;
    }

    if (!user.isActive) {
        const err = new Error(`The account for ${email} is deactivated and cannot own a team.`);
        err.statusCode = 409;
        throw err;
    }

    return user;
};

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

        const { name, ownerName, ownerEmail, ownerPhone, auctionId, status } = req.body;

        if (!name || !ownerName || !ownerEmail || !auctionId) {
            return res.status(400).json({ success: false, message: "name, ownerName, ownerEmail and auctionId are required" });
        }
        if (!isValidObjectId(auctionId)) {
            return res.status(400).json({ success: false, message: "Invalid auction ID" });
        }
        if (!isValidEmail(ownerEmail)) {
            return res.status(400).json({ success: false, message: "Invalid owner email" });
        }

        const auctionDoc = await Auction.findById(auctionId);
        if (!auctionDoc) return res.status(404).json({ success: false, message: "Auction not found" });

        const ownerDoc = await findOwnerOrExplain(ownerEmail);

        // NOTE: this findOne is a best-effort pre-check only. The real
        // guarantee against duplicate team names now comes from the
        // unique index on { auction, name } in the Team model — see
        // the error.code === 11000 handling below.
        const existingTeam = await Team.findOne({ name: name.trim(), auction: auctionId });
        if (existingTeam) return res.status(409).json({ success: false, message: "A team with this name already exists in this auction" });

        let logo = { url: "", publicId: "" };
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "auctionpro/teams");
            logo = { url: result.secure_url, publicId: result.public_id };
            uploadedLogo = logo.publicId;
        }

        const team = await Team.create({
            name: name.trim(),
            owner: ownerDoc._id,
            ownerName: ownerName.trim(),
            // ownerPhone isn't in the Team or User schema yet — accepted
            // from the form but not persisted until one of those models
            // adds a phone field. Harmless to receive and drop for now.
            auction: auctionId,
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

        if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
        if (error.code === 11000) {
            // Could be the { auction, name } team index OR the unique
            // email index on User (a race where two requests try to
            // create the same brand-new owner at once).
            const message = error.keyPattern?.email
                ? "A user with this email already exists"
                : "A team with this name already exists in this auction";
            return res.status(409).json({ success: false, message });
        }
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

        const existingTeam = await Team.findById(id);
        if (!existingTeam) return res.status(404).json({ success: false, message: "Team not found" });

        const { name, ownerName, ownerEmail, auctionId, status } = req.body;
        const updateData = {};

        if (name !== undefined) {
            updateData.name = String(name).trim();
            if (!updateData.name) return res.status(400).json({ success: false, message: "Team name cannot be empty" });
        }
        if (ownerName !== undefined) {
            updateData.ownerName = String(ownerName).trim();
            if (!updateData.ownerName) return res.status(400).json({ success: false, message: "Owner name cannot be empty" });
        }
        if (auctionId !== undefined) {
            if (!isValidObjectId(auctionId)) return res.status(400).json({ success: false, message: "Invalid auction ID" });
            updateData.auction = auctionId;
        }
        if (status !== undefined && !["active", "inactive"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid team status" });
        }
        if (status !== undefined) updateData.status = status;

        // Owner is re-resolved by email the same way createTeam does — the
        // account must already exist (see findOwnerOrExplain above). This is
        // also how an admin repairs a team whose owner account is wrong: edit
        // the team and enter the owner's correct, already-registered email.
        if (ownerEmail !== undefined) {
            if (!isValidEmail(ownerEmail)) return res.status(400).json({ success: false, message: "Invalid owner email" });
            const ownerDoc = await findOwnerOrExplain(ownerEmail);
            updateData.owner = ownerDoc._id;
        }

        // Budget is intentionally not client-updatable. It is controlled by auction/bidding logic.
        delete updateData.totalBudget;
        delete updateData.remainingBudget;

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
        if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
        if (error.code === 11000) {
            const message = error.keyPattern?.email
                ? "A user with this email already exists"
                : "Team already exists";
            return res.status(409).json({ success: false, message });
        }
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