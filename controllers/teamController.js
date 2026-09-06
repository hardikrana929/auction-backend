const mongoose = require("mongoose");

const Team = require("../models/Team");
const Auction = require("../models/Auction");

const {
    uploadToCloudinary,
    deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");

// CREATE TEAM

const createTeam = async (req, res) => {
    try {
        const { auctionId, name, ownerName } = req.body;

        // Validate required fields

        if (!auctionId || !name || !ownerName) {
            return res.status(400).json({
                success: false,
                message: "Auction, Team name and Owner name are required",
            });
        }

        // Validate Auction ID

        if (!mongoose.Types.ObjectId.isValid(auctionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        // Find Auction

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Check auction status

        if (
            auction.status === "live" ||
            auction.status === "completed" ||
            auction.status === "cancelled"
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot add team to a ${auction.status} auction`,
            });
        }

        // Check team limit

        const teamCount = await Team.countDocuments({
            auction: auctionId,
        });

        if (teamCount >= auction.maxTeams) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${auction.maxTeams} teams are allowed`,
            });
        }

        // Check duplicate team name

        const existingTeam = await Team.findOne({
            auction: auctionId,
            name: {
                $regex: `^${name.trim()}$`,
                $options: "i",
            },
        });

        if (existingTeam) {
            return res.status(400).json({
                success: false,
                message: "Team name already exists in this auction",
            });
        }

        //Add team logo to cloudinary if provided
        let logoData = {
            url: "",
            publicId: "",
        };

        if (req.file) {
            const result = await uploadToCloudinary(
                req.file.buffer,
                "auctionpro/teams"
            );

            logoData = {
                url: result.secure_url,
                publicId: result.public_id,
            };
        }

        // Create Team

        const team = await Team.create({
            auction: auctionId,
            name: name.trim(),
            logo: logoData,
            ownerName: ownerName.trim(),

            // Get budget from auction
            totalBudget: auction.startingBudget,
            remainingBudget: auction.startingBudget,

            players: [],
            status: "active",
            owner: req.user._id,
        });


        res.status(201).json({
            success: true,
            message: "Team created successfully",
            team,
        });

    } catch (error) {
        console.error("Create Team Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while creating team",
        });
    }
};

// GET ALL TEAMS OF AN AUCTION

const getTeamsByAuction = async (req, res) => {
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

        const teams = await Team.find({
            auction: auctionId,
        }).populate("players").sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            count: teams.length,
            teams,
        });

    } catch (error) {
        console.error("Get Teams Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while fetching teams",
        });
    }
};

// GET SINGLE TEAM

const getTeamById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findById(id).populate("auction").populate("players");

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        res.status(200).json({
            success: true,
            team,
        });

    } catch (error) {
        console.error("Get Team Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while fetching team",
        });
    }
};


// UPDATE TEAM

const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;

        const { name, ownerName } = req.body;

        // Validate ID

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }


        const team = await Team.findById(id);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        // Get auction
        const auction = await Auction.findById(team.auction);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Don't update during live/completed auction
        if (auction.status === "live" || auction.status === "completed") {
            return res.status(400).json({
                success: false,
                message: `Cannot update team during ${auction.status} auction`,
            });
        }

        // Update name

        if (name !== undefined) {
            const trimmedName = name.trim();

            if (!trimmedName) {
                return res.status(400).json({
                    success: false,
                    message: "Team name cannot be empty",
                });
            }


            const duplicateTeam = await Team.findOne({
                auction: team.auction,
                name: {
                    $regex: `^${trimmedName}$`,
                    $options: "i",
                },
                _id: {
                    $ne: team._id,
                },
            });


            if (duplicateTeam) {
                return res.status(400).json({
                    success: false,
                    message: "Team name already exists",
                });
            }


            team.name = trimmedName;
        }


        // Update other fields

        if (req.file) {
            // Delete old Cloudinary image
            if (team.logo?.publicId) {
                try {
                    await deleteFromCloudinary(
                        team.logo.publicId
                    );
                } catch (deleteError) {
                    console.error(
                        "Old team logo delete error:",
                        deleteError
                    );
                }
            }

            // Upload new image
            const result = await uploadToCloudinary(
                req.file.buffer,
                "auctionpro/teams"
            );

            team.logo = {
                url: result.secure_url,
                publicId: result.public_id,
            };
        }

        if (ownerName !== undefined) {
            if (!ownerName.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Owner name cannot be empty",
                });
            }

            team.ownerName = ownerName.trim();
        }

        await team.save();

        res.status(200).json({
            success: true,
            message: "Team updated successfully",
            team,
        });

    } catch (error) {
        console.error("Update Team Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while updating team",
        });
    }
};


// UPDATE TEAM STATUS

const updateTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;


        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team status",
            });
        }


        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findById(id);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        const auction = await Auction.findById(team.auction);

        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot change team status during ${auction.status} auction`,
            });
        }


        team.status = status;

        await team.save();


        res.status(200).json({
            success: true,
            message: `Team ${status} successfully`,
            team,
        });

    } catch (error) {
        console.error("Team Status Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while updating team status",
        });
    }
};

// DELETE TEAM

const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findById(id);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }


        const auction = await Auction.findById(team.auction);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }


        // Prevent deleting team after auction starts

        if (
            auction.status === "live" ||
            auction.status === "completed"
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete team from a ${auction.status} auction`,
            });
        }


        // Don't delete team if players exist

        if (team.players.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete team because players are assigned",
            });
        }
        if (team.logo?.publicId) {
            try {
                await deleteFromCloudinary(
                    team.logo.publicId
                );
            } catch (error) {
                console.error(
                    "Team logo deletion failed:",
                    error
                );
            }
        }


        await Team.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Team deleted successfully",
        });

    } catch (error) {
        console.error("Delete Team Error:", error);

        res.status(500).json({
            success: false,
            message: "Server error while deleting team",
        });
    }
};


module.exports = {
    createTeam,
    getTeamsByAuction,
    getTeamById,
    updateTeam,
    updateTeamStatus,
    deleteTeam,
};