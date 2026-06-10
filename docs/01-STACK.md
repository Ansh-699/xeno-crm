# Stack

## CRM Backend

- **Framework:** Next.js 14 App Router — API Routes (TypeScript)
- **Why:** I/O-bound workload (AI API calls, DB queries, webhooks). Shared types with frontend via Prisma. Event loop excels at concurrent I/O.
- **Runtime:** Node.js (NOT edge runtime — SSE and pg_notify LISTEN require long-lived processes)

## Channel Service

- **Framework:** Rust (Axum + Tokio) — separate process/container
- **Why:** Compile-time state machine enforcement via enums. Demonstrates polyglot service boundaries. The workload is I/O-bound (sleep + HTTP POST callbacks) — Rust's performance advantage is irrelevant here. The real value is type-safe lifecycle modeling and showing cross-language service contract design.
- **Crates:** axum, tokio (full), reqwest (rustls-tls), serde + serde_json, rand, tower, tracing + tracing-subscriber

## Database

- **Primary:** PostgreSQL via Prisma ORM
- **Why:** Relational data with real FK relationships (customers ↔ orders ↔ campaigns ↔ communications). JSONB for flexible fields.

## Cache / Pub-Sub

- **Redis**
- **Uses:**
  1. Atomic campaign counters (`HINCRBY campaign:{id} delivered 1`)
  2. Pub/Sub for SSE fan-out (`PUBLISH campaign:{id}:updates`)
  3. Segment query cache (TTL-based)
- **Why:** Hot-path (every callback) separated from cold-path (analytical queries on Postgres). Counters are a materialized view — rebuildable from comm_events.

## AI

- **V1:** Claude API only (Anthropic SDK)
- **Interface:** Provider-agnostic `AIProvider` interface defined. `GeminiProvider` adapter is declared but NOT implemented in v1.
- **Config:** Environment variable driven routing (`AI_SEGMENTATION_PROVIDER`, `AI_MESSAGE_PROVIDER`, etc.) — all default to 'claude' in v1.

## Frontend

- Next.js 14 App Router
- Tailwind CSS
- shadcn/ui component library

## Deployment

- **Host:** Always-on container host (Railway / Render / Fly.io)
- **Why Vercel/serverless is incompatible:** SSE connections, background outbox poller worker, pg_notify LISTEN all require long-lived processes.
- **Topology:** 3 containers + 2 managed services:
  1. CRM (Next.js standalone)
  2. Worker (outbox poller — same image, different entrypoint: `tsx worker/poller.ts`)
  3. Channel Service (Rust binary in Docker)
  4. PostgreSQL (managed)
  5. Redis (managed)

## Local Development

- Docker Compose for Postgres + Redis + Channel Service
- Next.js dev server + worker running directly via tsx
