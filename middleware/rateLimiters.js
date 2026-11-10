const expressRateLimit = require("express-rate-limit");

const rateLimit = expressRateLimit.rateLimit || expressRateLimit;

// Use the official IPv6-safe helper.
const ipKeyGenerator =
  expressRateLimit.ipKeyGenerator || ((ip) => ip || "unknown");

const identifierKey = (req) =>
  String(
    req.body?.username || req.body?.email || req.body?.identifier || "unknown",
  )
    .trim()
    .toLowerCase();

// Login limiter: per IP + account.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${identifierKey(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

// Wider network-level login protection.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many login attempts from this network. Please try again later.",
  },
});

// General API protection.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bid protection: one limit per authenticated user.
const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) =>
    req.user?._id ? String(req.user._id) : ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many accounts created from this IP. Please try again later.",
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

module.exports = {
  loginLimiter,
  loginIpLimiter,
  apiLimiter,
  bidLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  verifyOtpLimiter,
};
