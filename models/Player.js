const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    // AUCTION

    auction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auction",
      required: [true, "Auction is required"],
    },

    // PERSONAL INFORMATION

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: 100,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: 100,
    },

    photo: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },

    contactNo: {
      type: String,
      trim: true,
      default: "",
    },

    whatsappNo: {
      type: String,
      trim: true,
      default: "",
    },

    villageTown: {
      type: String,
      required: [true, "Village/Town is required"],
      trim: true,
    },

    // CRICKET INFORMATION

    age: {
      type: Number,
      min: 10,
      max: 60,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: "Male",
    },

    role: {
      type: String,
      enum: ["Batsman", "Bowler", "All Rounder", "Wicket Keeper"],
      required: [true, "Player role is required"],
    },

    battingHand: {
      type: String,
      enum: ["Right Hand", "Left Hand", "Not Applicable"],
      default: "Right Hand",
    },

    bowlingStyle: {
      type: String,
      enum: [
        "Right Arm Fast",
        "Right Arm Medium",
        "Left Arm Fast",
        "Left Arm Medium",
        "Right Arm Off Spin",
        "Right Arm Leg Spin",
        "Left Arm Orthodox",
        "Left Arm Chinaman",
        "Does Not Bowl",
      ],
      default: "Does Not Bowl",
    },

    specialization: [
      {
        type: String,
        trim: true,
      },
    ],

    experience: {
      type: Number,
      min: 0,
      default: 0,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // AUCTION INFORMATION

    basePrice: {
      type: Number,
      required: [true, "Base price is required"],
      min: [0, "Base price cannot be negative"],
    },

    currentBid: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    // "Player ID" inside this auction (1, 2, 3...). Used for manual selection.
    auctionNumber: { type: Number, min: 1 },

    // auction - normal player that goes under the hammer
    // icon    - icon player, attached directly to a team (not auctioned)
    // owner   - team owner playing for the team (not auctioned)
    category: {
      type: String,
      enum: ["auction", "icon", "owner"],
      default: "auction",
    },

    // Team an icon player / team owner belongs to (category != auction).
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    // "retained" = icon player / team owner, already part of a team.
    status: {
      type: String,
      enum: ["available", "auctioning", "sold", "unsold", "retained"],
      default: "available",
    },

    soldTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    soldPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    auctionOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    // How this player entered the auction pool: added by an admin/manager,
    // or through the public shareable registration form.
    registrationSource: {
      type: String,
      enum: ["admin", "self_registered"],
      default: "admin",
    },
  },
  {
    timestamps: true,
  },
);

playerSchema.index(
  { auction: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "auctioning",
    },
  },
);

// Auction numbers are unique per auction (players created before this field
// existed simply have none).
playerSchema.index(
  { auction: 1, auctionNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { auctionNumber: { $type: "number" } },
  },
);

module.exports = mongoose.model("Player", playerSchema);
