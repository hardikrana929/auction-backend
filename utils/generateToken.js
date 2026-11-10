const jwt = require("jsonwebtoken");
const generateToken = (user) => {
  const userId = user?._id || user?.id || user;
  const tokenVersion = Number(user?.tokenVersion || 0);
  return jwt.sign({ id: userId, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};
module.exports = generateToken;
