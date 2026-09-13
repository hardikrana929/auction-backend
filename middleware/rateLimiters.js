const rateLimit = require("express-rate-limit");

// Login: guards against credential stuffing / brute force.
// Keyed by IP; tighten further (e.g. by IP+email) if you see abuse.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please try again later." },
});

// Register: prevents mass account creation from a single source.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many accounts created from this IP. Please try again later." },
});

// Forgot password: this is the one that matters most — without it,
// an attacker can spam any known email address with reset links.
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." },
});

module.exports = { loginLimiter, registerLimiter, forgotPasswordLimiter };