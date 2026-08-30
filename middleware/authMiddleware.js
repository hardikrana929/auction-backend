const jwt = require("jsonwebtoken");
const User = require("../models/User");

//Protect routes
const protectRoute = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer")) {
            return res.status(401).json({
                success: false,
                message: "Not authorized, Token Missing"
            });
        }
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            })
        }
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "User is not active."
            })
        }
        req.user = user;
        next();
    } catch (error) {
        console.error("Protect Route Error :", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

//Admin Middleware
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: "Admin access only"
        });
    }

}

module.exports = { protectRoute, adminOnly };