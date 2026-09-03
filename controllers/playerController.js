const mongoose = require("mongoose");

const Player = require("../models/Player");
const Auction = require("../models/Auction");

// CREATE PLAYER
const createPlayer = async (req, res) => {
    try {
        const {
            auctionId,
            fullName,
            lastName,
            photo,
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

        if (
            !auctionId ||
            !fullName ||
            !lastName ||
            !villageTown ||
            !role
        ) {
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

        if (
            auction.status === "live" ||
            auction.status === "completed" ||
            auction.status === "cancelled"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot add player to a ${auction.status} auction`,
            });
        }

        // BASE PRICE

        const playerBasePrice =
            basePrice !== undefined
                ? Number(basePrice)
                : auction.minimumBid;


        if (isNaN(playerBasePrice) || playerBasePrice <= 0) {
            return res.status(400).json({
                success: false,
                message: "Base price must be greater than 0",
            });
        }

        // Player cannot have base price
        // below auction minimum bid

        if (playerBasePrice < auction.minimumBid) {
            return res.status(400).json({
                success: false,
                message:
                    `Player base price cannot be lower than auction minimum bid of ${auction.minimumBid}`,
            });
        }

        // CREATE PLAYER

        const player = await Player.create({
            auction: auctionId,

            fullName: fullName.trim(),
            lastName: lastName.trim(),

            photo: photo || "",

            contactNo: contactNo || "",
            whatsappNo: whatsappNo || "",

            villageTown: villageTown.trim(),

            age: age || undefined,

            gender: gender || "Male",

            role,

            battingHand:
                battingHand || "Right Hand",

            bowlingStyle:
                bowlingStyle || "Does Not Bowl",

            specialization:
                Array.isArray(specialization)
                    ? specialization
                    : [],

            experience:
                experience !== undefined
                    ? Number(experience)
                    : 0,

            bio: bio || "",

            basePrice: playerBasePrice,

            currentBid: 0,

            status: "available",

            soldTo: null,

            soldPrice: 0,

            auctionOrder:
                auctionOrder !== undefined
                    ? Number(auctionOrder)
                    : 0,
        });


        res.status(201).json({
            success: true,
            message: "Player created successfully",
            player,
        });

    } catch (error) {
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


        const players = await Player.find({
            auction: auctionId,
        }).populate("soldTo", "name logo").sort({ auctionOrder: 1, createdAt: 1, });

        res.status(200).json({
            success: true,
            count: players.length,
            players,
        });

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

        res.status(200).json({
            success: true,
            player,
        });

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

        // GET AUCTION

        const auction = await Auction.findById(
            player.auction
        );


        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // PREVENT UPDATE AFTER AUCTION STARTS

        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot update player during ${auction.status} auction`,
            });
        }

        // PERSONAL INFORMATION

        if (req.body.fullName !== undefined) {
            if (!req.body.fullName.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Full name cannot be empty",
                });
            }

            player.fullName =
                req.body.fullName.trim();
        }

        if (req.body.lastName !== undefined) {
            if (!req.body.lastName.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Last name cannot be empty",
                });
            }

            player.lastName =
                req.body.lastName.trim();
        }

        if (req.body.photo !== undefined) {
            player.photo = req.body.photo;
        }

        if (req.body.contactNo !== undefined) {
            player.contactNo = req.body.contactNo;
        }

        if (req.body.whatsappNo !== undefined) {
            player.whatsappNo =
                req.body.whatsappNo;
        }

        if (req.body.villageTown !== undefined) {
            if (!req.body.villageTown.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Village/Town cannot be empty",
                });
            }

            player.villageTown =
                req.body.villageTown.trim();
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
            player.battingHand =
                req.body.battingHand;
        }

        if (req.body.bowlingStyle !== undefined) {
            player.bowlingStyle =
                req.body.bowlingStyle;
        }

        if (req.body.specialization !== undefined) {
            if (!Array.isArray(req.body.specialization)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Specialization must be an array",
                });
            }

            player.specialization =
                req.body.specialization;
        }

        if (req.body.experience !== undefined) {
            player.experience =
                req.body.experience;
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
                    message:
                        "Base price must be greater than 0",
                });
            }

            if (newBasePrice < auction.minimumBid) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Base price cannot be lower than auction minimum bid of ${auction.minimumBid}`,
                });
            }
            player.basePrice = newBasePrice;
        }

        // AUCTION ORDER

        if (req.body.auctionOrder !== undefined) {
            player.auctionOrder =
                req.body.auctionOrder;
        }

        await player.save();

        res.status(200).json({
            success: true,
            message: "Player updated successfully",
            player,
        });

    } catch (error) {
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

        const allowedStatuses = [
            "available",
            "auctioning",
            "sold",
            "unsold",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid player status",
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

        const auction = await Auction.findById(
            player.auction
        );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Only allow manual status changes
        // before live auction

        if (auction.status === "completed") {
            return res.status(400).json({
                success: false,
                message:
                    "Cannot change player status after auction completion",
            });
        }

        player.status = status;

        // If player is made available again,
        // clear auctioning data only when not sold.

        if (status === "available" || status === "auctioning") {
            player.soldTo = null;
            player.soldPrice = 0;
            player.currentBid = 0;
        }

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
            message:
                "Server error while updating player status",
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

        const auction = await Auction.findById(
            player.auction
        );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Don't delete after auction starts

        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot delete player from a ${auction.status} auction`,
            });
        }

        await player.deleteOne();

        res.status(200).json({
            success: true,
            message: "Player deleted successfully",
        });

    } catch (error) {
        console.error("Delete Player Error:", error);

        res.status(500).json({
            success: false,
            message:
                "Server error while deleting player",
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