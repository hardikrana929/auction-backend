const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const Auction = require("../models/Auction");
const AuctionRegistration = require("../models/AuctionRegistration");
const Team = require("../models/Team");

// Auction Room Helpers
const getAuctionRoom = (auctionId) => {
  return `auction:${auctionId}`;
};

const getTeamRoom = (teamId) => {
  return `team:${teamId}`;
};

// Public (no login) live screen room. It only ever receives a tiny
// "public:update" ping; the page then re-reads GET /api/public/live/:id, which
// returns just the player details and current bid.
const getPublicRoom = (auctionId) => {
  return `public:auction:${auctionId}`;
};

// Validate Auction Access
const isValidAuctionId = (auctionId) => {
  return typeof auctionId === "string" && /^[a-fA-F0-9]{24}$/.test(auctionId);
};

// Join Auction Room
const joinAuction = async (socket, auctionId) => {
  try {
    if (!socket.user) {
      socket.emit("auction:error", { message: "Authentication required" });
      return;
    }

    if (!isValidAuctionId(auctionId)) {
      socket.emit("auction:error", {
        message: "Invalid auction ID",
      });

      return;
    }

    const auction = await Auction.findById(auctionId);

    if (!auction) {
      socket.emit("auction:error", {
        message: "Auction not found",
      });

      return;
    }

    const isAdmin = socket.user.role === "admin";
    const isManager =
      socket.user.role === "auction_manager" &&
      String(auction.assignedUser) === String(socket.user._id) &&
      String(socket.user.auction) === String(auction._id);
    const isCreator =
      auction.createdBy?.toString() === socket.user._id.toString();
    const ownTeamIds = await Team.distinct("_id", {
      auction: auctionId,
      owner: socket.user._id,
    });
    const registration = await AuctionRegistration.findOne({
      auction: auctionId,
      status: "approved",
      $or: [{ registeredBy: socket.user._id }, { team: { $in: ownTeamIds } }],
    });

    // Participants may enter the live room only after the auction starts.
    // Admins and the auction creator retain access for control/monitoring.
    if (!isAdmin && !isManager && !isCreator) {
      if (auction.status !== "live") {
        socket.emit("auction:error", { message: "Auction is not live" });
        return;
      }

      if (!registration) {
        socket.emit("auction:error", {
          message: "Not authorized to join this auction",
        });
        return;
      }
    }

    socket.join(getAuctionRoom(auctionId));

    socket.currentAuctionId = auctionId;

    socket.emit("auction:joined", {
      success: true,
      auctionId,
      room: getAuctionRoom(auctionId),
    });

    console.log(`Socket ${socket.id} joined auction ${auctionId}`);
  } catch (error) {
    console.error("Join Auction Socket Error:", error);

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
    if (!socket.user) {
      socket.emit("team:error", { message: "Authentication required" });
      return;
    }

    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      socket.emit("team:error", {
        message: "Invalid team ID",
      });

      return;
    }

    const team = await Team.findById(teamId).select("owner status");
    if (!team) {
      socket.emit("team:error", { message: "Team not found" });
      return;
    }

    if (
      socket.user.role !== "admin" &&
      String(team.owner || "") !== socket.user._id.toString()
    ) {
      socket.emit("team:error", {
        message: "Not authorized to join this team",
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

// Join the public live room (works without login)
const joinPublicAuction = async (socket, auctionId) => {
  try {
    if (!isValidAuctionId(auctionId)) {
      socket.emit("public:error", { message: "Invalid auction ID" });
      return;
    }

    const auction = await Auction.findById(auctionId).select("status");
    if (!auction || ["draft", "cancelled"].includes(auction.status)) {
      socket.emit("public:error", { message: "Auction not found" });
      return;
    }

    socket.join(getPublicRoom(auctionId));
    socket.emit("public:joined", { success: true, auctionId });
  } catch (error) {
    console.error("Join Public Auction Socket Error:", error);
    socket.emit("public:error", { message: "Unable to join live auction" });
  }
};

// Register Socket Events
const registerAuctionSocketEvents = (io, socket) => {
  // Keep authenticated users in a private notification room so
  // emitNewNotification() can deliver real-time notifications.
  if (socket.user?._id) {
    socket.join(`user:${socket.user._id}`);
  }

  console.log(`Socket connected: ${socket.id}`);

  // Public live screen (anonymous visitors allowed)
  socket.on("public:join", async (payload) => {
    await joinPublicAuction(socket, payload?.auctionId);
  });

  socket.on("public:leave", (payload) => {
    if (isValidAuctionId(payload?.auctionId))
      socket.leave(getPublicRoom(payload.auctionId));
  });

  // Join auction
  socket.on("auction:join", async (payload) => {
    await joinAuction(socket, payload?.auctionId);
  });

  // Leave auction
  socket.on("auction:leave", (payload) => {
    leaveAuction(socket, payload?.auctionId);
  });

  // Join team
  socket.on("team:join", async (payload) => {
    await joinTeam(socket, payload?.teamId);
  });

  // Leave team
  socket.on("team:leave", (payload) => {
    leaveTeam(socket, payload?.teamId);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
};

// Broadcast helpers

const emitAuctionStarted = (io, auctionId, data = {}) => {
  io.to(getAuctionRoom(auctionId)).emit("auction:started", {
    auctionId,
    ...data,
  });
};

const emitAuctionPaused = (io, auctionId, data = {}) => {
  io.to(getAuctionRoom(auctionId)).emit("auction:paused", {
    auctionId,
    ...data,
  });
};

const emitAuctionResumed = (io, auctionId, data = {}) => {
  io.to(getAuctionRoom(auctionId)).emit("auction:resumed", {
    auctionId,
    ...data,
  });
};

const emitAuctionCompleted = (io, auctionId, data = {}) => {
  io.to(getAuctionRoom(auctionId)).emit("auction:completed", {
    auctionId,
    ...data,
  });
};

const emitPlayerStarted = (io, auctionId, player) => {
  io.to(getAuctionRoom(auctionId)).emit("player:started", {
    auctionId,
    player,
  });
};

const emitNewBid = (io, auctionId, bid) => {
  io.to(getAuctionRoom(auctionId)).emit("bid:new", {
    auctionId,
    bid,
  });
};

const emitPlayerSold = (io, auctionId, data) => {
  io.to(getAuctionRoom(auctionId)).emit("player:sold", {
    auctionId,
    ...data,
  });
};

const emitPlayerUnsold = (io, auctionId, data) => {
  io.to(getAuctionRoom(auctionId)).emit("player:unsold", {
    auctionId,
    ...data,
  });
};

const emitNextPlayer = (io, auctionId, player) => {
  io.to(getAuctionRoom(auctionId)).emit("auction:next-player", {
    auctionId,
    player,
  });
};

// Tell public viewers that something changed (they re-fetch the safe public state).
const emitPublicUpdate = (io, auctionId, reason = "update") => {
  if (!io || !auctionId) return;
  io.to(getPublicRoom(auctionId)).emit("public:update", {
    auctionId: String(auctionId),
    reason,
  });
};

const emitNewNotification = (io, userId, notification) => {
  io.to(`user:${userId}`).emit("notification:new", notification);
};

module.exports = {
  registerAuctionSocketEvents,

  getAuctionRoom,
  getTeamRoom,
  getPublicRoom,
  emitPublicUpdate,

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
