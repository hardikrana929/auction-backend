const isAuctionAtCapacity = (auction) => {
    if (!auction) return false;
    const limit = Number(auction.maxTeams);
    const approved = Number(auction.actualApprovedTeamsCount ?? auction.approvedTeamsCount ?? 0);
    return Number.isFinite(limit) && limit > 0 && approved >= limit;
};

// Never hide applications already submitted. The approval controller enforces
// the team limit separately and atomically.
const hidePendingWhenFull = (filter) => ({ ...filter });

module.exports = { isAuctionAtCapacity, hidePendingWhenFull };
