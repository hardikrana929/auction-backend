const nodemailer = require("nodemailer");

/*
|--------------------------------------------------------------------------
| E-mail sending
|--------------------------------------------------------------------------
|
| Two ways to send, chosen by the environment:
|
| Provider priority:
|   1) RESEND_API_KEY -> Resend HTTPS API (port 443), recommended for Render Free.
|   2) BREVO_API_KEY  -> Brevo HTTPS API (port 443), retained for compatibility.
|   3) otherwise      -> SMTP with Nodemailer (Gmail, etc.).
|
*/

// "AuctionPro <me@gmail.com>" -> { name: "AuctionPro", email: "me@gmail.com" }
const parseSender = (value) => {
    const text = String(value || "").trim();
    const match = text.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);

    if (match) {
        return { name: match[1].trim() || "AuctionPro", email: match[2].trim() };
    }

    return { name: "AuctionPro", email: text };
};

const getMailFrom = () =>
    process.env.MAIL_FROM ||
    (process.env.SMTP_USER ? `AuctionPro <${process.env.SMTP_USER}>` : "");

// Resend takes priority if both API keys are accidentally present.
const getProvider = () => {
    if (process.env.RESEND_API_KEY) return "resend";
    if (process.env.BREVO_API_KEY) return "brevo";
    return "smtp";
};

const createTransporter = () => {
    const port = Number(process.env.SMTP_PORT || 587);

    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].filter(
        (name) => !process.env[name],
    );

    if (missing.length) {
        throw new Error(
            `SMTP email configuration is incomplete. Missing: ${missing.join(", ")}`,
        );
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
        // Fail fast when the host blocks SMTP instead of hanging for minutes.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });
};

const sendWithBrevo = async ({ to, toName, subject, text, html }) => {
    const sender = parseSender(getMailFrom());

    if (!sender.email) {
        throw new Error(
            "MAIL_FROM is required with BREVO_API_KEY (use an address verified as a sender in Brevo)",
        );
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
            sender,
            to: [{ email: to, name: toName || undefined }],
            subject,
            htmlContent: html,
            textContent: text,
        }),
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Brevo API error ${response.status}: ${detail}`);
    }
};


const sendWithResend = async ({ to, toName, subject, text, html }) => {
    const sender = parseSender(getMailFrom());

    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
    }
    if (!sender.email) {
        throw new Error(
            "MAIL_FROM is required with Resend (use an address on a domain verified in Resend)",
        );
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: `${sender.name} <${sender.email}>`,
            to: [toName ? `${toName} <${to}>` : to],
            subject,
            html,
            text,
        }),
        signal: AbortSignal.timeout(15000),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = result.message || result.name || JSON.stringify(result);
        throw new Error(`Resend API error ${response.status}: ${detail}`);
    }

    console.log("Resend accepted email:", {
        id: result.id || null,
        to,
    });
    return result;
};

const sendWithSmtp = async ({ to, subject, text, html }) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: getMailFrom(),
        to,
        subject,
        text,
        html,
    });
};

const sendMail = async (message) => {
    const provider = getProvider();
    if (provider === "resend") return sendWithResend(message);
    if (provider === "brevo") return sendWithBrevo(message);
    return sendWithSmtp(message);
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
    const safeName = String(name || "User").replace(/[<>&"]/g, "");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2>AuctionPro Password Reset</h2>
        <p>Hello ${safeName},</p>
        <p>We received a request to reset your AuctionPro password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
        <p>This link expires in 30 minutes and can be used only once.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>If the button does not work, use the reset link provided in this email.</p>
      </div>`;

    const text = `Hello ${name || "User"},\n\nReset your AuctionPro password using this link:\n${resetUrl}\n\nThis link expires in 30 minutes and can be used only once.`;

    await sendMail({
        to,
        toName: name,
        subject: "AuctionPro Password Reset",
        text,
        html,
    });
};

const sendPasswordResetOtpEmail = async ({ to, name, otp }) => {
    const safeName = String(name || "User").replace(/[<>&"]/g, "");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2>AuctionPro Password Reset</h2>
        <p>Hello ${safeName},</p>
        <p>Use this verification code to reset your AuctionPro password:</p>
        <p style="font-size:34px;font-weight:bold;letter-spacing:10px;margin:24px 0;color:#111827">${otp}</p>
        <p>This code expires in 10 minutes and can be used only once.</p>
        <p><b>Never share this code with anyone.</b> If you did not request it, you can safely ignore this email.</p>
      </div>`;

    const text = `Hello ${name || "User"},\n\nYour AuctionPro verification code is: ${otp}\n\nThis code expires in 10 minutes and can be used only once. Never share it with anyone.\nIf you did not request it, ignore this email.`;

    await sendMail({
        to,
        toName: name,
        subject: "Your AuctionPro verification code",
        text,
        html,
    });
};

module.exports = {
    createTransporter,
    getProvider,
    getMailFrom,
    parseSender,
    sendMail,
    sendWithResend,
    sendPasswordResetEmail,
    sendPasswordResetOtpEmail,
};
