# Build Plan

## Phase 1: Foundation

- Monorepo scaffold: `apps/crm/` (Next.js) + `services/channel/` (Rust)
- Docker Compose: PostgreSQL + Redis
- Prisma schema exactly as in docs/02-DATA-MODEL.md + migrations
- Seed script: Brewcraft Coffee dataset (2,000 customers, 8,000 orders, deterministic)
- Bulk ingestion APIs:
  - `POST /api/customers/bulk` — accepts JSON array of customer objects
  - `POST /api/orders/bulk` — accepts JSON array of order objects
  - `POST /api/customers/import` — accepts CSV file upload
- Channel Service skeleton: Axum server with `POST /send` (returns 202) + `GET /health`

## Phase 2: Core Loop + Thin AI Slice

**Note: channelStrategy = 'single' only in this phase. Per-customer path arrives in Phase 3.**

### Channel Service (full implementation)
- Channel-aware event sequences (WhatsApp/Email/SMS/RCS as per docs/03)
- Tokio task spawning per message with Semaphore(500) backpressure
- Channel-specific random delays + probabilistic transitions
- Individual callbacks to CRM `/api/receipts`
- Retry with exponential backoff (1s, 4s, 16s)
- In-memory idempotency HashMap with TTL

### CRM Outbox + Poller Worker
- Outbox table with partial index on PENDING
- Poller: short-claim → PROCESSING → COMMIT → HTTP outside txn
- On SENT: mark row, set Campaign to 'sending' if 'queued'
- On DEAD_LETTER: write synthetic comm_event(failed) + update Communication + HINCRBY
- pg_notify trigger + dedicated pg.Client LISTEN + 5s fallback poll
- Reaper on startup + every 60s (reset PROCESSING > 60s to PENDING)
- Completion detection: after each batch + 10s sweep (query by campaignId, not LIKE)

### CRM Receipt Handler
- Exactly as specified in docs/03 Pattern 2
- Post-failure discard (already-failed → return 200, no log, no count)
- P2002 catch → return 200
- Max-rank monotonicity for happy path
- Failed terminal override
- HINCRBY + PUBLISH only on new events

### Redis Counters + Pub/Sub
- HINCRBY per new event
- PUBLISH to campaign:{id}:updates channel
- Rebuild function for active campaigns on startup

### SSE Endpoint
- Force runtime = 'nodejs'
- Subscribe-FIRST pattern (subscribe → snapshot → flush → stream deltas)
- Shared Redis subscriber + EventEmitter, cleanup on disconnect

### Campaign Launch API (single-channel only for Phase 2)
- launchToken idempotency check
- Merge-field hydration per customer (batch queries, fallbacks for missing data)
- Destination snapshot stored in Communication
- optedOut customers excluded
- Contactability verified for the single channel
- Communications + outbox created in 1 transaction
- Returns exclusion breakdown

### Thin AI Slice
- ClaudeProvider implementation (streaming + tool_use)
- Minimal tool implementations: `create_segment` (NL → DSL → Prisma where), `draft_messages` (generates merge-field templates), `launch_campaign` (wired to the real launch API)
- End-to-end flow working: NL input → segment created → messages drafted → campaign launched → callbacks arrive → stats update
- Can be tested via API/curl — no frontend required yet

## Phase 3: Full AI Agent Layer

- AgentRun persistence (Postgres table)
- Full agent loop with resume-after-confirmation (exactly as docs/04)
- All 9 tool executors wired up:
  - `describe_schema`: returns queryable fields + operators
  - `query_customers`: executes DSL filters, returns count + sample
  - `create_segment`: NL → structured DSL → persist
  - `preview_audience`: segment members preview
  - `draft_messages`: Claude generates merge-field templates per channel
  - `recommend_channels`: analyzes engagement history, upserts ChannelDecision
  - `launch_campaign`: full per-customer path (reads ChannelDecision, contactability, template reconciliation)
  - `get_campaign_stats`: reads Redis hash
  - `analyze_performance`: generates AI brief from stats + comm_events
- Channel recommendation: per-customer analysis from order/engagement history
- AI decision audit logging (aiDecisionLog field populated)
- Exclusion reporting surfaced to agent ("Launching to 1,850 of 2,000: 120 opted out, 30 unreachable")

## Phase 4: Frontend

- Dashboard layout (sidebar nav, responsive)
- Customers page (data table, search, CSV import)
- Segments page (NL builder + visual preview + customer count)
- AI Command Center:
  - Conversational feed
  - Streaming tool calls (show intermediate steps)
  - Confirmation dialogs for launch_campaign
  - Completed campaign insight cards
- Campaign live view (SSE-driven real-time counters)
- Analytics page:
  - Channel comparison (channel-asymmetric metrics — SMS shows delivery only, no open/click)
  - Cross-campaign insights
  - Campaign history

## Phase 5: Deploy + Polish

- Deploy all services to always-on host (Railway/Render/Fly)
- Environment variables configured (DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, CHANNEL_SERVICE_URL, CRM_CALLBACK_URL)
- End-to-end smoke test on production URL
- Redis counter rebuild verified on startup
- Record walkthrough video (5-6 minutes)
