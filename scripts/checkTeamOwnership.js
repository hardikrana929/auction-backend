/*
 * Finds teams whose stored owner account does not match who actually
 * registered them for an auction — the cause of "You can only bid for your
 * own team" / "No team is associated with this account" (403) when the
 * team owner tries to bid.
 *
 *   node scripts/checkTeamOwnership.js
 *
 * Run it from the auction-backend folder. It only reads data — it changes
 * nothing. To fix a team it reports, open Team Management, edit that team,
 * and re-enter the OWNER'S OWN email (the one they log in with) in the
 * "Owner email" field, then save.
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Team = require("../models/Team");
const AuctionRegistration = require("../models/AuctionRegistration");

(async () => {
    if (!process.env.MONGO_URI) {
        console.log("MONGO_URI is not set in .env");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const registrations = await AuctionRegistration.find({ status: "approved" })
        .populate("team", "name owner status")
        .populate("registeredBy", "name email")
        .populate("auction", "name");

    let mismatches = 0;

    for (const registration of registrations) {
        const team = registration.team;

        if (!team) {
            continue;
        }

        const ownerId = String(team.owner || "");
        const registeredById = String(registration.registeredBy?._id || "");

        if (ownerId && registeredById && ownerId !== registeredById) {
            mismatches += 1;

            console.log(
                `MISMATCH  auction "${registration.auction?.name}"  team "${team.name}"\n` +
                    `          registered by: ${registration.registeredBy?.name} <${registration.registeredBy?.email}>\n` +
                    `          team owner is a DIFFERENT account (id ${ownerId})\n` +
                    "          Fix: Team Management -> edit this team -> Owner email -> " +
                    `${registration.registeredBy?.email} -> save.\n`,
            );
        }
    }

    console.log(
        mismatches
            ? `\n${mismatches} team(s) need fixing (see above).`
            : "No mismatches found — every approved team's owner matches who registered it.",
    );

    await mongoose.disconnect();
})().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
