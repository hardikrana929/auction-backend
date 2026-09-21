const crypto = require("crypto");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendPasswordResetOtpEmail } = require("../utils/emailService");

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

/*
|--------------------------------------------------------------------------
| Forgot password with an e-mailed 6-digit code (OTP)
|--------------------------------------------------------------------------
|
|  1) POST /api/auth/forgot-password  { email }
|        -> e-mails a 6-digit code (valid 10 minutes).
|  2) POST /api/auth/verify-otp       { email, otp }
|        -> proves the person owns the mailbox; returns a one-time resetToken.
|  3) POST /api/auth/reset-password/:resetToken   { password }
|        -> sets the new password.
|
| Safety rules:
|  - The code is stored only as an HMAC hash, never in plain text.
|  - 5 wrong tries burn the code; a used code cannot be used again.
|  - A new code can be requested once per minute per account.
|  - Answers never reveal whether an e-mail address has an account.
|
*/

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const hashOtp = (userId, otp) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set on the server");
    }

    return crypto
        .createHmac("sha256", process.env.JWT_SECRET)
        .update(`${userId}:${otp}`)
        .digest("hex");
};

const safeEqual = (a, b) => {
    const first = Buffer.from(String(a));
    const second = Buffer.from(String(b));

    return first.length === second.length && crypto.timingSafeEqual(first, second);
};

// True only for a development server that is being called on localhost.
const isLocalDevRequest = (req) =>
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "::1"].includes(String(req.hostname || ""));

const forgotPassword = async (req, res) => {
    const genericMessage = "If an account exists for this email, a 6-digit verification code has been sent.";

    // Everybody gets the same answer, so nobody can find out which e-mail
    // addresses have an account. Only on a developer's own computer (localhost)
    // the reply also says WHY no code was sent.
    const reply = (reason) => {
        const body = { success: true, message: genericMessage };

        if (reason && isLocalDevRequest(req)) {
            body.devNotice = reason;
        }

        return res.status(200).json(body);
    };

    let otp = "";
    let userEmail = "";

    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!EMAIL_REGEX.test(email)) {
            return reply("That is not a valid e-mail address.");
        }

        const user = await User.findOne({ email, isActive: true }).select("+passwordResetOtpSentAt");
        if (!user) {
            return reply(`No active account uses ${email}, so no code was sent. Use the e-mail address the account was registered with.`);
        }

        // One code per minute.
        if (
            user.passwordResetOtpSentAt &&
            Date.now() - new Date(user.passwordResetOtpSentAt).getTime() < OTP_RESEND_COOLDOWN_MS
        ) {
            return reply("A code was already sent less than a minute ago. Use that code, or wait a minute and press Resend.");
        }

        otp = generateOtp();
        userEmail = user.email;

        user.passwordResetOtp = hashOtp(user._id, otp);
        user.passwordResetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
        user.passwordResetOtpAttempts = 0;
        user.passwordResetOtpSentAt = new Date();
        // A new code cancels any reset token issued earlier.
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        try {
            await sendPasswordResetOtpEmail({ to: user.email, name: user.name, otp });
        } catch (mailError) {
            // The e-mail did not go out, so do not make the user wait a minute to retry.
            user.passwordResetOtpSentAt = null;
            await user.save();
            throw mailError;
        }

        return reply();
    } catch (error) {
        console.error("Forgot Password Error:", error);

        const response = { success: true, message: genericMessage };

        // Local development only (requests made to localhost, never on a deployed
        // server, even if NODE_ENV was left as "development").
        if (isLocalDevRequest(req)) {
            if (otp) {
                // Let the developer finish the flow while e-mail is not set up yet.
                console.warn(`[DEV ONLY] E-mail was not sent. Verification code for ${userEmail} is ${otp}`);

                response.devNotice =
                    `The e-mail could not be sent (${error.message}). The code was printed in the backend terminal instead. ` +
                    "Fix your e-mail settings with: node scripts/testEmail.js you@example.com";
            } else {
                response.devNotice = `The server hit an error before sending the code: ${error.message}`;
            }
        }

        return res.status(200).json(response);
    }
};

const verifyResetOtp = async (req, res) => {
    const invalid = () =>
        res.status(400).json({
            success: false,
            message: "Invalid or expired verification code. Request a new code if needed.",
        });

    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const otp = String(req.body.otp ?? "").trim();

        if (!EMAIL_REGEX.test(email) || !/^\d{6}$/.test(otp)) {
            return invalid();
        }

        const user = await User.findOne({ email, isActive: true }).select(
            "+passwordResetOtp +passwordResetOtpExpires +passwordResetOtpAttempts",
        );

        if (
            !user ||
            !user.passwordResetOtp ||
            !user.passwordResetOtpExpires ||
            new Date(user.passwordResetOtpExpires) <= new Date()
        ) {
            return invalid();
        }

        if (!safeEqual(hashOtp(user._id, otp), user.passwordResetOtp)) {
            user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;

            if (user.passwordResetOtpAttempts >= OTP_MAX_ATTEMPTS) {
                user.passwordResetOtp = null;
                user.passwordResetOtpExpires = null;
            }

            await user.save();

            return invalid();
        }

        // Correct code: burn it and hand out a short-lived, single-use reset token.
        const rawToken = crypto.randomBytes(32).toString("hex");

        user.resetPasswordToken = crypto.createHash("sha256").update(rawToken).digest("hex");
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        user.passwordResetOtp = null;
        user.passwordResetOtpExpires = null;
        user.passwordResetOtpAttempts = 0;
        user.passwordResetOtpSentAt = null;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Code verified. You can now set a new password.",
            resetToken: rawToken,
        });
    } catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
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
    verifyResetOtp,
    resetPassword,
};