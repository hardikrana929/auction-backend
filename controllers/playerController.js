const mongoose = require("mongoose");

const Player = require("../models/Player");
const Auction = require("../models/Auction");
const Team = require("../models/Team");
const AuctionSession = require("../models/AuctionSession");
const { reserveAuctionNumbers } = require("../utils/playerNumbers");
const { planCategoryChange } = require("../utils/playerCategory");

const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");

// CREATE PLAYER
const createPlayer = async (req, res) => {
  let uploadedPhotoPublicId = null;
  try {
    if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image file",
      });
    }

    const {
      auctionId,
      fullName,
      lastName,
      contactNo,
      whatsappNo,
      villageTown,
      age,
      gender,
      role,
      battingHand,
      bowlingStyle,
      specialization,
      experience,
      bio,
      basePrice,
      auctionOrder,
    } = req.body;

    // REQUIRED FIELDS

    if (!auctionId || !fullName || !lastName || !villageTown || !role) {
      return res.status(400).json({
        success: false,
        message:
          "Auction, full name, last name, village/town and role are required",
      });
    }

    // VALIDATE AUCTION ID

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid auction ID",
      });
    }

    // FIND AUCTION

    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // CHECK AUCTION STATUS

    // Players can still be added while the auction is live or completed.
    if (auction.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot add player to a cancelled auction",
      });
    }

    const validPersonName = /^[\p{L}][\p{L} .'-]*$/u;
    if (
      typeof fullName !== "string" ||
      typeof lastName !== "string" ||
      !validPersonName.test(fullName.trim()) ||
      !validPersonName.test(lastName.trim())
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First and last name may contain letters, spaces, apostrophes, periods, and hyphens only.",
      });
    }

    // BASE PRICE

    const playerBasePrice =
      basePrice !== undefined ? Number(basePrice) : auction.minimumBid;

    if (isNaN(playerBasePrice) || playerBasePrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Base price must be greater than 0",
      });
    }

    if (
      playerBasePrice > Number(auction.teamBudget ?? auction.startingBudget)
    ) {
      return res.status(400).json({
        success: false,
        message: `Player base price cannot exceed the team budget of ${auction.teamBudget ?? auction.startingBudget}`,
      });
    }

    // Player cannot have base price
    // below auction minimum bid

    if (playerBasePrice < auction.minimumBid) {
      return res.status(400).json({
        success: false,
        message: `Player base price cannot be lower than auction minimum bid of ${auction.minimumBid}`,
      });
    }

    // UPLOAD PHOTO TO CLOUDINARY
    let photoData = {
      url: "",
      publicId: "",
    };

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "auctionpro/players",
      );

      photoData = { url: result.secure_url, publicId: result.public_id };
      uploadedPhotoPublicId = result.public_id;
    }

    // CREATE PLAYER

    const auctionNumber = await reserveAuctionNumbers(auctionId, 1);

    const player = await Player.create({
      auction: auctionId,
      auctionNumber,

      fullName: fullName.trim(),
      lastName: lastName.trim(),

      photo: photoData,

      contactNo: contactNo || "",
      whatsappNo: whatsappNo || "",

      villageTown: villageTown.trim(),

      age: age || undefined,

      gender: gender || "Male",

      role,

      battingHand: battingHand || "Right Hand",

      bowlingStyle: bowlingStyle || "Does Not Bowl",

      specialization: Array.isArray(specialization) ? specialization : [],

      experience: experience !== undefined ? Number(experience) : 0,

      bio: bio || "",

      basePrice: playerBasePrice,

      currentBid: 0,

      status: "available",

      soldTo: null,

      soldPrice: 0,

      auctionOrder: auctionOrder !== undefined ? Number(auctionOrder) : 0,
    });

    uploadedPhotoPublicId = null;

    // A player added during a live auction joins the running queue.
    if (auction.status === "live") {
      await AuctionSession.updateOne(
        { auction: auctionId },
        { $inc: { totalPlayers: 1 } },
      );
    }
    res
      .status(201)
      .json({ success: true, message: "Player created successfully", player });
  } catch (error) {
    if (uploadedPhotoPublicId) {
      try {
        await deleteFromCloudinary(uploadedPhotoPublicId);
      } catch (cleanupError) {
        console.error("Player photo cleanup failed:", cleanupError.message);
      }
    }
    console.error("Create Player Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while creating player",
    });
  }
};

// GET ALL PLAYERS BY AUCTION

const getPlayersByAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Validate ID

    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid auction ID",
      });
    }

    // Check auction

    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const players = await Player.find({ auction: auctionId })
      .populate("soldTo", "name logo")
      .populate("team", "name logo")
      .sort({ auctionOrder: 1, createdAt: 1 });
    const safePlayers =
      req.user?.role === "admin" || req.user?.role === "auction_manager"
        ? players
        : players.map((item) => {
            const value = item.toObject();
            delete value.contactNo;
            delete value.whatsappNo;
            return value;
          });
    res
      .status(200)
      .json({ success: true, count: safePlayers.length, players: safePlayers });
  } catch (error) {
    console.error("Get Players Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while fetching players",
    });
  }
};

// GET SINGLE PLAYER

const getPlayerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    const player = await Player.findById(id)
      .populate("auction", "name status minimumBid bidIncrement")
      .populate("soldTo", "name logo");

    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    const safePlayer = player.toObject();
    if (req.user?.role !== "admin" && req.user?.role !== "auction_manager") {
      delete safePlayer.contactNo;
      delete safePlayer.whatsappNo;
    }
    res.status(200).json({ success: true, player: safePlayer });
  } catch (error) {
    console.error("Get Player Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while fetching player",
    });
  }
};

// UPDATE PLAYER
const updatePlayer = async (req, res) => {
  let uploadedPhotoPublicId = null;
  let oldPhotoPublicId = null;
  try {
    if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image file",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    const player = await Player.findById(id);

    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    // GET AUCTION

    const auction = await Auction.findById(player.auction);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Profiles can be edited at any time. A player who is on the block or
    // already sold keeps his price / order / category (use roll back first).
    const lockedPlayer = ["auctioning", "sold"].includes(player.status);
    if (
      lockedPlayer &&
      ["basePrice", "auctionOrder"].some((key) => req.body[key] !== undefined)
    ) {
      const changed =
        (req.body.basePrice !== undefined &&
          Number(req.body.basePrice) !== Number(player.basePrice)) ||
        (req.body.auctionOrder !== undefined &&
          Number(req.body.auctionOrder) !== Number(player.auctionOrder));
      if (changed) {
        return res.status(400).json({
          success: false,
          message: `Base price and order cannot be changed while the player is ${player.status}`,
        });
      }
    }

    // PERSONAL INFORMATION

    if (req.body.fullName !== undefined) {
      if (typeof req.body.fullName !== "string" || !req.body.fullName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty",
        });
      }

      player.fullName = req.body.fullName.trim();
    }

    if (req.body.lastName !== undefined) {
      if (typeof req.body.lastName !== "string" || !req.body.lastName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Last name cannot be empty",
        });
      }

      player.lastName = req.body.lastName.trim();
    }

    if (req.file) oldPhotoPublicId = player.photo?.publicId || null;

    if (req.body.contactNo !== undefined) {
      player.contactNo = req.body.contactNo;
    }

    if (req.body.whatsappNo !== undefined) {
      player.whatsappNo = req.body.whatsappNo;
    }

    if (req.body.villageTown !== undefined) {
      if (!req.body.villageTown.trim()) {
        return res.status(400).json({
          success: false,
          message: "Village/Town cannot be empty",
        });
      }

      player.villageTown = req.body.villageTown.trim();
    }

    // CRICKET INFORMATION

    if (req.body.age !== undefined) {
      player.age = req.body.age;
    }

    if (req.body.gender !== undefined) {
      player.gender = req.body.gender;
    }

    if (req.body.role !== undefined) {
      player.role = req.body.role;
    }

    if (req.body.battingHand !== undefined) {
      player.battingHand = req.body.battingHand;
    }

    if (req.body.bowlingStyle !== undefined) {
      player.bowlingStyle = req.body.bowlingStyle;
    }

    if (req.body.specialization !== undefined) {
      if (!Array.isArray(req.body.specialization)) {
        return res.status(400).json({
          success: false,
          message: "Specialization must be an array",
        });
      }

      player.specialization = req.body.specialization;
    }

    if (req.body.experience !== undefined) {
      player.experience = req.body.experience;
    }

    if (req.body.bio !== undefined) {
      player.bio = req.body.bio;
    }

    // BASE PRICE

    if (req.body.basePrice !== undefined) {
      const newBasePrice = Number(req.body.basePrice);

      if (isNaN(newBasePrice) || newBasePrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Base price must be greater than 0",
        });
      }

      if (newBasePrice < auction.minimumBid) {
        return res.status(400).json({
          success: false,
          message: `Base price cannot be lower than auction minimum bid of ${auction.minimumBid}`,
        });
      }
      if (newBasePrice > Number(auction.teamBudget ?? auction.startingBudget)) {
        return res.status(400).json({
          success: false,
          message: `Base price cannot exceed the team budget of ${auction.teamBudget ?? auction.startingBudget}`,
        });
      }
      player.basePrice = newBasePrice;
    }

    // AUCTION ORDER

    if (req.body.auctionOrder !== undefined) {
      player.auctionOrder = req.body.auctionOrder;
    }

    // CATEGORY (auction / icon player / team owner) + TEAM
    let categoryPlan = null;
    if (req.body.category !== undefined || req.body.teamId !== undefined) {
      categoryPlan = planCategoryChange(player, {
        category: req.body.category || undefined,
        teamId: req.body.teamId || undefined,
      });
      if (categoryPlan.error) {
        return res
          .status(400)
          .json({ success: false, message: categoryPlan.error });
      }
      if (categoryPlan.pushToTeam) {
        const target = await Team.findById(categoryPlan.pushToTeam);
        if (!target || String(target.auction) !== String(player.auction)) {
          return res.status(400).json({
            success: false,
            message: "Team does not belong to this auction",
          });
        }
        if (
          Number(auction.maxPlayersPerTeam) > 0 &&
          (target.players || []).length >= Number(auction.maxPlayersPerTeam)
        ) {
          return res.status(409).json({
            success: false,
            message: `${target.name} already has a full squad`,
          });
        }
      }
      Object.assign(player, categoryPlan.changes);
    }

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        "auctionpro/players",
      );
      uploadedPhotoPublicId = result.public_id;
      player.photo = { url: result.secure_url, publicId: result.public_id };
    }
    await player.save();

    if (categoryPlan) {
      if (categoryPlan.pullFromTeam)
        await Team.updateOne(
          { _id: categoryPlan.pullFromTeam },
          { $pull: { players: player._id } },
        );
      if (categoryPlan.pushToTeam)
        await Team.updateOne(
          { _id: categoryPlan.pushToTeam },
          { $addToSet: { players: player._id } },
        );
      // Moving an icon player back to the pool adds him to a live queue.
      if (
        categoryPlan.changes.status === "available" &&
        auction.status === "live"
      )
        await AuctionSession.updateOne(
          { auction: auction._id },
          { $inc: { totalPlayers: 1 } },
        );
    }
    if (oldPhotoPublicId) {
      try {
        await deleteFromCloudinary(oldPhotoPublicId);
      } catch (deleteError) {
        console.error("Old player photo cleanup failed:", deleteError.message);
      }
    }
    uploadedPhotoPublicId = null;

    res.status(200).json({
      success: true,
      message: "Player updated successfully",
      player,
    });
  } catch (error) {
    if (uploadedPhotoPublicId) {
      try {
        await deleteFromCloudinary(uploadedPhotoPublicId);
      } catch (cleanupError) {
        console.error("New player photo cleanup failed:", cleanupError.message);
      }
    }
    console.error("Update Player Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while updating player",
    });
  }
};

// UPDATE PLAYER STATUS
const updatePlayerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Only transitions that don't require touching a team's
    // budget/roster are allowed through this endpoint.
    const allowedStatuses = ["available", "auctioning"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid player status. Use the bidding endpoints (/api/bidding/sell, /api/bidding/unsold) to mark a player sold or unsold.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    const player = await Player.findById(id);

    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    const auction = await Auction.findById(player.auction);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // A player who has already been sold or marked unsold should
    // only move again via the bidding flow (e.g. re-auctioning an
    // unsold player), not via this manual status endpoint.
    if (player.status === "sold") {
      return res.status(400).json({
        success: false,
        message: "Cannot manually change the status of a sold player",
      });
    }

    if (player.status === "retained") {
      return res.status(400).json({
        success: false,
        message:
          "Icon players and team owners are not auctioned. Change their category instead.",
      });
    }

    // During a live / completed auction the only manual move allowed is putting
    // an unsold player back into the pool so he can be auctioned again.
    if (auction.status === "live" || auction.status === "completed") {
      if (!(status === "available" && player.status === "unsold")) {
        return res.status(400).json({
          success: false,
          message: `During a ${auction.status} auction only an unsold player can be moved back to available`,
        });
      }
    }

    player.status = status;
    player.soldTo = null;
    player.soldPrice = 0;
    player.currentBid = 0;

    await player.save();

    res.status(200).json({
      success: true,
      message: `Player status changed to ${status}`,
      player,
    });
  } catch (error) {
    console.error("Player Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while updating player status",
    });
  }
};

// DELETE PLAYER

const deletePlayer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    const player = await Player.findById(id);

    if (!player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    const auction = await Auction.findById(player.auction);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // A player on the block or already sold is part of the auction record.
    if (["auctioning", "sold"].includes(player.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a ${player.status} player`,
      });
    }
    if (player.photo?.publicId) {
      try {
        await deleteFromCloudinary(player.photo.publicId);
      } catch (error) {
        console.error("Player photo deletion failed:", error);
      }
    }

    await Player.findByIdAndDelete(id);

    if (player.status === "retained" && player.team) {
      await Team.updateOne(
        { _id: player.team },
        { $pull: { players: player._id } },
      );
    } else if (auction.status === "live") {
      await AuctionSession.updateOne(
        { auction: auction._id, totalPlayers: { $gt: 0 } },
        { $inc: { totalPlayers: -1 } },
      );
    }

    res.status(200).json({
      success: true,
      message: "Player deleted successfully",
    });
  } catch (error) {
    console.error("Delete Player Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while deleting player",
    });
  }
};

module.exports = {
  createPlayer,
  getPlayersByAuction,
  getPlayerById,
  updatePlayer,
  updatePlayerStatus,
  deletePlayer,
};
