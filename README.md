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
  - Write-through analytics snapshots for fast dashboard reads
  - Profit curve + drawdown curve
  - Session x Setup heatmap
  - Streak tracker
  - Confidence-ranked condition performance
  - Daily and weekly coaching summary
- Reliability:
  - CSV export/import
  - Scheduled JSON auto backups
  - Screenshot upload with optional Cloudinary storage (local fallback)
  - MT5 auto-journal bridge endpoint (entry/exit lifecycle + screenshot sync)
  - Bridge replay protection (HMAC signature + timestamp + nonce)
  - Async media queue (trade writes return fast while media stores in background)
  - Bridge reconciliation worker (auto-fixes missed/late exit events from MT5 history feed)
  - Strategy fingerprint indexing for condition analytics
  - Recording retention worker (automatic clip URL cleanup by policy)
  - Offline queue + retry + local snapshot fallback
  - Trusted-device offline session cache (optional PIN lock)
  - Idempotent trade writes via client trade IDs
- Collaboration:
  - Read-only shared weekly review links (expiring + revokable)
- Monitoring:
  - `/api/metrics` endpoint (token-protected optional)
  - Alert webhook hooks for auth abuse + server error bursts
- SaaS/Monetization:
  - Marketing landing sections (hero, features, workflow, testimonials, footer)
  - Billing/plan scaffolding (`/api/billing/*`) with Stripe-ready placeholders
  - User subscription state model (`starter`, `pro`, `team`)
  - Theme toggle (dark/light), toast notifications, and SaaS-styled UI shell

## Project Structure

```text
client/   # React app
server/   # Express API + MongoDB models/services
docs/     # Architecture + deployment reference
```

Detailed structure reference: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Local Setup

Optional one-click Render blueprint:

- `render.yaml` at repo root (deploy both backend + frontend services).

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
- `STRICT_CORS` (`true` recommended in production; defaults to `true` in production builds)
- `PASSWORD_RESET_EXPIRES_IN`, `EMAIL_VERIFY_EXPIRES_IN`, `TWO_FACTOR_EXPIRES_IN`
- `PUBLIC_SHARE_BASE_URL`
- `BILLING_PROVIDER` (`stripe` by default)
- `STRIPE_SECRET_KEY`, `STRIPE_CHECKOUT_BASE_URL`, `STRIPE_PORTAL_BASE_URL`
- `ALLOW_DEBUG_AUTH_SECRETS` (`false` recommended in production; debug secrets are disabled in production)
- `SMTP_URL` (optional URI format) or `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (required for 2FA email delivery in production)
- `JSON_BODY_LIMIT` (default `12mb`, used for bridge base64 screenshot payloads)
- `MT5_BRIDGE_REQUIRE_HMAC`, `MT5_BRIDGE_TIMESTAMP_TOLERANCE_SECONDS`, `MT5_BRIDGE_IP_ALLOWLIST`
- `BRIDGE_EVENT_RETENTION_DAYS`, `BRIDGE_RATE_LIMIT_PER_MINUTE`, `BRIDGE_RECONCILE_INTERVAL_SECONDS`, `BRIDGE_STALE_OPEN_TRADE_MINUTES`
- `BRIDGE_ENABLE_RECORDINGS`, `BRIDGE_MAX_RECORDING_SECONDS`, `RECORDING_RETENTION_DAYS`

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
- `POST /api/auth/integrations/mt5/key`
- `POST /api/auth/integrations/mt5/disable`
- `POST /api/auth/email-verification/request`
- `POST /api/auth/2fa/enable`
- `POST /api/auth/2fa/disable`
- `GET /api/billing/overview`
- `POST /api/billing/checkout-session`
- `POST /api/billing/portal-session`
- `POST /api/billing/subscription/mock` (demo/dev)
- `POST /api/trades`
- `POST /api/trades/bridge/mt5` (uses `x-integration-key`, not JWT)
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

Exception: `POST /api/trades/bridge/mt5` is designed for MT5 bridge automation and uses the bridge key generated in settings.

Bridge headers (recommended in production):
- `x-bridge-ts`
- `x-bridge-nonce`
- `x-bridge-signature` (`sha256=<hex-hmac>`)

## MT5 Auto Bridge

- Bridge script: [`scripts/mt5-bridge/mt5_auto_journal_bridge.py`](scripts/mt5-bridge/mt5_auto_journal_bridge.py)
- Setup guide: [`scripts/mt5-bridge/README.md`](scripts/mt5-bridge/README.md)

## Security Notes

- Keep all secrets in env vars only.
- Rotate MongoDB credentials before production release.
- Use a long random `JWT_SECRET` in production.
- Set `CLIENT_URL` to exact frontend origin(s) and run with `STRICT_CORS=true`.
- Keep `ALLOW_DEBUG_AUTH_SECRETS` unset or `false` in production.
- Configure SPF, DKIM, and DMARC on your email domain to reduce phishing/spoofing risk.
- Keep Stripe secrets server-side only; never expose secret keys in frontend env variables.
