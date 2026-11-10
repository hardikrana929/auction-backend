const User = require("../models/User");
const bootstrapAdmin = async () => {
  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return;
  if (
    Buffer.byteLength(password, "utf8") < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new Error("ADMIN_PASSWORD must be 8-72 bytes");
  if (await User.exists({ role: "admin" })) return;
  let user = await User.findOne({ email });
  if (user) {
    user.role = "admin";
    user.password = password;
    user.name = process.env.ADMIN_NAME || user.name;
  } else
    user = new User({
      name: process.env.ADMIN_NAME || "AuctionPro Admin",
      email,
      username: process.env.ADMIN_USERNAME || undefined,
      password,
      role: "admin",
    });
  await user.save();
};
module.exports = bootstrapAdmin;
