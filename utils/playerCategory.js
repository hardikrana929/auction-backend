/**
 * Player categories.
 *
 *  auction - a normal player who goes under the hammer (default)
 *  icon    - icon player: attached straight to a team, never auctioned
 *  owner   - team owner who also plays: attached to a team, never auctioned
 *
 * Icon players and team owners get the status "retained". Because every
 * auction query looks for status "available", they are never put on the block.
 */
const CATEGORIES = ["auction", "icon", "owner"];

const CATEGORY_LABELS = {
  auction: "Auction player",
  icon: "Icon player",
  owner: "Team owner",
};

const idOf = (value) => (value ? String(value._id || value) : null);

/**
 * Decides what has to change when a player's category / team is edited.
 *
 * @param {object} player     { category, status, team }
 * @param {object} requested  { category?, teamId? }
 * @returns {{ error?: string, changes?: object, pullFromTeam?: string|null, pushToTeam?: string|null }}
 */
const planCategoryChange = (player, requested = {}) => {
  const currentCategory = player.category || "auction";
  const category = requested.category || currentCategory;
  const currentTeam = idOf(player.team);

  if (!CATEGORIES.includes(category))
    return { error: `Category must be one of: ${CATEGORIES.join(", ")}` };

  const locked = ["auctioning", "sold"].includes(player.status);

  if (category === "auction") {
    if (currentCategory === "auction") return { changes: {}, pullFromTeam: null, pushToTeam: null };
    if (locked)
      return { error: "A player on the block or already sold cannot change category" };
    return {
      changes: { category: "auction", status: "available", team: null },
      pullFromTeam: currentTeam,
      pushToTeam: null,
    };
  }

  // icon / owner
  if (locked)
    return { error: "A player on the block or already sold cannot become an icon player or team owner" };

  const teamId = idOf(requested.teamId) || currentTeam;
  if (!teamId)
    return { error: "Select the team this icon player / team owner belongs to" };

  const alreadyThere = currentCategory !== "auction" && currentTeam === teamId;
  return {
    changes: { category, status: "retained", team: teamId },
    pullFromTeam: currentTeam && currentTeam !== teamId ? currentTeam : null,
    pushToTeam: alreadyThere ? null : teamId,
  };
};

module.exports = { CATEGORIES, CATEGORY_LABELS, planCategoryChange };
