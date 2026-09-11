const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protectRoute = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const token = authHeader.split(/\s+/)[1];
        if (!token) return res.status(401).json({ success: false, message: "Authentication required" });

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: error.name === "TokenExpiredError" ? "Authentication token has expired" : "Invalid authentication token",
            });
        }

        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ success: false, message: "Invalid authentication token" });
        if (!user.isActive) return res.status(403).json({ success: false, message: "User is not active." });

        req.user = user;
        next();
    } catch (error) {
        console.error("Protect Route Error:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user?.role === "admin") return next();
    return res.status(403).json({ success: false, message: "Admin access only" });
};

module.exports = { protectRoute, adminOnly };
