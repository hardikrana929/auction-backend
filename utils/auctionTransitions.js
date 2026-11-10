const transitions = {
  draft: ["upcoming", "cancelled"],
  upcoming: ["draft", "cancelled"],
  cancelled: ["draft", "upcoming"],
  live: [],
  completed: [],
};
const canTransition = (from, to) => Boolean(transitions[from]?.includes(to));
module.exports = { canTransition, transitions };
