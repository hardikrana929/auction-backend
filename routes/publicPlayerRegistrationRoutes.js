const express = require("express");

const upload = require("../middleware/uploadMiddleware");
const { playerRegistrationLimiter } = require("../middleware/rateLimiters");
const {
  getPublicRegistration,
  submitPublicRegistration,
} = require("../controllers/playerRegistrationController");

const router = express.Router();

// PUBLIC (no login): the unguessable token in the URL identifies the auction.
router.get("/:token", getPublicRegistration);
router.post(
  "/:token",
  playerRegistrationLimiter,
  upload.single("photo"),
  submitPublicRegistration,
);

module.exports = router;
