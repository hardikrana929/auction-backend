const mongoose = require("mongoose");
const Team = require("../models/Team");

/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/

const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

/*
|--------------------------------------------------------------------------
| GET TEAMS BY AUCTION
|--------------------------------------------------------------------------
| GET /api/teams/auction/:auctionId
|--------------------------------------------------------------------------
*/

const getTeamsByAuction = async (req, res) => {
    try {
        const { auctionId } = req.params;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message: "Auction ID is required",
            });
        }

        if (!isValidObjectId(auctionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const teams = await Team.find({
            auction: auctionId,
        })
            .populate("auction", "name date status")
            .populate("owner", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: teams.length,
            teams,
        });
    } catch (error) {
        console.error("Get teams by auction error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load teams",
        });
    }
};

/*
|--------------------------------------------------------------------------
| GET TEAM BY ID
|--------------------------------------------------------------------------
| GET /api/teams/:id
|--------------------------------------------------------------------------
*/

const getTeamById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findById(id)
            .populate("auction", "name date status")
            .populate("owner", "name email");

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            success: true,
            team,
        });
    } catch (error) {
        console.error("Get team error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load team",
        });
    }
};

/*
|--------------------------------------------------------------------------
| CREATE TEAM
|--------------------------------------------------------------------------
| POST /api/teams
|--------------------------------------------------------------------------
*/

const createTeam = async (req, res) => {
    try {
        const {
            name,
            owner,
            auction,
            budget,
            logo,
            status,
        } = req.body;

        if (!name || !auction) {
            return res.status(400).json({
                success: false,
                message: "Team name and auction are required",
            });
        }

        if (!isValidObjectId(auction)) {
            return res.status(400).json({
                success: false,
                message: "Invalid auction ID",
            });
        }

        const existingTeam = await Team.findOne({
            name: name.trim(),
            auction,
        });

        if (existingTeam) {
            return res.status(409).json({
                success: false,
                message: "A team with this name already exists in this auction",
            });
        }

        const team = await Team.create({
            name: name.trim(),
            owner: owner || undefined,
            auction,
            budget: budget ?? 0,
            logo: logo || "",
            status: status || "ACTIVE",
        });

        const populatedTeam = await Team.findById(team._id)
            .populate("auction", "name date status")
            .populate("owner", "name email");

        return res.status(201).json({
            success: true,
            message: "Team created successfully",
            team: populatedTeam,
        });
    } catch (error) {
        console.error("Create team error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Team already exists",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create team",
        });
    }
};

/*
|--------------------------------------------------------------------------
| UPDATE TEAM
|--------------------------------------------------------------------------
| PUT /api/teams/:id
|--------------------------------------------------------------------------
*/

const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const allowedFields = [
            "name",
            "owner",
            "auction",
            "budget",
            "logo",
            "status",
        ];

        const updateData = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        if (updateData.name) {
            updateData.name = updateData.name.trim();
        }

        if (updateData.auction) {
            if (!isValidObjectId(updateData.auction)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid auction ID",
                });
            }
        }

        const team = await Team.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("auction", "name date status")
            .populate("owner", "name email");

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Team updated successfully",
            team,
        });
    } catch (error) {
        console.error("Update team error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update team",
        });
    }
};

/*
|--------------------------------------------------------------------------
| UPDATE TEAM STATUS
|--------------------------------------------------------------------------
| PATCH /api/teams/:id/status
|--------------------------------------------------------------------------
*/

const updateTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required",
            });
        }

        const team = await Team.findByIdAndUpdate(
            id,
            { status },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("auction", "name date status")
            .populate("owner", "name email");

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Team status updated successfully",
            team,
        });
    } catch (error) {
        console.error("Update team status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update team status",
        });
    }
};

/*
|--------------------------------------------------------------------------
| DELETE TEAM
|--------------------------------------------------------------------------
| DELETE /api/teams/:id
|--------------------------------------------------------------------------
*/

const deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid team ID",
            });
        }

        const team = await Team.findByIdAndDelete(id);

        if (!team) {
            return res.status(404).json({
                success: false,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Team deleted successfully",
        });
    } catch (error) {
        console.error("Delete team error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete team",
        });
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