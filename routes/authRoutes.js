const express = require("express");

const route = express.Router();

const {
  registerUser,
  loginUser,
  getUserProfile,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  logout,
  createAdmin,
  auctionLogin,
} = require("../controllers/authController");
const { protectRoute, adminOnly } = require("../middleware/authMiddleware");
const {
  loginLimiter,
  loginIpLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  verifyOtpLimiter,
} = require("../middleware/rateLimiters");

//Public Routes
route.post("/register", registerLimiter, registerUser);
route.post("/login", loginIpLimiter, loginLimiter, loginUser);
route.post("/auction-login", loginIpLimiter, loginLimiter, auctionLogin);
route.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
route.post("/verify-otp", verifyOtpLimiter, verifyResetOtp);
route.post("/reset-password/:token", resetPassword);

//Protected Routes
route.get("/me", protectRoute, getUserProfile);
route.post("/logout", protectRoute, logout);
route.post("/admins", protectRoute, adminOnly, createAdmin);

module.exports = route;
