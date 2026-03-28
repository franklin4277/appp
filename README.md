# The Trading Journal

Minimal, fast, session-based Forex journal with per-user accounts and behavior coaching.

## Stack

- Frontend: React + Tailwind (Vite, PWA)
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)

## Major Features

- User auth (register/login) with private trade data isolation
- Refresh-session auth with rotation + revoke support
- Password reset flow + email verification + optional 2FA login (email code)
- Flexible text fields and per-user strategy lists (pairs/sessions/setups/etc.)
- Rule guardrails:
  - Require Asia High/Low + POC alignment, or force rule-break reason
  - Overtrading warning by max trades/session
  - Loss cooldown warning (revenge-trade guard)
  - Stop-for-day warning by net daily RR
- Analytics:
  - Profit curve + drawdown curve
  - Session x Setup heatmap
  - Streak tracker
  - Confidence-ranked condition performance
  - Daily and weekly coaching summary
- Reliability:
  - CSV export/import
  - Scheduled JSON auto backups
  - Screenshot upload with optional Cloudinary storage (local fallback)
  - Offline queue + retry + local snapshot fallback
  - Trusted-device offline session cache (optional PIN lock)
  - Idempotent trade writes via client trade IDs
- Collaboration:
  - Read-only shared weekly review links (expiring + revokable)
- Monitoring:
  - `/api/metrics` endpoint (token-protected optional)
  - Alert webhook hooks for auth abuse + server error bursts

## Project Structure

```text
client/   # React app
server/   # Express API + MongoDB models/services
```

## Local Setup

### 1) Backend

```powershell
cd server
copy .env.example .env
npm install
npm run dev
```

Required env:

- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL` (can be comma-separated for multiple frontends)

Optional env:

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`
- `BACKUP_INTERVAL_MINUTES`, `BACKUP_DIR`, `DISABLE_AUTO_BACKUP`
- `API_RATE_LIMIT_MAX`
- `METRICS_TOKEN` (protect `/api/metrics`)
- `ALERT_WEBHOOK_URL` (Slack/Discord/custom webhook)
- `PASSWORD_RESET_EXPIRES_IN`, `EMAIL_VERIFY_EXPIRES_IN`, `TWO_FACTOR_EXPIRES_IN`
- `PUBLIC_SHARE_BASE_URL`
- `SMTP_URL` (optional URI format) or `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (required for 2FA email delivery in production)

Migration (legacy data backfill for profiles + security fields):

```powershell
cd server
npm run migrate:v2
```

### 2) Frontend

```powershell
cd client
copy .env.example .env
npm install
npm run dev
```

Frontend env:

- `VITE_API_URL` (example: `http://localhost:5000`)

## Tests

```powershell
cd server
npm test
```

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/2fa/verify-login`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `POST /api/auth/email-verification/verify`
- `GET /api/auth/email-delivery/status`
- `POST /api/auth/email-delivery/test`
- `GET /api/auth/me`
- `PATCH /api/auth/settings`
- `POST /api/auth/email-verification/request`
- `POST /api/auth/2fa/enable`
- `POST /api/auth/2fa/disable`
- `POST /api/trades`
- `GET /api/trades`
- `GET /api/trades/analytics`
- `GET /api/trades/review/weekly`
- `POST /api/trades/review/share`
- `GET /api/trades/review/shares`
- `DELETE /api/trades/review/share/:shareId`
- `GET /api/trades/review/shared/:token` (public read-only)
- `GET /api/trades/export.csv`
- `POST /api/trades/import.csv`
- `GET /api/metrics`

All `/api/trades/*` endpoints require `Authorization: Bearer <token>`.

## Security Notes

- Keep all secrets in env vars only.
- Rotate MongoDB credentials before production release.
- Use a long random `JWT_SECRET` in production.
