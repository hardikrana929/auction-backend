# AuctionPro — Resend setup (Render Free)

This backend now supports Resend through its HTTPS API. It does not use SMTP when `RESEND_API_KEY` is present, so it avoids Render Free's outbound SMTP-port restriction.

## 1. Verify a sender domain in Resend

1. Open https://resend.com/domains and add a domain you own.
2. Add the DNS records Resend provides at your domain/DNS host.
3. Wait until Resend reports the domain as verified.
4. Create an API key at https://resend.com/api-keys with permission to send email.

For production OTP delivery to arbitrary registered users, use a verified domain. Resend's `onboarding@resend.dev` sender is intended for testing and is restricted to the account owner's email address.

## 2. Configure Render environment variables

In Render Dashboard → your `auction-backend` service → Environment, add:

- `RESEND_API_KEY` = your Resend API key
- `MAIL_FROM` = `AuctionPro <no-reply@your-verified-domain.com>` (replace with an address on your verified domain)

Do not add the API key to frontend environment variables, source code, or Git. If `BREVO_API_KEY` is also set, Resend still takes priority. The old SMTP variables can remain, but are not used while `RESEND_API_KEY` is set.

Save changes and let Render redeploy/restart the service.

## 3. Test delivery

From the backend directory, you can test locally after putting the same variables in `.env`:

```bash
node scripts/testEmail.js recipient@example.com
```

Or test Forgot Password on the deployed AuctionPro site and inspect Render logs. A successful Resend API response means Resend accepted the email for processing; check Resend → Emails for delivery, bounce, or suppression events if it does not arrive.

## 4. OTP flow

The existing `forgotPassword`, `verifyResetOtp`, and reset-password controller logic is unchanged. Only the email transport has changed. OTPs remain six digits and retain the existing 10-minute expiry and attempt controls.

## Provider selection

The email service selects providers in this order:

1. `RESEND_API_KEY` → Resend HTTPS API
2. `BREVO_API_KEY` → Brevo HTTPS API (legacy compatibility)
3. Otherwise → SMTP (Gmail, etc.)
