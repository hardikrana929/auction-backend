const express = require("express");

const route = express.Router();

const {
    registerUser,
    loginUser,
    getUserProfile,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
} = require("../controllers/authController");
const { protectRoute } = require("../middleware/authMiddleware");
const { loginLimiter, registerLimiter, forgotPasswordLimiter, verifyOtpLimiter } = require("../middleware/rateLimiters");

//Public Routes
route.post("/register", registerLimiter, registerUser);
route.post("/login", loginLimiter, loginUser);
route.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
route.post("/verify-otp", verifyOtpLimiter, verifyResetOtp);
route.post("/reset-password/:token", resetPassword);

//Protected Routes
route.get("/me", protectRoute, getUserProfile);

module.exports = route;