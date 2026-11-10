require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");
(async () => {
  const [name, email, password, username] = process.argv.slice(2);
  if (
    !name ||
    !email ||
    !password ||
    Buffer.byteLength(password, "utf8") < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new Error(
      'Usage: node scripts/createAdmin.js "Name" admin@example.com "Password" [username] (password 8-72 bytes)',
    );
  await connectDB();
  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.role = "admin";
    user.password = password;
    if (username) user.username = username.toLowerCase();
  } else
    user = new User({
      name,
      email: email.toLowerCase(),
      username: username?.toLowerCase(),
      password,
      role: "admin",
    });
  await user.save();
  console.log(`Admin ready: ${user.email}`);
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
