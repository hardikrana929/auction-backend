/*
 * Checks your e-mail settings and sends a real test e-mail.
 *
 *   node scripts/testEmail.js you@example.com
 *
 * Run it from the auction-backend folder. It reads the same .env as the
 * server and prints the REAL error (the forgot-password screen always says
 * "a reset link has been sent", even when sending failed).
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
    createTransporter,
    getMailFrom,
    getProvider,
    sendMail,
} = require("../utils/emailService");

const to = process.argv[2];

const line = (label, value) => console.log(`${label.padEnd(22)}${value}`);

const hint = (error) => {
    const text = `${error.code || ""} ${error.responseCode || ""} ${error.message || ""}`;

    if (/ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNECTION|timed? ?out/i.test(text)) {
        return "Cannot reach the mail server. On Render's FREE plan, SMTP ports 25/465/587 are blocked: set BREVO_API_KEY (HTTPS) or upgrade the instance. Locally, check SMTP_HOST / SMTP_PORT and your firewall.";
    }

    if (/EAUTH|535|Invalid login|Username and Password not accepted/i.test(text)) {
        return "Login refused. For Gmail use an App Password (Google Account > Security > 2-Step Verification > App passwords), not your normal password. SMTP_USER must be the same Gmail address.";
    }

    if (/Brevo API error 401/i.test(text)) {
        return "Brevo rejected the API key. Create a new key in Brevo > SMTP & API > API Keys.";
    }

    if (/Brevo API error 400/i.test(text)) {
        return "Brevo rejected the request. Most often the sender in MAIL_FROM is not verified in Brevo (Senders, Domains & Dedicated IPs > Senders).";
    }

    return "";
};

(async () => {
    const provider = getProvider();
    const clientUrl = String(process.env.CLIENT_URL || "").split(",")[0].trim();

    console.log("\nAuctionPro e-mail check\n");
    line("Method:", provider === "brevo" ? "Brevo HTTPS API" : "SMTP");
    line("From:", getMailFrom() || "(not set)");
    line("Reset links open:", clientUrl ? `${clientUrl.replace(/\/+$/, "")}/reset-password/<token>` : "(CLIENT_URL not set!)");

    if (provider === "smtp") {
        line("SMTP host / port:", `${process.env.SMTP_HOST || "(not set)"} / ${process.env.SMTP_PORT || "587 (default)"}`);
        line("SMTP user:", process.env.SMTP_USER || "(not set)");
        line("SMTP password:", process.env.SMTP_PASSWORD ? "set" : "(not set)");
    } else {
        line("Brevo API key:", "set");
    }

    console.log("");

    if (!to) {
        console.log("Add the address that should receive the test:  node scripts/testEmail.js you@example.com\n");
        process.exit(1);
    }

    try {
        if (provider === "smtp") {
            const transporter = createTransporter();

            await transporter.verify();
            console.log("OK   Connected to the mail server and logged in.");
        }

        await sendMail({
            to,
            toName: "AuctionPro test",
            subject: "AuctionPro test e-mail",
            text: "If you can read this, AuctionPro e-mail sending works.",
            html: "<p>If you can read this, <b>AuctionPro e-mail sending works</b>.</p>",
        });

        console.log(`OK   Test e-mail sent to ${to}. Check the inbox AND the spam folder.\n`);
    } catch (error) {
        console.log(`FAIL ${error.message}`);

        const tip = hint(error);

        if (tip) {
            console.log(`\nWhat to do: ${tip}`);
        }

        console.log("");
        process.exit(1);
    }
})();
