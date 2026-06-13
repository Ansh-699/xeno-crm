# Design Tradeoffs & Scale Notes

Scope: ~2k customers, ~8k orders, campaigns up to ~2k recipients, single region, one app instance + one poller. Every decision is tuned for "correct, observable, and demoable at this size," with explicit notes on what changes at production scale.

---

## 1. Transactional Outbox instead of a real broker

**Did:** `Communication` + `Outbox` rows written in the **same Prisma transaction** at campaign launch. A separate poller process claims batches with `SELECT ... FOR UPDATE SKIP LOCKED`, marks them `PROCESSING`, then sends to the channel service **outside** the transaction.

**Why:** Guarantees at-least-once delivery and crash-safety without standing up Kafka/SQS. If the process dies mid-launch, the transaction rolls back — no orphaned outbox rows. The channel-service call happens outside the lock so no DB lock is held during an HTTP request.

**At scale:** Replace the poll loop with SQS/Kafka + multiple consumers. Keep the outbox as the transactional write-ahead log.

---

## 2. `FOR UPDATE SKIP LOCKED` + atomic claim

**Did:** A single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` atomically claims a batch. No separate SELECT then UPDATE — the lock is held through the state transition.

**Why:** The two-step pattern (SELECT then UPDATE) has a race window between the read and the write; SKIP LOCKED only helps if the lock is held. The single-statement version is the correct primitive.

**At scale:** Shard the outbox by `campaignId` and run N pollers with non-overlapping shards.

---

## 3. Monotonic receipt ranking

**Did:** Status ranks `pending(0) < sent(1) < delivered(2) < opened=read(3) < clicked(4)`. A lower-rank event never overwrites a higher one. `failed` is terminal and overrides everything. Duplicate receipts are idempotent via `@@unique([communicationId, status])` + P2002 → 200.

**Why:** Channel callbacks arrive out of order and can be retried. The engagement funnel must never regress.

**At scale:** Same logic. Store events append-only (CommEvent already does this) and derive current status as a reduce, enabling replay and audit.

---

## 4. Redis counters for the live funnel

**Did:** `HINCRBY` per event per campaign. SSE endpoint subscribes first, then reads a snapshot, then streams deltas. Counters feed the live Campaigns page without hitting Postgres on every callback.

**Why:** O(1) reads during a live send. Postgres aggregate queries during a 2k-send would be slow.

**At scale:** Redis Cluster. Periodically reconcile counters against `CommEvent` (the source of truth) to heal drift. The analytics page already does this — it falls back to a DB aggregate if Redis returns an empty hash.

---

## 5. Postgres for all persistent state

**Did:** One relational store for customers, orders, segments, campaigns, communications, events, and agent runs.

**Why:** Segmentation filters (the core workload) are relational queries with `orders.*` joins, JSON path expressions, and `some` subqueries — exactly what Postgres does well. One store keeps ops simple.

**At scale:** Read replicas for analytics queries. ClickHouse for funnel aggregates. Postgres remains the system-of-record.

---

## 6. Separate Rust channel service

**Did:** A separate Axum process simulates the full async delivery lifecycle (WhatsApp, SMS, Email, RCS) and calls back the CRM receipt API with realistic delays and per-channel probabilities.

**Why:** Mirrors the real provider boundary (Twilio, Meta Cloud API) so the receipt/idempotency design is exercised honestly. Rust for zero-overhead async concurrency on the callback simulation. In-memory `DashMap` deduplication prevents duplicate callbacks on restart edge cases. Semaphore(500) caps concurrency.

**At scale:** Swap the stub for real provider adapters behind the same callback contract. Add per-provider rate limiting.

---

## 7. BYOK multi-provider AI

**Did:** Provider-agnostic LLM interface supporting Anthropic, OpenAI, and Google. The user supplies their own key per request via the UI Settings panel. The key travels in HTTP headers and is never logged or persisted server-side. Gemini's schema sanitizer strips unsupported JSON-Schema keywords automatically.

**Why:** No vendor lock-in, no shared secret, real AI output for any reviewer regardless of which API key they hold. The app is fully functional without any LLM key (static fallbacks everywhere).

**At scale:** Server-side key vault per tenant, usage metering, model routing by cost/latency.

---

## 8. Agent confirmation gate

**Did:** `launch_campaign` requires explicit user approval before executing. The `PendingTool` + partial results are persisted to Postgres so the agent loop survives a server restart between the pause and the resume. `launch_campaign` uses a semantic hash (`sha256(segmentId:name:messages)`) as the `launchToken` so retried/double-confirmed launches collapse to one campaign.

**Why:** Sending messages to thousands of customers is a destructive, irreversible operation. The confirmation gate is required. The stable token prevents double-sends on network blips or model re-emission.

**At scale:** Role-based approval, audit log, scheduled/delayed launches.

---

## 9. Live segment counts (no cached column)

**Did:** Segment size is computed fresh on every read by running the segment's `filtersToWhere` clause against the live customer table.

**Why:** A cached count drifts the moment any customer is added, updated, or deleted. At 2k customers a live count is fast enough.

**At scale:** Materialise with a DB trigger or a short-TTL Redis cache.

---

## 10. Synchronous validate-then-`createMany` ingestion

**Did:** `POST /api/customers/bulk` and `/api/orders/bulk` validate every row with Zod, partition valid/invalid, bulk-insert valid rows, and report per-row errors. Orders carry an optional unique `externalId` for idempotent re-ingest. Each newly inserted order is attributed inline (7-day most-recent-delivery window).

**Why:** Correct and simple at this scale. Per-row validation means one bad row never fails the whole batch. `skipDuplicates` on `externalId` makes re-posting a batch safe. Inline attribution credits live orders immediately.

**At scale:** Async consumer (pub/sub), attribution as a downstream event handler rather than synchronous in the request.

---

## 11. Stale PROCESSING reaper

**Did:** Poller records `processingAt = NOW()` when claiming a batch. The reaper resets rows where `status = 'PROCESSING' AND processingAt < NOW() - 60s` — not `createdAt`. This prevents the reaper from resetting an in-flight row just because it was created long ago.

**Why:** `createdAt` is the row's birth timestamp. A batch claimed 2 seconds ago on a 10-minute-old row would be incorrectly reaped if `createdAt` were the threshold — causing duplicate delivery.

---

## 12. Unindexed read paths (segment lists & full-table scans)

**Did:** `GET /api/segments` runs a per-segment `count` + `findMany` against the live
customer table (one pair of queries per segment). The customer-summary endpoint and the
server-side health filter both perform full-table scans over `Customer` / `Order`.

**Why:** At ~2k customers these are fast enough and avoid maintaining a cached/materialised
count that would drift on every customer mutation (see §9). The cost is **linear** —
acceptable at this size, but it grows with the customer count and with the number of
segments.

**At scale:** Materialise segment sizes (DB trigger or short-TTL Redis cache), paginate and
index the summary/health queries, and push aggregates to read replicas / a columnar store.

---

## 13. `seen_keys` eviction is a hard `clear()` at 1M keys

**Did:** The channel service's in-memory idempotency set (`seen_keys`) is bounded by a hard
`clear()` once it reaches 1,000,000 keys, rather than per-key TTL/LRU eviction.

**Why:** Simple and allocation-free; 1M keys is far above any realistic single-run volume at
this scale. The trade-off is that a callback whose key was just evicted at the exact 1M
boundary could be reprocessed — a **rare boundary duplicate**. This is harmless because the
CRM receipt handler is itself idempotent (`@@unique([communicationId, status])` → P2002 →
200), so a duplicate callback is absorbed without double-counting.

**At scale:** Replace the hard clear with an LRU / TTL eviction policy (or an external dedup
store) so eviction is gradual rather than a periodic full flush.
