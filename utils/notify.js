const AuctionNotification = require("../models/AuctionNotification");
const AuctionTransaction = require("../models/AuctionTransaction");
const AuctionRegistration = require("../models/AuctionRegistration");

/*
|--------------------------------------------------------------------------
| Auction activity: transaction log + per-user notifications
|--------------------------------------------------------------------------
|
| Neither of these was ever written before: AuctionTransaction only had
| readers (auctionHistoryController, auctionStatsController) and
| AuctionNotification only had its manual CRUD routes — nothing created a
| record automatically when a bid was placed or a player was sold/unsold.
| That's why "Auction history" always looked empty and no one got notified.
|
*/

// One row per bid/sold/unsold event, read by getAuctionHistory /
// getSoldPlayersHistory / getUnsoldPlayersHistory / getPlayerTransactionHistory.
const logTransaction = async ({ auction, player, team, type, amount, createdBy, session }) =>
    AuctionTransaction.create(
        [
            {
                auction,
                player,
                team: team || null,
                type,
                amount: Number(amount) || 0,
                createdBy,
            },
        ],
        session ? { session } : undefined,
    );

// Every approved, active team's owner in this auction — the people who
// should hear about what happens to a player. Deduplicated, since one
// account can own more than one approved team.
const getAuctionParticipantOwners = async (auctionId) => {
    const registrations = await AuctionRegistration.find({
        auction: auctionId,
        status: "approved",
    })
        .populate({ path: "team", select: "owner status", match: { status: "active" } })
        .select("team");

    const ownerIds = new Set();

    registrations.forEach((registration) => {
        const ownerId = registration.team?.owner;

        if (ownerId) {
            ownerIds.add(String(ownerId));
        }
    });

    return [...ownerIds];
};

// Creates one AuctionNotification per recipient and pushes it over the
// socket to that user's personal room ("user:<id>", joined in
// socket/auctionSocket.js) so NotificationBell updates live, in addition to
// showing up next time it polls GET /api/auction-notification.
const notifyUsers = async ({ io, auction, player, team, type, recipients, title, message, data }) => {
    const uniqueRecipients = [...new Set((recipients || []).map(String))];

    if (!uniqueRecipients.length) {
        return [];
    }

    const docs = await AuctionNotification.insertMany(
        uniqueRecipients.map((recipient) => ({
            auction,
            recipient,
            team: team || null,
            player: player || null,
            type,
            title,
            message,
            data: data || {},
        })),
    );

    if (io) {
        docs.forEach((doc) => {
            io.to(`user:${doc.recipient}`).emit("auction:notification", {
                _id: doc._id,
                auction: doc.auction,
                recipient: doc.recipient,
                team: doc.team,
                player: doc.player,
                type: doc.type,
                title: doc.title,
                message: doc.message,
                data: doc.data,
                isRead: false,
                createdAt: doc.createdAt,
            });
        });
    }

    return docs;
};

module.exports = { logTransaction, getAuctionParticipantOwners, notifyUsers };
