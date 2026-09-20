const mongoose = require("mongoose");

const Bid = require("../models/Bid");
const Player = require("../models/Player");
const Team = require("../models/Team");
const Auction = require("../models/Auction");
const AuctionRegistration = require("../models/AuctionRegistration");

// NOTE: socketServer.js only exports initializeSocket(), so importing
// getAuctionRoom from it gave `undefined` and crashed right after a bid was saved.
// auctionSocket.js is where this helper really lives.
const { getAuctionRoom } = require("../socket/auctionSocket");

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const getId = (value) => {
    if (!value) {
        return null;
    }

    return String(
        value._id ||
        value.id ||
        value,
    );
};

const getUserId = (req) => {
    return getId(
        req.user?._id ||
        req.user?.id ||
        req.user?.userId,
    );
};

const getTeamId = (req) => {
    return getId(
        req.user?.teamId ||
        req.user?.team?._id ||
        req.user?.team?.id,
    );
};

/*
|--------------------------------------------------------------------------
| Which team may this user bid for?
|--------------------------------------------------------------------------
|
| The frontend does not send a teamId, and the User model has no team field,
| so the team is looked up from Team.owner. This also stops a user from
| bidding for somebody else's team by sending its id.
|
*/

const resolveOwnTeamId = async ({
    userId,
    auctionId,
    requestedTeamId,
}) => {
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
        return {
            error: { status: 400, message: "Invalid auction ID." },
        };
    }

    const ownTeams = await Team.find({
        auction: auctionId,
        owner: userId,
        status: "active",
    }).select("_id");

    if (!ownTeams.length) {
        return {
            error: {
                status: 403,
                message: "No team is associated with this account.",
            },
        };
    }

    const ownIds = ownTeams.map((team) => String(team._id));

    if (requestedTeamId) {
        if (!ownIds.includes(String(requestedTeamId))) {
            return {
                error: {
                    status: 403,
                    message: "You can only bid for your own team.",
                },
            };
        }

        return { teamId: String(requestedTeamId) };
    }

    const approved = await AuctionRegistration.find({
        auction: auctionId,
        team: { $in: ownIds },
        status: "approved",
    }).select("team");

    const approvedIds = approved.map((item) => String(item.team));

    if (approvedIds.length === 1) {
        return { teamId: approvedIds[0] };
    }

    if (approvedIds.length > 1) {
        return {
            error: {
                status: 400,
                message:
                    "You have more than one approved team in this auction. Please choose a team.",
            },
        };
    }

    return {
        error: {
            status: 403,
            message: "Team registration is not approved for this auction.",
        },
    };
};

const getIo = (req) => {
    return (
        req.app.get("io") ||
        req.io ||
        null
    );
};

/*
|--------------------------------------------------------------------------
| Find approved registration
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Team must be APPROVED for THIS auction.
|
*/

const findApprovedRegistration = async ({
    auctionId,
    teamId,
    session,
}) => {
    const query = {
        auction: auctionId,
        team: teamId,
        status: "approved",
    };

    return AuctionRegistration.findOne(
        query,
    ).session(session);
};

/*
|--------------------------------------------------------------------------
| Validate common bidding conditions
|--------------------------------------------------------------------------
*/

const validateBidContext = async ({
    auctionId,
    playerId,
    teamId,
    session,
}) => {
    if (
        !mongoose.Types.ObjectId.isValid(
            auctionId,
        )
    ) {
        throw new Error(
            "Invalid auction ID.",
        );
    }

    if (
        !mongoose.Types.ObjectId.isValid(
            playerId,
        )
    ) {
        throw new Error(
            "Invalid player ID.",
        );
    }

    if (
        !mongoose.Types.ObjectId.isValid(
            teamId,
        )
    ) {
        throw new Error(
            "Invalid team ID.",
        );
    }

    const auction =
        await Auction.findById(
            auctionId,
        ).session(session);

    if (!auction) {
        throw new Error(
            "Auction not found.",
        );
    }

    if (auction.status !== "live") {
        throw new Error(
            "Auction is not live.",
        );
    }

    const player =
        await Player.findById(
            playerId,
        ).session(session);

    if (!player) {
        throw new Error(
            "Player not found.",
        );
    }

    /*
     * Player must currently be in auction.
     */
    if (
        player.status !== "auctioning"
    ) {
        throw new Error(
            "This player is not currently being auctioned.",
        );
    }

    /*
     * Verify player belongs to this auction.
     *
     * Some projects use auctionId.
     * Some use auction.
     *
     * Support both without weakening
     * validation.
     */
    const playerAuctionId =
        getId(
            player.auctionId ||
            player.auction,
        );

    if (
        playerAuctionId &&
        playerAuctionId !==
        String(auctionId)
    ) {
        throw new Error(
            "Player does not belong to this auction.",
        );
    }

    /*
     * Approved registration check.
     */
    const registration =
        await findApprovedRegistration({
            auctionId,
            teamId,
            session,
        });

    if (!registration) {
        throw new Error(
            "Team registration is not approved for this auction.",
        );
    }

    /*
     * Verify team exists.
     */
    const team =
        await Team.findById(
            teamId,
        ).session(session);

    if (!team) {
        throw new Error(
            "Team not found.",
        );
    }

    /*
     * Make sure this team belongs
     * to the authenticated user when
     * the schema contains user/owner.
     */
    const ownerId =
        getId(
            team.user ||
            team.userId ||
            team.owner ||
            team.ownerId,
        );

    if (
        ownerId &&
        ownerId !==
        getUserId({
            user: {
                _id:
                    team.user ||
                    team.userId ||
                    team.owner ||
                    team.ownerId,
            },
        })
    ) {
        /*
         * Ownership will be checked in
         * placeBid using req.user.
         *
         * This branch intentionally does
         * not reject here because existing
         * Team schemas may not have owner.
         */
    }

    return {
        auction,
        player,
        team,
        registration,
    };
};

/*
|--------------------------------------------------------------------------
| PLACE BID
|--------------------------------------------------------------------------
*/

const placeBid = async (
    req,
    res,
) => {
    const session =
        await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
            teamId: requestedTeamId,
            amount,
        } = req.body;

        /*
         * NEVER trust teamId from frontend.
         *
         * Prefer the team associated with
         * the authenticated user.
         */
        const authenticatedTeamId =
            getTeamId(req);

        let teamId =
            authenticatedTeamId ||
            requestedTeamId;

        if (!auctionId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID is required.",
            });
        }

        if (!playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "Player ID is required.",
            });
        }

        // Normal users: find (and verify) their own team. Admins keep the old behaviour.
        if (req.user?.role !== "admin") {
            const resolved = await resolveOwnTeamId({
                userId: getUserId(req),
                auctionId,
                requestedTeamId: teamId,
            });

            if (resolved.error) {
                return res.status(resolved.error.status).json({
                    success: false,
                    message: resolved.error.message,
                });
            }

            teamId = resolved.teamId;
        }

        if (!teamId) {
            return res.status(403).json({
                success: false,
                message:
                    "No team is associated with this account.",
            });
        }

        const bidAmount =
            Number(amount);

        if (
            !Number.isFinite(bidAmount) ||
            bidAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Bid amount must be a valid positive number.",
            });
        }

        let result;

        await session.withTransaction(
            async () => {
                const {
                    auction,
                    player,
                    team,
                } =
                    await validateBidContext({
                        auctionId,
                        playerId,
                        teamId,
                        session,
                    });

                /*
                 * Current bid.
                 *
                 * If no current bid exists,
                 * use base price.
                 */
                const currentBid =
                    Number(
                        player.currentBid ||
                        player.basePrice ||
                        auction.minimumBid ||
                        0,
                    );

                /*
                 * Bid increment.
                 */
                const increment =
                    Number(
                        auction.bidIncrement ||
                        0,
                    );

                /*
                 * First bid may equal base price.
                 * Every later bid must increase
                 * by at least the increment.
                 */
                const expectedMinimum =
                    player.currentBid &&
                        Number(
                            player.currentBid,
                        ) > 0
                        ? currentBid +
                        increment
                        : currentBid;

                if (
                    bidAmount <
                    expectedMinimum
                ) {
                    throw new Error(
                        `Minimum valid bid is ${expectedMinimum}.`,
                    );
                }

                /*
                 * Prevent a team from placing
                 * the same bid repeatedly.
                 */
                if (
                    player.currentBidder &&
                    getId(
                        player.currentBidder,
                    ) ===
                    String(team._id) &&
                    bidAmount <= currentBid
                ) {
                    throw new Error(
                        "Your team already holds the highest bid.",
                    );
                }

                /*
                 * Budget check.
                 *
                 * Support common budget field names.
                 */
                const remainingBudget =
                    Number(
                        team.remainingBudget ??
                        team.budgetRemaining ??
                        team.budget ??
                        0,
                    );

                if (
                    remainingBudget <
                    bidAmount
                ) {
                    throw new Error(
                        "Insufficient team budget.",
                    );
                }

                /*
                 * Maximum players check.
                 */
                const maxPlayers =
                    Number(
                        auction.maxPlayersPerTeam ||
                        0,
                    );

                const playersBought =
                    Number(
                        team.playersCount ??
                        team.playerCount ??
                        team.totalPlayers ??
                        (
                            Array.isArray(
                                team.players,
                            )
                                ? team.players.length
                                : 0
                        ),
                    );

                if (
                    maxPlayers > 0 &&
                    playersBought >=
                    maxPlayers
                ) {
                    throw new Error(
                        "Your team has reached the maximum player limit.",
                    );
                }

                /*
                 * Create bid.
                 */
                const [bid] =
                    await Bid.create(
                        [
                            {
                                auction:
                                    auction._id,

                                auctionId:
                                    auction._id,

                                player:
                                    player._id,

                                playerId:
                                    player._id,

                                team:
                                    team._id,

                                teamId:
                                    team._id,

                                user:
                                    req.user?._id ||
                                    req.user?.id,

                                amount:
                                    bidAmount,
                            },
                        ],
                        {
                            session,
                        },
                    );

                /*
                 * Update current player.
                 */
                player.currentBid =
                    bidAmount;

                player.currentBidder =
                    team._id;

                /*
                 * Keep status auctioning.
                 */
                player.status =
                    "auctioning";

                await player.save({
                    session,
                });

                result = {
                    bid,
                    auction,
                    player,
                    team,
                };
            },
        );

        /*
         * Emit only after successful
         * transaction.
         */
        const io = getIo(req);

        if (io && result) {
            io.to(
                getAuctionRoom(
                    auctionId,
                ),
            ).emit(
                "bid:new",
                {
                    auctionId,

                    playerId:
                        result.player._id,

                    bid: {
                        _id:
                            result.bid._id,

                        amount:
                            result.bid.amount,

                        teamId:
                            result.team._id,

                        teamName:
                            result.team.name,

                        createdAt:
                            result.bid.createdAt,
                    },

                    amount:
                        result.bid.amount,

                    currentBid:
                        result.bid.amount,

                    currentBidder: {
                        teamId:
                            result.team._id,

                        teamName:
                            result.team.name,
                    },
                },
            );
        }

        return res.status(201).json({
            success: true,

            message:
                "Bid placed successfully.",

            bid: result.bid,

            currentBid:
                result.bid.amount,
        });
    } catch (error) {
        console.error(
            "placeBid error:",
            error,
        );

        const status =
            error.message?.includes(
                "not approved",
            )
                ? 403
                : error.message?.includes(
                    "Insufficient",
                )
                    ? 400
                    : error.message?.includes(
                        "maximum player",
                    )
                        ? 400
                        : 400;

        return res.status(status).json({
            success: false,
            message:
                error.message ||
                "Unable to place bid.",
        });
    } finally {
        await session.endSession();
    }
};

/*
|--------------------------------------------------------------------------
| GET CURRENT BID
|--------------------------------------------------------------------------
*/

const getCurrentBid = async (
    req,
    res,
) => {
    try {
        const {
            auctionId,
        } = req.params;

        const player =
            await Player.findOne({
                $or: [
                    {
                        auctionId,
                    },
                    {
                        auction:
                            auctionId,
                    },
                ],

                status: "auctioning",
            })
                .populate(
                    "currentBidder",
                    "name logo",
                )
                .sort({
                    updatedAt: -1,
                });

        if (!player) {
            return res.status(200).json({
                success: true,
                player: null,
                currentBid: 0,
            });
        }

        return res.status(200).json({
            success: true,

            player,

            currentBid:
                Number(
                    player.currentBid ||
                    player.basePrice ||
                    0,
                ),

            currentBidder:
                player.currentBidder ||
                null,
        });
    } catch (error) {
        console.error(
            "getCurrentBid error:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to get current bid.",
        });
    }
};

/*
|--------------------------------------------------------------------------
| GET BID HISTORY
|--------------------------------------------------------------------------
*/

const getBidHistory = async (
    req,
    res,
) => {
    try {
        const {
            playerId,
        } = req.params;

        if (
            !mongoose.Types.ObjectId.isValid(
                playerId,
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid player ID.",
            });
        }

        const bids =
            await Bid.find({
                $or: [
                    {
                        player:
                            playerId,
                    },
                    {
                        playerId:
                            playerId,
                    },
                ],
            })
                .populate(
                    "team",
                    "name logo",
                )
                .sort({
                    createdAt: -1,
                })
                .lean();

        return res.status(200).json({
            success: true,
            bids,
            history: bids,
        });
    } catch (error) {
        console.error(
            "getBidHistory error:",
            error,
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to get bid history.",
        });
    }
};

/*
|--------------------------------------------------------------------------
| SELL PLAYER
|--------------------------------------------------------------------------
*/

const sellPlayer = async (
    req,
    res,
) => {
    const session =
        await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
        } = req.body;

        if (!auctionId || !playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID and player ID are required.",
            });
        }

        let result;

        await session.withTransaction(
            async () => {
                const auction =
                    await Auction.findById(
                        auctionId,
                    ).session(session);

                if (!auction) {
                    throw new Error(
                        "Auction not found.",
                    );
                }

                if (
                    auction.status !== "live"
                ) {
                    throw new Error(
                        "Auction is not live.",
                    );
                }

                const player =
                    await Player.findById(
                        playerId,
                    ).session(session);

                if (!player) {
                    throw new Error(
                        "Player not found.",
                    );
                }

                if (
                    player.status !==
                    "auctioning"
                ) {
                    throw new Error(
                        "Player is not currently being auctioned.",
                    );
                }

                const winningTeamId =
                    getId(
                        player.currentBidder,
                    );

                if (!winningTeamId) {
                    throw new Error(
                        "Cannot sell a player without a valid bid.",
                    );
                }

                const winningTeam =
                    await Team.findById(
                        winningTeamId,
                    ).session(session);

                if (!winningTeam) {
                    throw new Error(
                        "Winning team not found.",
                    );
                }

                /*
                 * Verify winning team was approved.
                 */
                const registration =
                    await findApprovedRegistration({
                        auctionId,
                        teamId:
                            winningTeam._id,
                        session,
                    });

                if (!registration) {
                    throw new Error(
                        "Winning team registration is not approved.",
                    );
                }

                const soldAmount =
                    Number(
                        player.currentBid ||
                        0,
                    );

                /*
                 * Budget.
                 */
                const remainingBudget =
                    Number(
                        winningTeam.remainingBudget ??
                        winningTeam.budgetRemaining ??
                        winningTeam.budget ??
                        0,
                    );

                if (
                    remainingBudget <
                    soldAmount
                ) {
                    throw new Error(
                        "Winning team does not have sufficient budget.",
                    );
                }

                /*
                 * Deduct budget.
                 *
                 * IMPORTANT:
                 * We update the most likely
                 * existing field. If your Team
                 * schema uses only one specific
                 * budget field, keep that field.
                 */
                if (
                    winningTeam.remainingBudget !==
                    undefined
                ) {
                    winningTeam.remainingBudget =
                        remainingBudget -
                        soldAmount;
                }

                if (
                    winningTeam.budgetRemaining !==
                    undefined
                ) {
                    winningTeam.budgetRemaining =
                        remainingBudget -
                        soldAmount;
                }

                /*
                 * If your project stores budget
                 * as total budget and spent amount,
                 * update spent amount.
                 */
                if (
                    winningTeam.spentBudget !==
                    undefined
                ) {
                    winningTeam.spentBudget =
                        Number(
                            winningTeam.spentBudget ||
                            0,
                        ) +
                        soldAmount;
                }

                /*
                 * Add player to team roster
                 * when players array exists.
                 */
                if (
                    Array.isArray(
                        winningTeam.players,
                    )
                ) {
                    const alreadyExists =
                        winningTeam.players.some(
                            (item) =>
                                getId(item) ===
                                String(
                                    player._id,
                                ),
                        );

                    if (!alreadyExists) {
                        winningTeam.players.push(
                            player._id,
                        );
                    }
                }

                /*
                 * Common counters.
                 */
                if (
                    winningTeam.playersCount !==
                    undefined
                ) {
                    winningTeam.playersCount =
                        Number(
                            winningTeam.playersCount ||
                            0,
                        ) + 1;
                }

                if (
                    winningTeam.playerCount !==
                    undefined
                ) {
                    winningTeam.playerCount =
                        Number(
                            winningTeam.playerCount ||
                            0,
                        ) + 1;
                }

                /*
                 * Player sold.
                 */
                player.status =
                    "sold";

                player.soldTo =
                    winningTeam._id;

                player.soldPrice =
                    soldAmount;

                await player.save({
                    session,
                });

                await winningTeam.save({
                    session,
                });

                result = {
                    auction,
                    player,
                    team: winningTeam,
                    soldPrice:
                        soldAmount,
                };
            },
        );

        const io = getIo(req);

        if (io && result) {
            io.to(
                getAuctionRoom(
                    auctionId,
                ),
            ).emit(
                "player:sold",
                {
                    auctionId,

                    player: {
                        _id:
                            result.player._id,

                        id:
                            result.player._id,

                        fullName:
                            result.player.fullName,

                        status:
                            "sold",

                        soldTo:
                            result.team._id,

                        soldPrice:
                            result.soldPrice,
                    },

                    team: {
                        _id:
                            result.team._id,

                        name:
                            result.team.name,
                    },

                    amount:
                        result.soldPrice,

                    soldPrice:
                        result.soldPrice,
                },
            );
        }

        return res.status(200).json({
            success: true,

            message:
                "Player sold successfully.",

            player:
                result.player,

            team:
                result.team,

            soldPrice:
                result.soldPrice,
        });
    } catch (error) {
        console.error(
            "sellPlayer error:",
            error,
        );

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Unable to sell player.",
        });
    } finally {
        await session.endSession();
    }
};

/*
|--------------------------------------------------------------------------
| MARK PLAYER UNSOLD
|--------------------------------------------------------------------------
*/

const markPlayerUnsold = async (
    req,
    res,
) => {
    const session =
        await mongoose.startSession();

    try {
        const {
            auctionId,
            playerId,
        } = req.body;

        if (!auctionId || !playerId) {
            return res.status(400).json({
                success: false,
                message:
                    "Auction ID and player ID are required.",
            });
        }

        let player;

        await session.withTransaction(
            async () => {
                const auction =
                    await Auction.findById(
                        auctionId,
                    ).session(session);

                if (!auction) {
                    throw new Error(
                        "Auction not found.",
                    );
                }

                if (
                    auction.status !== "live"
                ) {
                    throw new Error(
                        "Auction is not live.",
                    );
                }

                player =
                    await Player.findById(
                        playerId,
                    ).session(session);

                if (!player) {
                    throw new Error(
                        "Player not found.",
                    );
                }

                if (
                    player.status !==
                    "auctioning"
                ) {
                    throw new Error(
                        "Player is not currently being auctioned.",
                    );
                }

                player.status =
                    "unsold";

                player.currentBid = 0;

                player.currentBidder =
                    null;

                await player.save({
                    session,
                });
            },
        );

        const io = getIo(req);

        if (io) {
            io.to(
                getAuctionRoom(
                    auctionId,
                ),
            ).emit(
                "player:unsold",
                {
                    auctionId,

                    player: {
                        _id:
                            player._id,

                        id:
                            player._id,

                        fullName:
                            player.fullName,

                        status:
                            "unsold",
                    },
                },
            );
        }

        return res.status(200).json({
            success: true,

            message:
                "Player marked unsold.",

            player,
        });
    } catch (error) {
        console.error(
            "markPlayerUnsold error:",
            error,
        );

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Unable to mark player unsold.",
        });
    } finally {
        await session.endSession();
    }
};

module.exports = {
    placeBid,
    getCurrentBid,
    getBidHistory,
    sellPlayer,
    markPlayerUnsold,
};