const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { Server } = require("socket.io");
const { registerAuctionSocketEvents } = require("./auctionSocket");

const initializeSocket = (httpServer, corsOrigin) => {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.replace(/^Bearer\s+/i, ""));

      // No token = a visitor on the public live screen. They are allowed to
      // connect, but socket.user stays null so every authenticated handler
      // (auction:join, team:join, ...) rejects them. They can only use
      // "public:join", which exposes nothing beyond "something changed".
      if (!token) {
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select(
        "_id name email role isActive auction tokenVersion",
      );
      if (
        !user ||
        !user.isActive ||
        Number(decoded.tv || 0) !== Number(user.tokenVersion || 0)
      )
        return next(new Error("Authentication failed"));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    registerAuctionSocketEvents(io, socket);
  });

  console.log("Socket.IO initialized successfully");
  return io;
};

module.exports = initializeSocket;
