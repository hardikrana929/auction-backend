/**
 * Auction status lifecycle.
 *
 * The lifecycle is deliberately NOT a strict one-way chain any more
 * (draft -> upcoming -> live -> completed). An admin may move an auction to any
 * other status, e.g. re-open a completed auction ("live" again) or send a live
 * auction back to "upcoming".
 *
 * "live" and "completed" are still entered through the auction-control
 * endpoints (they create / close the live session); every other status can be
 * set through PATCH /api/auctions/:id/status.
 */
const STATUSES = ["draft", "upcoming", "live", "completed", "cancelled"];

/** Statuses that can be applied through the plain status endpoint. */
const DIRECT_STATUSES = ["draft", "upcoming", "cancelled"];

const canTransition = (from, to) =>
  STATUSES.includes(from) && STATUSES.includes(to) && from !== to;

module.exports = { canTransition, STATUSES, DIRECT_STATUSES };
