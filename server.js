const express = require("express");
const http = require("http");

const cors = require("cors");
const dotenv = require("dotenv");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const auctionRoutes = require("./routes/auctionRoutes");
const teamRoutes = require("./routes/teamRoutes");
const playerRoutes = require("./routes/playerRoutes");
const biddingRoutes = require("./routes/biddingRoutes");
const auctionControlRoutes = require("./routes/auctionControlRoutes");
const auctionStatsRoutes = require("./routes/auctionStatsRoutes");
const auctionHistoryRoutes = require("./routes/auctionHistoryRoutes");
const auctionRegistrationRoutes = require("./routes/auctionRegistrationRoutes");
const auctionValidationRoutes = require("./routes/auctionValidationRoutes");
const auctionNotificationRoutes = require("./routes/auctionNotificationRoutes");
const auctionAccessRoutes = require("./routes/auctionAccessRoutes");

const notFound = require("./middleware/notFoundMiddleware");
const errorHandler = require("./middleware/errorMiddleware");

const initializeSocket = require("./socket/socketServer");

//Load evironment variables
dotenv.config();
//Connect to database
connectDB();

const app = express();

const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }))

app.use("/api/auth", authRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/bidding", biddingRoutes);
app.use("/api/auction-control", auctionControlRoutes);
app.use("/api/auction-stats", auctionStatsRoutes)
app.use("/api/auction-history", auctionHistoryRoutes);
app.use("/api/auction-registration", auctionRegistrationRoutes);
app.use("/api/auction-validation", auctionValidationRoutes);
app.use("/api/auction-notification", auctionNotificationRoutes);
app.use("/api/auction-access", auctionAccessRoutes);

//Test Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Playing Cricket....."
    })
})

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

//Socket.IO initialization
const io = initializeSocket(
    server,
    process.env.CLIENT_URL || "*"
);

app.set("io", io);



const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log('Server running successful...');
})

module.exports = app;