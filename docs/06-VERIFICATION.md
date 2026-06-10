# Verification

Every item below is a testable assertion. Each must pass before the phase is considered complete.

## Phase 1: Foundation

- [ ] `docker-compose up` starts PostgreSQL and Redis successfully
- [ ] `npx prisma migrate dev` runs without errors, creates all tables matching docs/02 exactly
- [ ] `npx prisma db seed` populates 2,000 customers and 8,000 orders
- [ ] Seed data includes: customers with phone-only (no email), email-only (no phone), and both
- [ ] Seed data includes: some customers with `optedOut = true`
- [ ] `POST /api/customers/bulk` accepts a JSON array and creates customers
- [ ] `POST /api/orders/bulk` accepts a JSON array and creates orders
- [ ] `POST /api/customers/import` accepts a CSV file and creates customers
- [ ] Channel Service `GET /health` returns 200
- [ ] Channel Service `POST /send` returns 202 Accepted

## Phase 2: Core Loop

### Outbox Lifecycle
- [ ] Campaign launch creates Communications + Outbox rows in a single transaction (both or neither)
- [ ] launchToken idempotency: second launch with same token returns existing campaign, no duplicate rows
- [ ] Poller claims batch with FOR UPDATE SKIP LOCKED, marks PROCESSING, releases lock
- [ ] Poller sends batch to Channel Service OUTSIDE the transaction (no lock held during HTTP)
- [ ] On successful send: Outbox rows marked SENT, Campaign.status transitions queued → sending
- [ ] On failed send with retries left: Outbox rows reset to PENDING with bumped nextRetryAt (exponential backoff)
- [ ] On max retries exceeded: Outbox row marked DEAD_LETTER AND synthetic CommEvent(failed) written AND Communication.status = failed AND Redis failed counter incremented
- [ ] No zombie Communications: every Communication eventually reaches a terminal status (via channel callback OR DEAD_LETTER synthetic)

### Reaper
- [ ] On worker startup: stuck PROCESSING rows (>60s old) reset to PENDING
- [ ] Every 60s: same sweep runs (catches crashes during runtime)

### Channel Service
- [ ] WhatsApp messages emit: sent → delivered → read → clicked (subset based on probability)
- [ ] Email messages emit: sent → delivered → opened → clicked (no "read" event)
- [ ] SMS messages emit: sent → delivered (no further engagement events)
- [ ] RCS messages emit: sent → delivered → opened → clicked (no "read" event)
- [ ] Failed can occur at the delivery step for any channel
- [ ] Callbacks sent individually (not batched)
- [ ] Timing is channel-appropriate (WhatsApp faster than Email)
- [ ] Semaphore limits concurrent tasks to 500

### Receipt Handler
- [ ] Unknown communicationId returns 404
- [ ] Already-failed communication: returns 200, event NOT logged, counter NOT incremented (discard)
- [ ] Duplicate (communicationId, status) callback: catches P2002, returns 200, counter NOT incremented
- [ ] Two concurrent identical callbacks: one succeeds insert, other catches P2002 — both return 200, counter incremented exactly once
- [ ] Out-of-order: "opened" arrives before "delivered" → both events logged, status = opened (higher rank)
- [ ] Late "delivered" after "opened" already set → event logged, status stays "opened" (doesn't regress)
- [ ] "failed" arrives after "delivered" → status overridden to "failed" (terminal)
- [ ] "failed" is terminal: once set, any subsequent event returns 200 and is discarded
- [ ] HINCRBY fires only for genuinely new events (not duplicates, not post-failure discards)
- [ ] PUBLISH fires only for genuinely new events

### Redis Counters
- [ ] Redis hash `campaign:{id}` has correct counts matching CommEvent GROUP BY
- [ ] Rebuild function produces identical counts to live HINCRBY path
- [ ] Rebuild runs on worker startup for campaigns with status 'sending'

### Campaign Completion
- [ ] Completion detected when zero Outbox rows in PENDING/PROCESSING for the campaign
- [ ] Detection uses campaignId column query (NOT LIKE on aggregate_id)
- [ ] Check runs after each batch + on 10s periodic sweep
- [ ] Check is idempotent (repeated runs are no-ops)
- [ ] If all communications failed → Campaign.status = 'failed'
- [ ] If at least one succeeded → Campaign.status = 'completed' + completedAt set

### SSE
- [ ] SSE endpoint uses Node.js runtime (not edge)
- [ ] On connect: subscribes to Redis pub/sub FIRST, then reads snapshot, then flushes snapshot to client
- [ ] No events lost between snapshot and subscribe (subscribe-first pattern)
- [ ] Delta events stream to client in real-time as callbacks arrive
- [ ] Connection cleanup: Redis listener removed on disconnect

### Campaign Launch (single-channel)
- [ ] optedOut customers excluded from communications
- [ ] Contactability verified: email channel requires customer.email not null, phone channels require customer.phone not null
- [ ] Unreachable customers excluded
- [ ] Merge-field templates hydrated per-customer with batch queries (not N+1)
- [ ] Missing data uses fallbacks: top_product → "a Brewcraft favourite", city → omit, days_since_last_order → omit, name → "there"
- [ ] No "undefined" or "null" appears in any hydrated message content
- [ ] Communication.destination stores snapshot of email/phone at creation time
- [ ] Launch returns exclusion breakdown (launched count, optedOut count, unreachable count)

### Thin AI Slice
- [ ] NL input → create_segment produces a valid segment with correct customerCount
- [ ] draft_messages produces merge-field templates per channel
- [ ] launch_campaign triggers the full outbox → channel → callback → SSE flow
- [ ] End-to-end: input "target customers who haven't purchased in 60 days" → segment created → messages drafted → campaign launched → stats update in real-time

## Phase 3: AI Agent Layer

- [ ] AgentRun persisted in Postgres with full message history
- [ ] Agent streams text + tool_call events to frontend
- [ ] describe_schema returns queryable fields and operators
- [ ] recommend_channels upserts ChannelDecision (re-run doesn't throw)
- [ ] launch_campaign with per_customer strategy reads ChannelDecision rows
- [ ] Audience derived from segment members (not ChannelDecision rows)
- [ ] Missing ChannelDecision → falls back to default contactable channel
- [ ] Channel↔template reconciliation: if recommended channel has no template → fallback to channel with template
- [ ] Confirmation gate: launch_campaign pauses agent, persists state, yields confirmation_required
- [ ] Resume after approval: agent continues with full prior context (doesn't restart)
- [ ] Resume after rejection: agent receives is_error tool_result, adjusts plan
- [ ] analyze_performance generates meaningful AI brief from campaign stats
- [ ] aiDecisionLog populated with channel distribution + exclusion reasons
- [ ] Agent run cleanup: runs older than 24h are pruned

## Phase 4: Frontend

- [ ] Dashboard layout with sidebar navigation renders correctly
- [ ] Customers page shows data table with search/filter
- [ ] CSV import creates customers
- [ ] Segments page: NL input creates segment, shows preview with customer count
- [ ] AI Command Center: user types message → agent streams response with tool calls
- [ ] Confirmation dialog appears for launch_campaign
- [ ] Campaign live view: SSE updates counters in real-time
- [ ] Analytics: channel-asymmetric metrics (SMS shows delivery only — no open/click columns)
- [ ] No "open rate: 0%" displayed for SMS campaigns

## Phase 5: Deploy

- [ ] All services running on deployed URL
- [ ] Full end-to-end flow works (ingest → segment → launch → callbacks → stats → insights)
- [ ] Redis counter rebuild works on production startup
- [ ] SSE works over deployed connection
