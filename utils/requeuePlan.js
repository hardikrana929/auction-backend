const planRequeue = (players, onlyPlayerId) => {
  const unsold = (players || []).filter(
    (p) =>
      p.status === "unsold" &&
      (!onlyPlayerId || String(p._id) === String(onlyPlayerId)),
  );
  const highestOrder = Math.max(
    -1,
    ...(players || []).map((p) => Number(p.auctionOrder ?? -1)),
  );
  return unsold
    .sort((a, b) => Number(a.auctionOrder ?? 0) - Number(b.auctionOrder ?? 0))
    .map((player, index) => ({
      player,
      auctionOrder: highestOrder + index + 1,
    }));
};
module.exports = { planRequeue };
