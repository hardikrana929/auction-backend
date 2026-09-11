const crypto = require("crypto");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendPasswordResetEmail } = require("../utils/emailService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
});

const registerUser = async (req, res) => {
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address" });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Unable to create account with these details" });
        }

        const user = await User.create({ name, email, password });

        return res.status(201).json({
            success: true,
            message: "User Registered Successfully",
            user: publicUser(user),
            token: generateToken(user._id),
        });
    } catch (error) {
        console.error("Register Error:", error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "Unable to create account with these details" });
        }
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

const loginUser = async (req, res) => {
    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const user = await User.findOne({ email }).select("+password");
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: "Invalid Email or Password" });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "User is not active." });
        }

        return res.status(200).json({
            success: true,
            message: "Login Successful",
            user: publicUser(user),
            token: generateToken(user._id),
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("Get User Profile Error:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

const forgotPassword = async (req, res) => {
    const genericMessage = "If an account exists for this email, a password reset link has been sent.";

    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!EMAIL_REGEX.test(email)) {
            return res.status(200).json({ success: true, message: genericMessage });
        }

        const user = await User.findOne({ email, isActive: true });
        if (!user) return res.status(200).json({ success: true, message: genericMessage });

        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            resetUrl: `${process.env.CLIENT_URL.replace(/\/$/, "")}/reset-password/${rawToken}`,
        });

        return res.status(200).json({ success: true, message: genericMessage });
    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(200).json({ success: true, message: genericMessage });
    }
};

const resetPassword = async (req, res) => {
    try {
        const rawToken = typeof req.params.token === "string" ? req.params.token : "";
        const newPassword = typeof req.body.password === "string" ? req.body.password : "";

        if (!rawToken || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: "A valid token and password of at least 8 characters are required" });
        }

        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() },
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired password reset token" });
        }

        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        return res.status(200).json({ success: true, message: "Password reset successfully. Please log in with your new password." });
    } catch (error) {
        console.error("Reset Password Error:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getUserProfile,
    forgotPassword,
    resetPassword,
};
