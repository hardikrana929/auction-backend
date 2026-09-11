const mongoose = require("mongoose");

const connectDB = async () => {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
        });
        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        throw error;
    }
};

module.exports = connectDB;
