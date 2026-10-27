/**
 * Returns the next team in a deterministic round-robin order.
 * teamIds must already be ordered by registration time (oldest first).
 */
function getNextTeamId(teamIds, lastTeamId = null) {
  const ids = (Array.isArray(teamIds) ? teamIds : []).map(String);
  if (ids.length === 0) return null;
  if (!lastTeamId) return ids[0];

  const lastIndex = ids.indexOf(String(lastTeamId));
  if (lastIndex < 0) return ids[0];
  return ids[(lastIndex + 1) % ids.length];
}

function getTurnState(teams, lastTeamId = null) {
  const ordered = (Array.isArray(teams) ? teams : []).map((team) => ({
    _id: String(team._id ?? team.id ?? team),
    name: team.name || "Team",
  }));
  const nextTeamId = getNextTeamId(ordered.map((team) => team._id), lastTeamId);
  const nextTeam = ordered.find((team) => team._id === nextTeamId) || null;
  return {
    approvedTeamCount: ordered.length,
    turnOrder: ordered,
    nextTeam,
    nextTeamId,
    canStartBidding: ordered.length >= 2,
  };
}

module.exports = { getNextTeamId, getTurnState };
