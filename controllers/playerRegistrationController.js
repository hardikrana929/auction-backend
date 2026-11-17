const Auction = require("../models/Auction");
const Player = require("../models/Player");

const asyncHandler = require("../utils/asyncHandler");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../utils/cloudinaryUpload");
const { validateImageBuffer } = require("../utils/imageValidation");
const {
  generateRegistrationToken,
  isValidRegistrationToken,
  getClosedReason,
  validatePublicPlayerInput,
} = require("../utils/playerRegistration");

const NOT_VALID_MESSAGE = "This registration link is not valid.";

/* ======================================================================
   ORGANISER SIDE  (admin / the auction's own manager)
   Routes are protected by protectRoute + requireAuctionManager, which has
   already verified the caller may manage req.auction.
   ====================================================================== */

const loadWithToken = (auctionId) =>
  Auction.findById(auctionId).select(
    "name status playerRegistrationToken playerRegistrationOpen",
  );

const linkPayload = async (auction) => {
  const enabled = Boolean(auction.playerRegistrationToken);
  const selfRegisteredCount = await Player.countDocuments({
    auction: auction._id,
    registrationSource: "self_registered",
  });
  return {
    enabled,
    open: enabled && Boolean(auction.playerRegistrationOpen),
    token: enabled ? auction.playerRegistrationToken : null,
    path: enabled ? `/player-registration/${auction.playerRegistrationToken}` : null,
    auctionStatus: auction.status,
    acceptingNow: enabled && getClosedReason(auction) === null,
    selfRegisteredCount,
  };
};

// GET /api/players/registration-link/:auctionId
const getRegistrationLink = asyncHandler(async (req, res) => {
  const auction = await loadWithToken(req.auction._id);
  res.status(200).json({ success: true, link: await linkPayload(auction) });
});

// POST /api/players/registration-link/:auctionId
// Creates the link (idempotent). Body { regenerate: true } replaces the token,
// which immediately stops the previously shared URL from working.
const generateRegistrationLink = asyncHandler(async (req, res) => {
  const regenerate = req.body?.regenerate === true || req.body?.regenerate === "true";
  const auction = await loadWithToken(req.auction._id);

  if (!auction.playerRegistrationToken || regenerate) {
    auction.playerRegistrationToken = generateRegistrationToken();
  }
  auction.playerRegistrationOpen = true;
  await auction.save();

  res.status(200).json({
    success: true,
    message: regenerate
      ? "A new link was generated. The old link no longer works."
      : "Registration link is ready to share.",
    link: await linkPayload(auction),
  });
});

// PATCH /api/players/registration-link/:auctionId   { open: true|false }
const setRegistrationOpen = asyncHandler(async (req, res) => {
  if (typeof req.body?.open !== "boolean") {
    return res
      .status(400)
      .json({ success: false, message: "open must be true or false." });
  }
  const auction = await loadWithToken(req.auction._id);
  if (!auction.playerRegistrationToken) {
    return res.status(400).json({
      success: false,
      message: "Generate a registration link first.",
    });
  }
  auction.playerRegistrationOpen = req.body.open;
  await auction.save();

  res.status(200).json({
    success: true,
    message: req.body.open
      ? "Player registration is now open."
      : "Player registration is now closed.",
    link: await linkPayload(auction),
  });
});

// DELETE /api/players/registration-link/:auctionId
const disableRegistrationLink = asyncHandler(async (req, res) => {
  await Auction.updateOne(
    { _id: req.auction._id },
    {
      $unset: { playerRegistrationToken: 1 },
      $set: { playerRegistrationOpen: false },
    },
  );
  const auction = await loadWithToken(req.auction._id);
  res.status(200).json({
    success: true,
    message: "Registration link removed.",
    link: await linkPayload(auction),
  });
});

/* ======================================================================
   PUBLIC SIDE  (no login — the unguessable token is the credential)
   ====================================================================== */

const findAuctionByToken = (token) => {
  if (!isValidRegistrationToken(token)) return null;
  return Auction.findOne({ playerRegistrationToken: token }).select(
    "name description image date status minimumBid teamBudget startingBudget playerRegistrationOpen",
  );
};

// GET /api/public/player-registration/:token
const getPublicRegistration = asyncHandler(async (req, res) => {
  const auction = await findAuctionByToken(req.params.token);
  if (!auction) {
    return res.status(404).json({ success: false, message: NOT_VALID_MESSAGE });
  }
  const closedReason = getClosedReason(auction);
  res.status(200).json({
    success: true,
    auction: {
      name: auction.name,
      description: auction.description || "",
      image: auction.image || "",
      date: auction.date,
    },
    registration: { open: closedReason === null, closedReason },
  });
});

// POST /api/public/player-registration/:token   (multipart/form-data)
const submitPublicRegistration = asyncHandler(async (req, res) => {
  // Honeypot: real people never see/fill this hidden field, bots usually do.
  // Pretend it worked so the bot learns nothing.
  if (typeof req.body?.website === "string" && req.body.website.trim()) {
    return res
      .status(201)
      .json({ success: true, message: "Registration received." });
  }

  const auction = await findAuctionByToken(req.params.token);
  if (!auction) {
    return res.status(404).json({ success: false, message: NOT_VALID_MESSAGE });
  }
  const closedReason = getClosedReason(auction);
  if (closedReason) {
    return res.status(403).json({
      success: false,
      message:
        closedReason === "disabled"
          ? "Player registration for this auction is closed."
          : "This auction no longer accepts new players.",
      closedReason,
    });
  }

  if (req.file && !validateImageBuffer(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ success: false, message: "Invalid image file" });
  }

  const result = validatePublicPlayerInput(req.body, auction);
  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }
  const { data } = result;

  // One person should not be added twice to the same auction.
  const duplicate = await Player.exists({
    auction: auction._id,
    contactNo: data.contactNo,
  });
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message:
        "A player with this contact number is already registered for this auction.",
    });
  }

  let uploadedPublicId = null;
  try {
    let photo = { url: "", publicId: "" };
    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        "auctionpro/players",
      );
      photo = { url: uploaded.secure_url, publicId: uploaded.public_id };
      uploadedPublicId = uploaded.public_id;
    }

    const player = await Player.create({
      auction: auction._id,
      ...data,
      photo,
      currentBid: 0,
      status: "available",
      soldTo: null,
      soldPrice: 0,
      auctionOrder: 0,
      registrationSource: "self_registered",
    });
    uploadedPublicId = null;

    // Deliberately minimal: do not echo contact details back to a public caller.
    res.status(201).json({
      success: true,
      message: "Registration successful. See you at the auction!",
      player: {
        fullName: player.fullName,
        lastName: player.lastName,
        role: player.role,
      },
    });
  } catch (error) {
    if (uploadedPublicId) {
      try {
        await deleteFromCloudinary(uploadedPublicId);
      } catch (cleanupError) {
        console.error("Self-registration photo cleanup failed:", cleanupError.message);
      }
    }
    throw error;
  }
});

module.exports = {
  getRegistrationLink,
  generateRegistrationLink,
  setRegistrationOpen,
  disableRegistrationLink,
  getPublicRegistration,
  submitPublicRegistration,
};
