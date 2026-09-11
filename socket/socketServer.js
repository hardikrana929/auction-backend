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
            const token = socket.handshake.auth?.token ||
                (authHeader && authHeader.replace(/^Bearer\s+/i, ""));

            if (!token) return next(new Error("Authentication required"));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select("_id name email role isActive");
            if (!user || !user.isActive) return next(new Error("Authentication failed"));

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
