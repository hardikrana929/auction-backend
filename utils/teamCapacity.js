const isAuctionAtCapacity = (auction) => {
    if (!auction) return false;
    const limit = Number(auction.maxTeams);
    const approved = Number(auction.approvedTeamsCount || 0);
    return Number.isFinite(limit) && limit > 0 && approved >= limit;
};

// Pending applications are retained in storage, but hidden from approval
// queues while the auction is full. If a slot is freed later, they can show again.
const hidePendingWhenFull = (filter, auction) => {
    if (!isAuctionAtCapacity(auction)) return filter;
    if (filter.status === "pending") return { ...filter, status: "__pending_hidden__" };
    if (filter.status) return filter;
    return { ...filter, status: { $ne: "pending" } };
};

module.exports = { isAuctionAtCapacity, hidePendingWhenFull };
