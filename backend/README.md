# Backend — Xeno CRM

Express 5 REST + SSE API for Xeno CRM, written in TypeScript and run directly with `tsx`
(no build step). Prisma is the ORM over PostgreSQL; Redis holds live campaign counters and
the SSE pub/sub fan-out. The same codebase runs as **two processes**: the API server and a
standalone outbox poller worker.

> Part of the [Xeno CRM](../README.md) monorepo. Full design in
> [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Architecture

```mermaid
flowchart LR
  FE["Frontend"] -->|"REST + SSE"| API

  subgraph proc["Two Node processes (shared code)"]
    API["API Server<br/><small>src/index.ts · :3001</small>"]
    WORK["Poller Worker<br/><small>src/worker/poller.ts</small>"]
  end

  API -->|"tool-use loop"| LLM{{"LLM · BYOK"}}
  API --> PG[("PostgreSQL<br/>Prisma")]
  API --> RD[("Redis<br/>counters · pub/sub")]
  WORK -->|"drain outbox · SKIP LOCKED"| PG
  WORK -->|"POST /send"| CS["Rust Channel Service"]
  CS -->|"async callbacks"| API
```

**Why two processes?** SSE streams and `pg_notify LISTEN` need long-lived connections, and
the outbox worker must do HTTP I/O *outside* DB transactions. Splitting the worker from the
API keeps network latency off the request path and lets each scale independently.

## Structure

```
backend/
├── prisma/
│   ├── schema.prisma        # data model (Customer, Order, Segment, Campaign,
│   │                        #   Communication, CommEvent, Outbox, AgentRun, …)
│   ├── migrations/          # versioned SQL migrations
│   └── seed.ts              # Brewcraft seed — 2,000 customers, 8,000 orders
├── src/
│   ├── index.ts             # API server entrypoint — mounts routers, app.listen(3001)
│   ├── routes/              # one router per resource (see table below)
│   ├── lib/
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── redis.ts         # ioredis clients + campaign counter / pub-sub helpers
│   │   ├── segments.ts      # segment DSL → Prisma where-clause compiler
│   │   ├── campaign-launcher.ts  # audience resolution, merge-field hydration, outbox write
│   │   ├── attribution.ts   # 7-day revenue attribution
│   │   ├── analytics.ts     # funnel + campaign analytics queries
│   │   ├── ingest-schemas.ts# zod schemas for bulk customer/order ingest
│   │   └── ai/
│   │       ├── agent-loop.ts     # persistent tool-use agent (AgentRun)
│   │       ├── brief-generator.ts# AI campaign brief / narrative
│   │       ├── tools/            # the 11 CRM tools exposed to the LLM
│   │       └── llm/              # provider adapters: anthropic · openai · google
│   └── worker/
│       └── poller.ts        # outbox poller worker — claim, send, retry, complete
└── tests/                   # vitest unit tests (pure, no DB)
```

## API surface

All routes are mounted under `/api`; `GET /health` is the liveness probe.

| Router | Path | Responsibility |
|---|---|---|
| `customers.ts`  | `/api/customers`  | Bulk + CSV ingest, list, query |
| `orders.ts`     | `/api/orders`     | Bulk ingest with live attribution, backfill |
| `segments.ts`   | `/api/segments`   | Create / preview segments (DSL filters) |
| `campaigns.ts`  | `/api/campaigns`  | Launch, list, live SSE stats |
| `receipts.ts`   | `/api/receipts`   | Channel-service callback sink (append-only events) |
| `agent.ts`      | `/api/agent`      | AI agent chat (tool-use loop, SSE) |
| `analytics.ts`  | `/api/analytics`  | Funnel + campaign performance |
| `insights.ts`   | `/api/insights`   | AI-written / data-grounded insights |
| `stats.ts`      | `/api/stats`      | Dashboard counters |

## Develop

```bash
npm install
npm run db:generate          # prisma generate
npm run db:migrate           # prisma migrate dev
npm run db:seed              # 2,000 customers + 8,000 orders (DESTRUCTIVE — clears tables)

npm run dev                  # API server (watch) :3001
npm run worker               # outbox poller worker
npm test                     # vitest
```

### Environment

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/xeno` | Prisma connection |
| `REDIS_URL` | `redis://host:6379` | counters + pub/sub |
| `CHANNEL_SERVICE_URL` | `http://localhost:4000` | where the worker POSTs sends |
| `CALLBACK_URL` | `http://localhost:3001/api/receipts` | callback URL handed to the channel service |
| `PORT` | `3001` | API server port |
| `ANTHROPIC_API_KEY` | *(optional)* | server-side default; users normally BYOK via the UI |

## Stack

Express 5 · TypeScript · `tsx` · Prisma 6 · PostgreSQL · ioredis · Zod 4 ·
`@anthropic-ai/sdk` / `openai` / `@google/generative-ai` · vitest.
