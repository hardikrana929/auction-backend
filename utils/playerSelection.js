const crypto = require("crypto");

/**
 * How the next player is picked while an auction is running.
 *
 *  order  - sequentially by auctionOrder (then creation time)   [default]
 *  manual - the admin chooses a player (by auction number / player id)
 *  random - a random player from those still available
 */
const SELECTION_MODES = ["order", "manual", "random"];
const DEFAULT_SELECTION_MODE = "order";

const normalizeSelectionMode = (mode) =>
  SELECTION_MODES.includes(mode) ? mode : DEFAULT_SELECTION_MODE;

const byOrder = (a, b) => {
  const orderDiff = Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0);
  if (orderDiff !== 0) return orderDiff;
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
};

/**
 * @param {object}   args
 * @param {string}   args.mode        order | manual | random
 * @param {object[]} args.available   players with status "available"
 * @param {object}   [args.selection] { playerId?, auctionNumber? } for manual mode
 * @param {function} [args.randomInt] (max) => integer in [0, max)  (injectable for tests)
 * @returns {{ player: object|null, error?: string }}
 */
const pickNextPlayer = ({
  mode,
  available,
  selection = {},
  randomInt = (max) => crypto.randomInt(0, max),
}) => {
  const pool = Array.isArray(available) ? available : [];
  if (!pool.length) return { player: null, error: "No more players available" };

  switch (normalizeSelectionMode(mode)) {
    case "random":
      return { player: pool[randomInt(pool.length)] };

    case "manual": {
      const { playerId, auctionNumber } = selection || {};
      const hasNumber =
        auctionNumber !== undefined &&
        auctionNumber !== null &&
        auctionNumber !== "";
      if (!playerId && !hasNumber)
        return {
          player: null,
          error: "Select a player (or enter the auction ID) to start next",
        };
      const player = pool.find(
        (item) =>
          (playerId && String(item._id) === String(playerId)) ||
          (hasNumber && Number(item.auctionNumber) === Number(auctionNumber)),
      );
      return player
        ? { player }
        : {
            player: null,
            error: "That player is not available for auction",
          };
    }

    case "order":
    default:
      return { player: [...pool].sort(byOrder)[0] };
  }
};

module.exports = {
  SELECTION_MODES,
  DEFAULT_SELECTION_MODE,
  normalizeSelectionMode,
  pickNextPlayer,
};
