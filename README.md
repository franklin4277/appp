# The Trading Journal

Minimal, fast, session-based Forex journal with per-user accounts and behavior coaching.

## Stack

- Frontend: React + Tailwind (Vite, PWA)
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)

## Major Features

- User auth (register/login) with private trade data isolation
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

### 2) Frontend

```powershell
cd client
copy .env.example .env
npm install
npm run dev
```

Frontend env:

- `VITE_API_URL` (example: `http://localhost:5000`)

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/settings`
- `POST /api/trades`
- `GET /api/trades`
- `GET /api/trades/analytics`
- `GET /api/trades/export.csv`
- `POST /api/trades/import.csv`

All `/api/trades/*` endpoints require `Authorization: Bearer <token>`.

## Security Notes

- Keep all secrets in env vars only.
- Rotate MongoDB credentials before production release.
- Use a long random `JWT_SECRET` in production.

