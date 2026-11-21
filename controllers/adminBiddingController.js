const mongoose = require("mongoose");

const Bid = require("../models/Bid");
const Player = require("../models/Player");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const AuctionRegistration = require("../models/AuctionRegistration");
const AuctionSession = require("../models/AuctionSession");

const { getAuctionRoom, emitPublicUpdate } = require("../socket/auctionSocket");
const {
  logTransaction,
  getAuctionParticipantOwners,
  notifyUsers,
} = require("../utils/notify");
const {
  getOpeningBid,
  getNextRaise,
  getBuyEligibility,
} = require("../utils/adminBidding");

/*
|--------------------------------------------------------------------------
| Admin-controlled bidding
|--------------------------------------------------------------------------
|
| Teams do not bid. The auction admin (or the admin assigned to the auction):
|   1. presses "Bidding" whenever a team raises a hand  -> raiseBid
|   2. can take the last raise back                      -> undoRaise
|   3. presses "Buy Player" on the winning team          -> sellPlayer
|   4. can reverse a wrong sale while the auction is live-> rollbackSale
|
| Every handler runs inside a transaction and only emits socket events AFTER
| the transaction committed.
*/

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const getId = (value) =>
  value ? String(value._id || value.id || value) : null;

const getIo = (req) => req.app.get("io") || req.io || null;

const userId = (req) => req.user?._id || req.user?.id;

const fail = (message, status = 400, code) => {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
};

const sendError = (res, error, fallback) =>
  res.status(error.status || 400).json({
    success: false,
    message: error.message || fallback,
    ...(error.code ? { code: error.code } : {}),
  });

// Loads and validates auction + session + the player currently on the block.
const loadLiveContext = async ({ auctionId, playerId, session }) => {
  if (!mongoose.Types.ObjectId.isValid(auctionId))
    throw fail("Invalid auction ID.");
  if (!mongoose.Types.ObjectId.isValid(playerId))
    throw fail("Invalid player ID.");

  const auction = await Auction.findById(auctionId).session(session);
  if (!auction) throw fail("Auction not found.", 404);
  if (auction.status !== "live") throw fail("Auction is not live.");

  const auctionSession = await AuctionSession.findOne({
    auction: auctionId,
  }).session(session);
  if (auctionSession?.isPaused)
    throw fail("Auction is paused", 409, "AUCTION_PAUSED");

  const player = await Player.findById(playerId).session(session);
  if (!player) throw fail("Player not found.", 404);
  if (String(player.auction) !== String(auctionId))
    throw fail("Player does not belong to this auction.");

  return { auction, auctionSession, player };
};

const latestActiveBid = (auctionId, playerId, session) =>
  Bid.findOne({ auction: auctionId, player: playerId, status: "active" })
    .sort({ createdAt: -1, _id: -1 })
    .session(session);

/*
|--------------------------------------------------------------------------
| RAISE BID  (POST /api/bidding/raise)
|--------------------------------------------------------------------------
*/
const raiseBid = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { auctionId, playerId } = req.body;
    let result;

    await session.withTransaction(async () => {
      const { auction, player } = await loadLiveContext({
        auctionId,
        playerId,
        session,
      });
      if (player.status !== "auctioning")
        throw fail("This player is not currently being auctioned.");

      const latest = await latestActiveBid(auctionId, playerId, session);
      const current = latest
        ? Number(latest.amount)
        : getOpeningBid(player, auction);
      const { increment, nextBid } = getNextRaise(current, auction);
      if (!(increment > 0))
        throw fail("Bid increment is not configured for this auction.");

      const [bid] = await Bid.create(
        [
          {
            auction: auction._id,
            player: player._id,
            team: null,
            bidder: userId(req),
            amount: nextBid,
          },
        ],
        { session },
      );

      player.currentBid = nextBid;
      player.currentBidder = null;
      await player.save({ session });

      await logTransaction({
        auction: auction._id,
        player: player._id,
        team: null,
        type: "bid",
        amount: nextBid,
        createdBy: userId(req),
        session,
      });
      await AuctionSession.updateOne(
        { auction: auctionId },
        { $set: { lastAction: "bid_raised", lastActionAt: new Date() } },
        { session },
      );

      result = {
        bid,
        player,
        currentBid: nextBid,
        ...getNextRaise(nextBid, auction),
      };
    });

    const io = getIo(req);
    if (io) {
      io.to(getAuctionRoom(auctionId)).emit("bid:new", {
        auctionId,
        playerId: result.player._id,
        bid: {
          _id: result.bid._id,
          amount: result.currentBid,
          createdAt: result.bid.createdAt,
        },
        amount: result.currentBid,
        currentBid: result.currentBid,
        nextBid: result.nextBid,
        increment: result.increment,
      });
      emitPublicUpdate(io, auctionId, "bid");
    }

    return res.status(201).json({
      success: true,
      message: "Bid raised.",
      bid: result.bid,
      currentBid: result.currentBid,
      nextBid: result.nextBid,
      increment: result.increment,
    });
  } catch (error) {
    console.error("raiseBid error:", error);
    return sendError(res, error, "Unable to raise bid.");
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| UNDO LAST RAISE  (POST /api/bidding/undo)
|--------------------------------------------------------------------------
*/
const undoRaise = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { auctionId, playerId } = req.body;
    let result;

    await session.withTransaction(async () => {
      const { auction, player } = await loadLiveContext({
        auctionId,
        playerId,
        session,
      });
      if (player.status !== "auctioning")
        throw fail("This player is not currently being auctioned.");

      const latest = await latestActiveBid(auctionId, playerId, session);
      if (!latest) throw fail("There is no raised bid to undo.");

      await Bid.deleteOne({ _id: latest._id }, { session });

      const previous = await latestActiveBid(auctionId, playerId, session);
      const restored = previous
        ? Number(previous.amount)
        : getOpeningBid(player, auction);

      player.currentBid = restored;
      player.currentBidder = null;
      await player.save({ session });

      await logTransaction({
        auction: auction._id,
        player: player._id,
        team: null,
        type: "bid_undo",
        amount: Number(latest.amount),
        createdBy: userId(req),
        session,
      });
      await AuctionSession.updateOne(
        { auction: auctionId },
        { $set: { lastAction: "bid_undone", lastActionAt: new Date() } },
        { session },
      );

      result = {
        player,
        removed: latest,
        currentBid: restored,
        ...getNextRaise(restored, auction),
      };
    });

    const io = getIo(req);
    if (io) {
      io.to(getAuctionRoom(auctionId)).emit("bid:new", {
        auctionId,
        playerId: result.player._id,
        undone: true,
        amount: result.currentBid,
        currentBid: result.currentBid,
        nextBid: result.nextBid,
        increment: result.increment,
      });
      emitPublicUpdate(io, auctionId, "bid");
    }

    return res.status(200).json({
      success: true,
      message: "Last bid removed.",
      currentBid: result.currentBid,
      nextBid: result.nextBid,
      increment: result.increment,
    });
  } catch (error) {
    console.error("undoRaise error:", error);
    return sendError(res, error, "Unable to undo bid.");
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| SELL PLAYER = "BUY PLAYER" for a team  (POST /api/bidding/sell)
|--------------------------------------------------------------------------
| Body: { auctionId, playerId, teamId }
| The player is sold to `teamId` at the current bid. The team's purse is
| reduced by that amount (atomically, so two clicks can never overspend).
*/
const sellPlayer = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { auctionId, playerId, teamId: requestedTeamId } = req.body;
    let result;

    await session.withTransaction(async () => {
      const { auction, player } = await loadLiveContext({
        auctionId,
        playerId,
        session,
      });
      if (player.status !== "auctioning")
        throw fail("Player is not currently being auctioned.");

      const latest = await latestActiveBid(auctionId, playerId, session);

      const teamId = requestedTeamId || getId(latest?.team);
      if (!teamId || !mongoose.Types.ObjectId.isValid(teamId))
        throw fail("Select the team that is buying this player.");

      const team = await Team.findById(teamId).session(session);
      if (!team || String(team.auction) !== String(auctionId))
        throw fail("Team does not belong to this auction.", 404);

      const registration = await AuctionRegistration.findOne({
        auction: auctionId,
        team: team._id,
        status: "approved",
      }).session(session);
      if (!registration)
        throw fail("Team registration is not approved for this auction.", 403);

      const amount = latest
        ? Number(latest.amount)
        : getOpeningBid(player, auction);

      const eligibility = getBuyEligibility({
        team,
        amount,
        maxPlayersPerTeam: auction.maxPlayersPerTeam,
      });
      if (!eligibility.canBuy)
        throw fail(`${team.name}: ${eligibility.reason}.`, 409);

      // Budget is reduced in ONE conditional update, so concurrent requests
      // can never push a purse below zero.
      const updatedTeam = await Team.findOneAndUpdate(
        {
          _id: team._id,
          status: "active",
          remainingBudget: { $gte: amount },
        },
        {
          $inc: { remainingBudget: -amount },
          $addToSet: { players: player._id },
        },
        { new: true, session },
      );
      if (!updatedTeam)
        throw fail(`${team.name}: Not enough budget.`, 409);

      player.status = "sold";
      player.soldTo = updatedTeam._id;
      player.soldPrice = amount;
      player.currentBid = amount;
      player.currentBidder = updatedTeam._id;
      await player.save({ session });

      // Bid trail: the last raise becomes the winning bid of this team. If the
      // player was bought at the opening price (no raise) a bid row is created
      // so history and roll-back stay consistent.
      if (latest) {
        await Bid.updateMany(
          {
            auction: auctionId,
            player: player._id,
            status: "active",
            _id: { $ne: latest._id },
          },
          { $set: { status: "lost" } },
          { session },
        );
        await Bid.updateOne(
          { _id: latest._id },
          { $set: { status: "sold", team: updatedTeam._id } },
          { session },
        );
      } else {
        await Bid.create(
          [
            {
              auction: auction._id,
              player: player._id,
              team: updatedTeam._id,
              bidder: userId(req),
              amount,
              status: "sold",
            },
          ],
          { session },
        );
      }

      await logTransaction({
        auction: auction._id,
        player: player._id,
        team: updatedTeam._id,
        type: "sold",
        amount,
        createdBy: userId(req),
        session,
      });
      await AuctionSession.updateOne(
        { auction: auctionId },
        {
          $inc: { playersSold: 1, playersCompleted: 1 },
          $set: {
            status: "player_sold",
            lastAction: "player_sold",
            lastActionAt: new Date(),
          },
        },
        { session },
      );

      result = { auction, player, team: updatedTeam, soldPrice: amount };
    });

    // ---- after commit: notifications + sockets
    try {
      const ownerIds = await getAuctionParticipantOwners(auctionId);
      const winningOwnerId = result.team.owner ? String(result.team.owner) : null;
      const playerName =
        [result.player.fullName, result.player.lastName]
          .filter(Boolean)
          .join(" ") || "The player";

      if (winningOwnerId)
        await notifyUsers({
          io: getIo(req),
          auction: result.auction._id,
          player: result.player._id,
          team: result.team._id,
          type: "player_sold",
          recipients: [winningOwnerId],
          title: "Player sold to your team!",
          message: `You won ${playerName} for ${formatRupees(result.soldPrice)}.`,
          data: { soldPrice: result.soldPrice, teamId: result.team._id },
        });

      await notifyUsers({
        io: getIo(req),
        auction: result.auction._id,
        player: result.player._id,
        team: result.team._id,
        type: "player_sold",
        recipients: ownerIds.filter((id) => id !== winningOwnerId),
        title: "Player sold",
        message: `${playerName} was sold to ${result.team.name} for ${formatRupees(result.soldPrice)}.`,
        data: { soldPrice: result.soldPrice, teamId: result.team._id },
      });
    } catch (notificationError) {
      console.error("Post-sale notification failed:", notificationError.message);
    }

    const io = getIo(req);
    if (io) {
      try {
        io.to(getAuctionRoom(auctionId)).emit("player:sold", {
          auctionId,
          player: {
            _id: result.player._id,
            id: result.player._id,
            fullName: result.player.fullName,
            status: "sold",
            soldTo: result.team._id,
            soldPrice: result.soldPrice,
          },
          team: {
            _id: result.team._id,
            name: result.team.name,
            remainingBudget: result.team.remainingBudget,
          },
          amount: result.soldPrice,
          soldPrice: result.soldPrice,
        });
        emitPublicUpdate(io, auctionId, "sold");
      } catch (socketError) {
        console.error("Post-sale socket emit failed:", socketError.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Player sold to ${result.team.name}.`,
      player: result.player,
      team: result.team,
      soldPrice: result.soldPrice,
    });
  } catch (error) {
    console.error("sellPlayer error:", error);
    return sendError(res, error, "Unable to sell player.");
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| ROLL BACK A SALE  (POST /api/bidding/rollback)
|--------------------------------------------------------------------------
| Used when a player was sold to the wrong team. While the auction is live:
|  - the money is returned to the team (budget is revoked back),
|  - the player leaves the team's squad,
|  - the player goes back on the block at the price he was sold for (or back
|    into the available pool if another player is already on the block), so
|    the admin can simply press "Buy Player" on the correct team.
*/
const rollbackSale = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { auctionId, playerId } = req.body;
    let result;

    await session.withTransaction(async () => {
      if (!mongoose.Types.ObjectId.isValid(auctionId))
        throw fail("Invalid auction ID.");
      if (!mongoose.Types.ObjectId.isValid(playerId))
        throw fail("Invalid player ID.");

      const auction = await Auction.findById(auctionId).session(session);
      if (!auction) throw fail("Auction not found.", 404);
      if (auction.status !== "live")
        throw fail("A sale can only be rolled back while the auction is live.");

      const player = await Player.findById(playerId).session(session);
      if (!player || String(player.auction) !== String(auctionId))
        throw fail("Player not found in this auction.", 404);
      if (player.status !== "sold" || !player.soldTo)
        throw fail("Only a sold player can be rolled back.");

      const refund = Number(player.soldPrice || 0);
      const previousTeam = await Team.findByIdAndUpdate(
        player.soldTo,
        {
          $inc: { remainingBudget: refund },
          $pull: { players: player._id },
        },
        { new: true, session },
      );
      if (!previousTeam) throw fail("The team that bought this player no longer exists.", 404);

      const onTheBlock = await Player.findOne({
        auction: auctionId,
        status: "auctioning",
        _id: { $ne: player._id },
      }).session(session);

      const auctionSession = await AuctionSession.findOne({
        auction: auctionId,
      }).session(session);

      const backOnBlock = !onTheBlock;
      player.soldTo = null;
      player.soldPrice = 0;
      player.currentBidder = null;
      if (backOnBlock) {
        player.status = "auctioning";
        player.currentBid = refund;
      } else {
        player.status = "available";
        player.currentBid = 0;
      }
      await player.save({ session });

      // Bids of this player become active again (the winning bid no longer has a team).
      await Bid.updateMany(
        { auction: auctionId, player: player._id, status: "sold" },
        { $set: { status: "active", team: null } },
        { session },
      );
      await Bid.updateMany(
        { auction: auctionId, player: player._id, status: "lost" },
        { $set: { status: "active" } },
        { session },
      );

      await logTransaction({
        auction: auction._id,
        player: player._id,
        team: previousTeam._id,
        type: "rollback",
        amount: refund,
        createdBy: userId(req),
        session,
      });

      const sessionUpdate = {
        $inc: { playersSold: -1, playersCompleted: -1 },
        $set: { lastAction: "player_rollback", lastActionAt: new Date() },
      };
      if (backOnBlock) {
        sessionUpdate.$set.currentPlayer = player._id;
        sessionUpdate.$set.currentPlayerIndex = player.auctionOrder || 0;
        sessionUpdate.$set.status = auctionSession?.isPaused
          ? "paused"
          : "player_auction";
      }
      await AuctionSession.updateOne({ auction: auctionId }, sessionUpdate, {
        session,
      });

      result = { auction, player, team: previousTeam, refund, backOnBlock };
    });

    const io = getIo(req);
    if (io) {
      try {
        io.to(getAuctionRoom(auctionId)).emit("player:rollback", {
          auctionId,
          player: {
            _id: result.player._id,
            fullName: result.player.fullName,
            status: result.player.status,
          },
          team: {
            _id: result.team._id,
            name: result.team.name,
            remainingBudget: result.team.remainingBudget,
          },
          refunded: result.refund,
          backOnBlock: result.backOnBlock,
        });
        emitPublicUpdate(io, auctionId, "rollback");
      } catch (socketError) {
        console.error("Rollback socket emit failed:", socketError.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sale rolled back. ${formatRupees(result.refund)} returned to ${result.team.name}.`,
      player: result.player,
      team: result.team,
      refunded: result.refund,
      backOnBlock: result.backOnBlock,
    });
  } catch (error) {
    console.error("rollbackSale error:", error);
    return sendError(res, error, "Unable to roll back sale.");
  } finally {
    await session.endSession();
  }
};

module.exports = { raiseBid, undoRaise, sellPlayer, rollbackSale };
