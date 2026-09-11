const nodemailer = require("nodemailer");

const createTransporter = () => {
    const port = Number(process.env.SMTP_PORT || 587);

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.MAIL_FROM) {
        throw new Error("SMTP email configuration is incomplete");
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
    });
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
    const transporter = createTransporter();

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2>AuctionPro Password Reset</h2>
        <p>Hello ${String(name || "User").replace(/[<>&"]/g, "")},</p>
        <p>We received a request to reset your AuctionPro password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
        <p>This link expires in 30 minutes and can be used only once.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>If the button does not work, use the reset link provided in this email.</p>
      </div>`;

    const text = `Hello ${name || "User"},\n\nReset your AuctionPro password using this link:\n${resetUrl}\n\nThis link expires in 30 minutes and can be used only once.`;

    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: "AuctionPro Password Reset",
        text,
        html,
    });
};

module.exports = { createTransporter, sendPasswordResetEmail };
