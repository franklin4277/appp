# Session Forex Journal

Minimal, fast trading journal for a session-based Forex strategy:
- Asia High/Low reactions
- Acceptance vs Rejection tracking
- Clean A+ setup focus

## Stack

- Frontend: React + Tailwind CSS (Vite)
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)

## Project Structure

```text
client/   # React app
server/   # Express API + Mongo model
```

## 1) Run the API

```powershell
cd server
copy .env.example .env
npm install
npm run dev
```

Default API URL: `http://localhost:5000`

## 2) Run the Frontend

```powershell
cd client
npm install
npm run dev
```

Default app URL: `http://localhost:5173`

## API Endpoints

- `GET /api/health`
- `POST /api/trades` (multipart form-data with `screenshotBefore`, `screenshotAfter`)
- `GET /api/trades?pair=&session=&setupType=&cleanOnly=true`
- `GET /api/trades/analytics?pair=&session=&setupType=&cleanOnly=true`

## Core Features Included

- Trade entry form with:
  - Pair, session, setup type, trade type
  - Entry / SL / TP
  - Risk %, optional lot-size auto-calc
  - Result + auto RR achieved
  - Screenshot upload (before/after)
- Strategy tags:
  - Asia High/Low used
  - POC interaction
  - Acceptance vs Rejection
  - Clean setup (A+)
- Notes:
  - Price action
  - Execution review
  - Emotional state
- Dashboard:
  - Total trades, win rate, average RR
  - Profit curve chart
  - Continuation vs Reversal performance
  - Tag-based analytics + best conditions
  - A+ setups only performance
- Filters:
  - Pair, session, setup type, clean-only

## Fast Input UX

- Keyboard-first form flow
- `Ctrl+Enter` to save trade quickly
- Default dark UI with low visual noise
