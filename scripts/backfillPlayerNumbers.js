/**
 * One-off helper: gives every existing player without an auction number
 * (players created before auction numbers existed) the next number of their
 * auction, in creation order. Safe to run more than once.
 *
 *   node scripts/backfillPlayerNumbers.js
 */
require("dotenv").config();
const connectDB = require("../config/db");
const Auction = require("../models/Auction");
const Player = require("../models/Player");
const { reserveAuctionNumbers } = require("../utils/playerNumbers");

(async () => {
  await connectDB();
  const auctions = await Auction.find().select("_id name");
  for (const auction of auctions) {
    const players = await Player.find({
      auction: auction._id,
      auctionNumber: { $exists: false },
    })
      .sort({ createdAt: 1 })
      .select("_id");
    if (!players.length) continue;
    const first = await reserveAuctionNumbers(auction._id, players.length);
    await Player.bulkWrite(
      players.map((player, index) => ({
        updateOne: {
          filter: { _id: player._id },
          update: { $set: { auctionNumber: first + index } },
        },
      })),
    );
    console.log(`${auction.name}: numbered ${players.length} player(s)`);
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
