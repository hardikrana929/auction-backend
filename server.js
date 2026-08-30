const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");

//Load evironment variables
dotenv.config();
//Connect to database
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

//Test Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Playing Cricket....."
    })
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('Server running successful...');
})

module.exports = app;