const mongoose = require("mongoose");

const Auction = require("../models/Auction");
const AuctionRegistration = require("../models/AuctionRegistration");

// Auction Room Helpers
const getAuctionRoom = (auctionId) => {
    return `auction:${auctionId}`;
};

const getTeamRoom = (teamId) => {
    return `team:${teamId}`;
};

// Validate Auction Access
const isValidAuctionId = (auctionId) => {
    return (
        auctionId &&
        mongoose.Types.ObjectId.isValid(auctionId)
    );
};

// Join Auction Room
const joinAuction = async (socket, auctionId) => {
    try {
        if (!isValidAuctionId(auctionId)) {
            socket.emit("auction:error", {
                message: "Invalid auction ID",
            });

            return;
        }

        const auction = await Auction.findById(
            auctionId
        );

        if (!auction) {
            socket.emit("auction:error", {
                message: "Auction not found",
            });

            return;
        }

        socket.join(getAuctionRoom(auctionId));

        socket.currentAuctionId = auctionId;

        socket.emit("auction:joined", {
            success: true,
            auctionId,
            room: getAuctionRoom(auctionId),
        });

        console.log(
            `Socket ${socket.id} joined auction ${auctionId}`
        );
    } catch (error) {
        console.error(
            "Join Auction Socket Error:",
            error
        );

        socket.emit("auction:error", {
            message: "Unable to join auction",
        });
    }
};

// Leave Auction Room
const leaveAuction = (socket, auctionId) => {
    if (!auctionId) {
        return;
    }

    socket.leave(getAuctionRoom(auctionId));

    if (socket.currentAuctionId === auctionId) {
        socket.currentAuctionId = null;
    }

    socket.emit("auction:left", {
        success: true,
        auctionId,
    });

    console.log(`Socket ${socket.id} left auction ${auctionId}`);
};

// Join Team Room
const joinTeam = async (socket, teamId) => {
    try {
        if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
            socket.emit("team:error", {
                message: "Invalid team ID",
            });

            return;
        }

        socket.join(getTeamRoom(teamId));

        socket.currentTeamId = teamId;

        socket.emit("team:joined", {
            success: true,
            teamId,
            room: getTeamRoom(teamId),
        });

        console.log(`Socket ${socket.id} joined team ${teamId}`);
    } catch (error) {
        console.error("Join Team Socket Error:", error);

        socket.emit("team:error", {
            message: "Unable to join team",
        });
    }
};

// Leave Team Room
const leaveTeam = (socket, teamId) => {
    if (!teamId) {
        return;
    }

    socket.leave(getTeamRoom(teamId));

    if (socket.currentTeamId === teamId) {
        socket.currentTeamId = null;
    }

    socket.emit("team:left", {
        success: true,
        teamId,
    });
};

// Register Socket Events
const registerAuctionSocketEvents = (io, socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join auction
    socket.on(
        "auction:join",
        async ({ auctionId }) => {
            await joinAuction(
                socket,
                auctionId
            );
        }
    );

    // Leave auction
    socket.on(
        "auction:leave",
        ({ auctionId }) => {
            leaveAuction(
                socket,
                auctionId
            );
        }
    );

    // Join team
    socket.on(
        "team:join",
        async ({ teamId }) => {
            await joinTeam(
                socket,
                teamId
            );
        }
    );

    // Leave team
    socket.on(
        "team:leave",
        ({ teamId }) => {
            leaveTeam(
                socket,
                teamId
            );
        }
    );

    // Disconnect
    socket.on("disconnect", () => {
        console.log(
            `Socket disconnected: ${socket.id}`
        );
    });
};

// Broadcast helpers

const emitAuctionStarted = (io, auctionId, data = {}) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "auction:started",
        {
            auctionId,
            ...data,
        }
    );
};

const emitAuctionPaused = (io, auctionId, data = {}) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "auction:paused",
        {
            auctionId,
            ...data,
        }
    );
};

const emitAuctionResumed = (io, auctionId, data = {}) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "auction:resumed",
        {
            auctionId,
            ...data,
        }
    );
};

const emitAuctionCompleted = (io, auctionId, data = {}) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "auction:completed",
        {
            auctionId,
            ...data,
        }
    );
};

const emitPlayerStarted = (io, auctionId, player) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "player:started",
        {
            auctionId,
            player,
        }
    );
};

const emitNewBid = (io, auctionId, bid) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "bid:new",
        {
            auctionId,
            bid,
        }
    );
};

const emitPlayerSold = (io, auctionId, data) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "player:sold",
        {
            auctionId,
            ...data,
        }
    );
};

const emitPlayerUnsold = (io, auctionId, data) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "player:unsold",
        {
            auctionId,
            ...data,
        }
    );
};

const emitNextPlayer = (io, auctionId, player) => {
    io.to(getAuctionRoom(auctionId)).emit(
        "auction:next-player",
        {
            auctionId,
            player,
        }
    );
};

const emitNewNotification = (io, userId, notification) => {
    io.to(`user:${userId}`).emit(
        "notification:new",
        notification
    );
};

module.exports = {
    registerAuctionSocketEvents,

    getAuctionRoom,
    getTeamRoom,

    emitAuctionStarted,
    emitAuctionPaused,
    emitAuctionResumed,
    emitAuctionCompleted,

    emitPlayerStarted,
    emitNewBid,
    emitPlayerSold,
    emitPlayerUnsold,
    emitNextPlayer,

    emitNewNotification,
};