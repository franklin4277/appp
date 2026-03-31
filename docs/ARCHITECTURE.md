# Trading Journal SaaS Architecture

## Monorepo Layout

```text
appp/
  client/
    public/
    src/
      api/
      components/
      styles/
      utils/
  server/
    src/
      constants/
      controllers/
      middleware/
      models/
      routes/
      services/
  scripts/
    mt5-bridge/
  docs/
```

## Frontend Notes

- React + Tailwind with mobile-first layout
- SaaS landing + authenticated product app
- Theme system (`dark`/`light`) via local storage + CSS variables
- Toast stack notifications and loading states
- PWA-ready build

## Backend Notes

- Express MVC organization
- Auth + security middleware
- Billing scaffolding routes (`/api/billing/*`)
- MongoDB models for users/trades/snapshots/audit
- Guardrails + analytics services split from controllers

## Render Deployment

You can deploy with the included root blueprint file:

- `render.yaml`

### Backend service

- Runtime: `Node`
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`

Required env:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_URL` (frontend URL)
- `STRICT_CORS=true`
- `BRIDGE_RATE_LIMIT_PER_MINUTE=240` (recommended for MT5 ingest protection)

Optional billing env:

- `BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_CHECKOUT_BASE_URL=https://checkout.stripe.com/pay`
- `STRIPE_PORTAL_BASE_URL=https://billing.stripe.com/p/login`

### Frontend service

- Runtime: `Static Site`
- Root directory: `client`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

Required env:

- `VITE_API_URL=https://your-backend.onrender.com`
- `VITE_ENABLE_PWA=true`
