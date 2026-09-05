const {
    Server,
} = require("socket.io");

const {
    registerAuctionSocketEvents,
} = require("./auctionSocket");

// Initialize Socket.IO
const initializeSocket = (
    httpServer,
    corsOrigin
) => {
    const io = new Server(httpServer, {
        cors: {
            origin: corsOrigin,
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Socket connection
    io.on("connection", (socket) => {
        registerAuctionSocketEvents(io, socket);
    });

    console.log("Socket.IO initialized successfully");

    return io;
};

module.exports = initializeSocket;