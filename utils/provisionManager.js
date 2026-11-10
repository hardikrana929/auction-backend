const User = require("../models/User");
const {
  generateAccessCode,
  generatePassword,
  generateUsername,
  placeholderEmail,
} = require("./credentials");
const provisionManager = async (auction, options = {}) => {
  let manager = auction.assignedUser
    ? await User.findById(auction.assignedUser)
    : null;
  const password = generatePassword();
  if (manager) {
    manager.password = password;
    manager.tokenVersion = Number(manager.tokenVersion || 0) + 1;
  } else {
    let username = generateUsername(auction.name);
    for (
      let attempt = 0;
      attempt < 8 && (await User.exists({ username }));
      attempt++
    )
      username = generateUsername(auction.name);
    manager = new User({
      name: `${auction.name} Manager`,
      username,
      email: placeholderEmail(username),
      password,
      role: "auction_manager",
      auction: auction._id,
    });
  }
  if (!auction.accessCode) {
    let code = generateAccessCode();
    for (
      let attempt = 0;
      attempt < 8 &&
      (await require("../models/Auction").exists({ accessCode: code }));
      attempt++
    )
      code = generateAccessCode();
    auction.accessCode = code;
  }
  manager.auction = auction._id;
  manager.role = "auction_manager";
  await manager.save();
  auction.assignedUser = manager._id;
  await auction.save();
  return {
    username: manager.username,
    password,
    auctionId: auction.accessCode,
  };
};
module.exports = provisionManager;
