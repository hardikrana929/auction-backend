const mongoose = require("mongoose");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const User = require("../models/User");
const AuctionRegistration = require("../models/AuctionRegistration");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/*
 * The owner e-mail is contact information only. It is NOT checked against our
 * users: any valid e-mail can be typed. If an active (non auction-admin)
 * account with that e-mail happens to exist it is linked as the team owner,
 * otherwise the team simply has no linked account (owner = null).
 */
const findOwnerIfExists = async (ownerEmail) => {
  const email = ownerEmail.trim().toLowerCase();
  const user = await User.findOne({
    email,
    role: { $ne: "auction_manager" },
    isActive: true,
  }).select("_id");
  return user || null;
};

const getTeamsByAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    if (!isValidObjectId(auctionId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid auction ID" });

    // Regular users must only receive teams they own. Admins and
    // auction managers can see all teams within the authorized auction.
    const teamFilter = { auction: auctionId };
    if (!["admin", "auction_manager"].includes(req.user?.role)) {
      teamFilter.owner = req.user._id;
    }

    const teams = await Team.find(teamFilter)
      .populate("auction", "name date status startingBudget teamBudget")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: teams.length, teams });
  } catch (error) {
    console.error("Get teams by auction error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load teams" });
  }
};

const getTeamById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid team ID" });

    const team = await Team.findById(id)
      .populate("auction", "name date status startingBudget teamBudget")
      .populate("owner", "name");
    if (!team)
      return res
        .status(404)
        .json({ success: false, message: "Team not found" });

    return res.status(200).json({ success: true, team });
  } catch (error) {
    console.error("Get team error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load team" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid logo image" });
    }

    const { name, ownerName, ownerEmail, ownerPhone, auctionId, status } =
      req.body;

    if (!name || !ownerName || !ownerEmail || !auctionId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "name, ownerName, ownerEmail and auctionId are required",
        });
    }
    if (!isValidObjectId(auctionId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid auction ID" });
    }
    if (!isValidEmail(ownerEmail)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid owner email" });
    }

    const auctionDoc = await Auction.findById(auctionId);
    if (!auctionDoc)
      return res
        .status(404)
        .json({ success: false, message: "Auction not found" });

    const ownerDoc = await findOwnerIfExists(ownerEmail);

    // Teams created by an admin are approved straight away, so respect the
    // auction's team limit here.
    const approvedCount = await AuctionRegistration.countDocuments({
      auction: auctionId,
      status: "approved",
    });
    if (approvedCount >= Number(auctionDoc.maxTeams)) {
      return res.status(409).json({
        success: false,
        message: `This auction is full (${approvedCount}/${auctionDoc.maxTeams} teams).`,
      });
    }

    // NOTE: this findOne is a best-effort pre-check only. The real
    // guarantee against duplicate team names now comes from the
    // unique index on { auction, name } in the Team model — see
    // the error.code === 11000 handling below.
    const existingTeam = await Team.findOne({
      name: name.trim(),
      auction: auctionId,
    });
    if (existingTeam)
      return res
        .status(409)
        .json({
          success: false,
          message: "A team with this name already exists in this auction",
        });

    let logo = { url: "", publicId: "" };
    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "auctionpro/teams",
      );
      logo = { url: result.secure_url, publicId: result.public_id };
      uploadedLogo = logo.publicId;
    }

    const team = await Team.create({
      name: name.trim(),
      owner: ownerDoc?._id || null,
      ownerEmail: ownerEmail.trim().toLowerCase(),
      ownerName: ownerName.trim(),
      // ownerPhone isn't in the Team or User schema yet — accepted
      // from the form but not persisted until one of those models
      // adds a phone field. Harmless to receive and drop for now.
      auction: auctionId,
      totalBudget: Number(auctionDoc.teamBudget ?? auctionDoc.startingBudget),
      remainingBudget: Number(
        auctionDoc.teamBudget ?? auctionDoc.startingBudget,
      ),
      logo: logo || undefined,
      status: status || "active",
    });

    // Admin-created teams do not need a separate approval step.
    await AuctionRegistration.create({
      auction: auctionId,
      team: team._id,
      registeredBy: req.user._id,
      status: "approved",
      approvedAt: new Date(),
      approvedBy: req.user._id,
    });
    await Auction.updateOne(
      { _id: auctionId },
      { $inc: { approvedTeamsCount: 1 } },
    );

    const populatedTeam = await Team.findById(team._id)
      .populate("auction", "name date status startingBudget teamBudget")
      .populate("owner", "name");

    return res
      .status(201)
      .json({
        success: true,
        message: "Team created successfully",
        team: populatedTeam,
      });
  } catch (error) {
    console.error("Create team error:", error);

    // The DB write failed after the logo was already uploaded —
    // delete it rather than leaving it billed and unreferenced.
    if (uploadedLogo) {
      try {
        await deleteFromCloudinary(uploadedLogo);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up orphaned team logo:",
          cleanupError.message,
        );
      }
    }

    if (error.statusCode)
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    if (error.code === 11000) {
      // Could be the { auction, name } team index OR the unique
      // email index on User (a race where two requests try to
      // create the same brand-new owner at once).
      const message = error.keyPattern?.email
        ? "A user with this email already exists"
        : "A team with this name already exists in this auction";
      return res.status(409).json({ success: false, message });
    }
    if (error.name === "ValidationError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid team data" });
    return res
      .status(500)
      .json({ success: false, message: "Failed to create team" });
  }
};

const updateTeam = async (req, res) => {
  let uploadedLogoPublicId = null;
  try {
    if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid logo image" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid team ID" });

    const existingTeam = await Team.findById(id);
    if (!existingTeam)
      return res
        .status(404)
        .json({ success: false, message: "Team not found" });

    const { name, ownerName, ownerEmail, auctionId, status } = req.body;
    const updateData = {};

    if (name !== undefined) {
      updateData.name = String(name).trim();
      if (!updateData.name)
        return res
          .status(400)
          .json({ success: false, message: "Team name cannot be empty" });
    }
    if (ownerName !== undefined) {
      updateData.ownerName = String(ownerName).trim();
      if (!updateData.ownerName)
        return res
          .status(400)
          .json({ success: false, message: "Owner name cannot be empty" });
    }
    if (
      auctionId !== undefined &&
      String(auctionId) !== String(existingTeam.auction)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "A team cannot be moved to another auction",
        });
    }
    if (status !== undefined && !["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid team status" });
    }
    if (status !== undefined) updateData.status = status;

    // Owner e-mail is contact information (not checked against our users).
    // A matching account, if any, is linked; otherwise owner becomes null.
    if (ownerEmail !== undefined) {
      const auction = await Auction.findById(existingTeam.auction);
      if (["live", "completed"].includes(auction?.status))
        return res
          .status(409)
          .json({
            success: false,
            message: "Team owner cannot be changed after the auction starts",
          });
      if (!isValidEmail(ownerEmail))
        return res
          .status(400)
          .json({ success: false, message: "Invalid owner email" });
      const ownerDoc = await findOwnerIfExists(ownerEmail);
      updateData.owner = ownerDoc?._id || null;
      updateData.ownerEmail = String(ownerEmail).trim().toLowerCase();
    }

    // Budget is intentionally not client-updatable. It is controlled by auction/bidding logic.
    delete updateData.totalBudget;
    delete updateData.remainingBudget;

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "auctionpro/teams",
      );
      uploadedLogoPublicId = result.public_id;
      updateData.logo = { url: result.secure_url, publicId: result.public_id };
    }
    const team = await Team.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("auction", "name date status startingBudget teamBudget")
      .populate("owner", "name");
    if (!team)
      return res
        .status(404)
        .json({ success: false, message: "Team not found" });
    if (uploadedLogoPublicId && existingTeam.logo?.publicId) {
      try {
        await deleteFromCloudinary(existingTeam.logo.publicId);
      } catch (deleteError) {
        console.error("Old team logo cleanup failed:", deleteError.message);
      }
    }
    uploadedLogoPublicId = null;
    return res
      .status(200)
      .json({ success: true, message: "Team updated successfully", team });
  } catch (error) {
    if (uploadedLogoPublicId) {
      try {
        await deleteFromCloudinary(uploadedLogoPublicId);
      } catch (cleanupError) {
        console.error("New team logo cleanup failed:", cleanupError.message);
      }
    }
    console.error("Update team error:", error);
    if (error.statusCode)
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    if (error.code === 11000) {
      const message = error.keyPattern?.email
        ? "A user with this email already exists"
        : "Team already exists";
      return res.status(409).json({ success: false, message });
    }
    return res
      .status(500)
      .json({ success: false, message: "Failed to update team" });
  }
};

const updateTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid team ID" });
    if (!["active", "inactive"].includes(status))
      return res
        .status(400)
        .json({ success: false, message: "Invalid team status" });

    const team = await Team.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    )
      .populate("auction", "name date status")
      .populate("owner", "name");
    if (!team)
      return res
        .status(404)
        .json({ success: false, message: "Team not found" });

    return res
      .status(200)
      .json({
        success: true,
        message: "Team status updated successfully",
        team,
      });
  } catch (error) {
    console.error("Update team status error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update team status" });
  }
};

const deleteTeam = async (req, res) => {
  const session = await mongoose.startSession();
  let logoPublicId = null;
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid team ID" });
    let team;
    await session.withTransaction(async () => {
      team = await Team.findById(id).session(session);
      if (!team) {
        const error = new Error("Team not found");
        error.statusCode = 404;
        throw error;
      }
      const auction = await Auction.findById(team.auction).session(session);
      if (["live", "completed"].includes(auction?.status)) {
        const error = new Error(
          `Cannot delete a team during a ${auction.status} auction`,
        );
        error.statusCode = 409;
        throw error;
      }
      if ((team.players || []).length > 0) {
        const error = new Error("Cannot delete a team that has players");
        error.statusCode = 409;
        throw error;
      }
      const registrations = await AuctionRegistration.find({
        team: team._id,
      }).session(session);
      const approvedCount = registrations.filter(
        (item) => item.status === "approved",
      ).length;
      await AuctionRegistration.deleteMany({ team: team._id }, { session });
      if (approvedCount)
        await Auction.updateOne(
          { _id: team.auction },
          { $inc: { approvedTeamsCount: -approvedCount } },
          { session },
        );
      logoPublicId = team.logo?.publicId || null;
      await team.deleteOne({ session });
    });
    if (logoPublicId) {
      try {
        await deleteFromCloudinary(logoPublicId);
      } catch (error) {
        console.error("Deleted team logo cleanup failed:", error.message);
      }
    }
    return res
      .status(200)
      .json({ success: true, message: "Team deleted successfully" });
  } catch (error) {
    console.error("Delete team error:", error);
    return res
      .status(error.statusCode || 500)
      .json({
        success: false,
        message: error.statusCode ? error.message : "Failed to delete team",
      });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  getTeamsByAuction,
  getTeamById,
  createTeam,
  updateTeam,
  updateTeamStatus,
  deleteTeam,
};
