# Deploy Guide

## Services

| Service | Directory | Port | Runtime |
|---|---|---|---|
| CRM Backend | `backend/` | 3001 | Node.js (tsx) |
| Outbox Poller Worker | `backend/` | — | Node.js (same image, different entrypoint) |
| Channel Service | `channel-service/` | 4000 | Rust / Axum |
| Frontend | `frontend/` | 3000 | Next.js |
| PostgreSQL | managed | 5432 | — |
| Redis | managed | 6379 | — |

---

## Local Development (Docker Compose)

```bash
# 1. Start Postgres + Redis
docker-compose up -d

# 2. Backend setup
cd backend
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL
npm install
npm run db:migrate          # run Prisma migrations
npm run db:seed             # seed 2,000 customers + 8,000 orders

# 3. Start backend API server
npm run dev                 # port 3001

# 4. Start outbox poller (separate terminal)
npm run worker              # polls outbox + fires callbacks

# 5. Channel Service
cd channel-service
cargo run --release         # port 4000

# 6. Frontend
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev                 # port 3000
```

---

## Production Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://user:pass@host:5432/xeno
REDIS_URL=redis://host:6379
CHANNEL_SERVICE_URL=https://your-channel-service.railway.app
CALLBACK_URL=https://your-backend.railway.app/api/receipts
PORT=3001
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

### Channel Service

```env
PORT=4000
```

> The frontend uses BYOK (Bring Your Own Key) — the user provides their Anthropic/OpenAI/Google API key in the UI Settings panel. No LLM key is needed on the server.

---

## Railway / Render Deployment

### Backend API

- **Root directory:** `backend`
- **Build command:** `npm install && npm run db:generate`
- **Start command:** `npm run start`
- **Port:** 3001

### Poller Worker

- **Root directory:** `backend`
- **Build command:** `npm install && npm run db:generate`
- **Start command:** `npm run worker`
- No public port needed.

### Channel Service

- **Root directory:** `channel-service`
- **Build command:** `cargo build --release`
- **Start command:** `./target/release/channel-service`
- **Port:** 4000

### Frontend

- **Root directory:** `frontend`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start`
- **Port:** 3000

---

## Database Migrations

Migrations live in `backend/prisma/migrations/`. They run automatically on deploy if you add this to the backend start command:

```bash
npx prisma migrate deploy && npm run start
```

---

## Post-Deploy Smoke Test

1. `GET /health` on backend → `{ status: "ok" }`
2. `GET /health` on channel service → `{ status: "ok", service: "channel-service" }`
3. Open frontend, dashboard loads with customer/segment/campaign counts
4. Ingest a few customers via the Customers page CSV import
5. Use the AI Agent to create a segment and launch a campaign
6. Watch the Campaigns page live stats update in real time
