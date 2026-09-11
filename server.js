const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

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

const app = express();
const server = http.createServer(app);

const configuredOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

const allowedOrigins = [...new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...configuredOrigins,
])];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/bidding", biddingRoutes);
app.use("/api/auction-control", auctionControlRoutes);
app.use("/api/auction-stats", auctionStatsRoutes);
app.use("/api/auction-history", auctionHistoryRoutes);
app.use("/api/auction-registration", auctionRegistrationRoutes);
app.use("/api/auction-validation", auctionValidationRoutes);
app.use("/api/auction-notification", auctionNotificationRoutes);
app.use("/api/auction-access", auctionAccessRoutes);

app.get("/", (req, res) => {
    res.status(200).json({ success: true, message: "Playing Cricket....." });
});

app.use(notFound);
app.use(errorHandler);

const io = initializeSocket(server, allowedOrigins);
app.set("io", io);

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not configured");
        }

        await connectDB();
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`AuctionPro server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server startup error:", error);
        process.exit(1);
    }
};

if (require.main === module) {
    startServer();
}

module.exports = app;
