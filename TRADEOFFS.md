# Design Tradeoffs & Scale Notes

## Assumed scope
~2k customers, ~8k orders, campaigns of up to ~10k recipients, single region, one app instance + one poller. Decisions are tuned for "correct, observable, and demoable at this size," with explicit notes on what changes at 10M comms/day.

## 1. Outbox + DB poller instead of a real broker
- **Did**: write Communications + Outbox rows in ONE transaction at launch; a poller claims batches with `SELECT ... FOR UPDATE SKIP LOCKED` and marks PROCESSING → SENT.
- **Why**: gives exactly-once-ish delivery and crash-safety without standing up Kafka/SQS. The outbox guarantees no send is lost if the process dies mid-launch.
- **At scale**: replace the poll loop with a real queue (SQS/Kafka) + multiple consumers; keep the outbox as the transactional source of truth (transactional-outbox pattern). Partition by campaign.

## 2. `FOR UPDATE SKIP LOCKED` for work claiming
- **Did**: multiple poller iterations can claim disjoint batches without blocking each other.
- **Why**: simplest correct concurrent-claim primitive in Postgres; no external coordinator.
- **At scale**: shard the outbox and run N pollers; move to a queue so claiming is O(1) and not a table scan.

## 3. Monotonic receipt ranking
- **Did**: status ranks pending<sent<delivered<opened=read<clicked; a lower-rank event never overwrites a higher one; `failed` is terminal; duplicate receipts are idempotent (P2002 → 200 duplicate:true). Column injected via `Prisma.raw` to avoid SQL binding on the left side of an assignment.
- **Why**: channel callbacks arrive out of order and can be retried; the funnel must never regress.
- **At scale**: same logic; store events append-only (CommEvent already does this) and compute current status as a reduce, enabling replay/audit.

## 4. Redis counters for the live funnel
- **Did**: `HINCRBY` per event per campaign; SSE streams a snapshot then deltas.
- **Why**: O(1) reads for the dashboard without hammering Postgres during a live send.
- **At scale**: Redis cluster; periodically reconcile counters against CommEvent (source of truth) to heal drift.

## 5. Postgres for everything else
- **Did**: one relational store for customers/orders/segments/campaigns/communications.
- **Why**: relational queries (segmentation filters, joins) are the core workload; one store keeps ops simple.
- **At scale**: read replicas for analytics; consider a columnar store (ClickHouse) for funnel/aggregate queries; keep Postgres as system-of-record.

## 6. Stubbed channel service (Rust / axum)
- **Did**: a separate service simulates async delivery lifecycles per channel (WhatsApp, SMS, Email, RCS) and calls back the receipt API.
- **Why**: mirrors a real provider boundary (Twilio/WhatsApp) so the receipt/idempotency design is exercised honestly. Rust for zero-dependency concurrency on the async callback simulation.
- **At scale**: swap the stub for real provider adapters behind the same callback contract; add per-provider rate limiting and retry/backoff.

## 7. BYOK multi-provider AI
- **Did**: provider-agnostic LLM interface (Anthropic/OpenAI/Google); the end user supplies their own key from the UI per request; key travels in headers and is never logged or persisted.
- **Why**: no vendor lock-in, no shared secret, real output for any reviewer regardless of which API key they hold.
- **At scale**: server-side key vault per tenant, usage metering, and a routing layer to pick models by cost/latency.

## 8. Agent loop confirmation gate
- **Did**: `launch_campaign` requires explicit approval before executing; a `PendingTool` with stashed partial results is persisted to Postgres so the loop survives a server restart between pause and resume.
- **Why**: destructive operations (sending to 2k+ customers) must be human-in-the-loop for safety and for the demo.
- **At scale**: add role-based approval, an audit log, and optional scheduled (delayed) launches.

## 9. Live customer count (no cached `customerCount` on Segment)
- **Did**: segment size is computed fresh on every read (`prisma.customer.count({ where: filtersToWhere(filters) })`); the column was removed from the schema.
- **Why**: a cached count grows stale as customers are added/deleted. At 2k customers a live count is fast enough.
- **At scale**: materialise the count with a periodic background job or a DB trigger; cache in Redis with a short TTL.
