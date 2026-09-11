const express = require("express");

const route = express.Router();

const {
    registerUser,
    loginUser,
    getUserProfile,
    forgotPassword,
    resetPassword,
} = require("../controllers/authController");
const { protectRoute } = require("../middleware/authMiddleware");

//Publid Routes 
route.post("/register", registerUser);
route.post("/login", loginUser);
route.post("/forgot-password", forgotPassword);
route.post("/reset-password/:token", resetPassword);

//Protected Routes
route.get("/me", protectRoute, getUserProfile);

module.exports = route;