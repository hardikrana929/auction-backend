const express = require("express");

const route = express.Router();

const { registerUser, loginUser, getUserProfile } = require("../controllers/authController");
const { protectRoute } = require("../middleware/authMiddleware");

//Publid Routes 
route.post("/register", registerUser);
route.post("/login", loginUser);

//Protected Routes
route.get("/me", protectRoute, getUserProfile);

module.exports = route;