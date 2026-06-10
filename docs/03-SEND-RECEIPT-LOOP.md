# Send/Receipt Loop

## Pattern 1: Transactional Outbox (Reliable Send)

### Problem
Dual-write: if campaign launch creates communication rows AND sends HTTP in sequence, a crash between them creates inconsistent state.

### Solution
Write both communications AND send-intents in ONE Postgres transaction. A separate worker process reads the outbox and does the HTTP.

```sql
BEGIN;
  INSERT INTO communications (...) VALUES (...);  -- N rows
  INSERT INTO outbox (...) VALUES (...);          -- N events
COMMIT;
-- Either both persist or neither does.
```

### Outbox Table Index

```sql
CREATE INDEX idx_outbox_pending ON outbox (next_retry_at)
  WHERE status = 'PENDING';
```

Only covers PENDING rows. PROCESSING is deliberately excluded (the reaper handles those separately).

### Poller Logic (separate Node.js worker process)

1. **Short-claim transaction:** `SELECT ... FOR UPDATE SKIP LOCKED` → mark rows `PROCESSING` → COMMIT (releases lock immediately)
2. **HTTP POST batch of 50** to Channel Service `/send` — OUTSIDE the transaction (no lock held during network I/O)
3. **On success:** mark `SENT`, set `processedAt`. If Campaign.status is still `queued`, set it to `sending`.
4. **On failure:**
   - If `attempts < maxAttempts`: reset to `PENDING`, set `nextRetryAt` with exponential backoff (`min(2^attempts * 1000ms, 300_000ms)`)
   - If `attempts >= maxAttempts`: mark `DEAD_LETTER`. THEN: write a synthetic `CommEvent(status='failed')` for the affected communication, update `Communication.status = 'failed'` + `failedAt`, HINCRBY Redis `failed` counter. This prevents zombie communications stuck at "pending" forever.
5. **Wakeup:** `pg_notify('outbox_new')` trigger via a dedicated `pg.Client` connection (Prisma pool cannot do LISTEN) + fallback 5-second polling interval.
6. **After each batch + on a periodic 10-second sweep:** check campaign completion (see Completion section below).

### Reaper for Stuck PROCESSING Rows

Runs on worker startup + every 60 seconds:
```sql
UPDATE outbox SET status = 'PENDING', next_retry_at = NOW()
WHERE status = 'PROCESSING'
  AND processed_at IS NULL
  AND created_at < NOW() - INTERVAL '60 seconds';
```

Handles the case where the worker crashes after claiming rows but before completing the HTTP.

### Design Choice
Short-claim + reaper (NOT holding the DB transaction open across HTTP). Holding locks during network I/O pins a connection + blocks other pollers. The reaper is the safety net for crash recovery.

---

## Pattern 2: Append-Only Event Log + Monotonic Max-Rank Receipt Handler

### Problem
Callbacks from Channel Service can arrive out of order (network reordering) or duplicated (retries). A strict state machine that rejects "invalid transitions" LOSES events.

### Solution: Log-as-truth + derived status

`CommEvent` is an append-only log. It records EVERY unique (communication_id, status) event regardless of arrival order. The communication's "current status" is derived as the highest-rank event seen so far, with `failed` as a terminal override.

### Status Rank

```typescript
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  read: 3,     // WhatsApp equivalent of opened — same rank
  clicked: 4,
};
// failed is NOT in this map — it's a terminal override handled separately
```

### Receipt Handler Logic (exact steps)

```typescript
async function handleReceipt(receipt: { communicationId, status, timestamp }) {
  // Step 1: Verify communication exists (only 4xx case)
  const comm = await db.communication.findUnique({ where: { id: receipt.communicationId } });
  if (!comm) return { status: 404 };

  // Step 2: If already failed → DISCARD (return 200, do NOT log, do NOT count)
  // Keeps live Redis counters and rebuild-from-comm_events perfectly aligned.
  if (comm.status === 'failed') {
    return { status: 200 };
  }

  // Step 3: Insert event into append-only log
  // The @@unique([communicationId, status]) constraint is the REAL idempotency guard.
  try {
    await db.commEvent.create({
      data: {
        communicationId: receipt.communicationId,
        status: receipt.status,
        timestamp: receipt.timestamp,
      }
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) return { status: 200 }; // duplicate — already processed
    throw e;
  }

  // Step 4: Derive status update
  if (receipt.status === 'failed') {
    // FAILED is terminal — always overrides regardless of current rank
    await db.communication.update({
      where: { id: receipt.communicationId },
      data: { status: 'failed', failedAt: receipt.timestamp },
    });
  } else {
    // Happy path: advance only if newRank > currentRank (monotonic max)
    const newRank = STATUS_RANK[receipt.status] ?? 0;
    const currentRank = STATUS_RANK[comm.status] ?? 0;
    if (newRank > currentRank) {
      await db.communication.update({
        where: { id: receipt.communicationId },
        data: {
          status: receipt.status,
          [`${receipt.status}At`]: receipt.timestamp,
        }
      });
    }
  }

  // Step 5: Hot-path — Redis counter + pub/sub (only fires for NEW events)
  await redis.hincrby(`campaign:${comm.campaignId}`, receipt.status, 1);
  await redis.publish(`campaign:${comm.campaignId}:updates`, JSON.stringify(receipt));

  // ALWAYS return 200 for known communications
  return { status: 200 };
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (e as any)?.code === 'P2002';
}
```

### Key Properties
- **Never rejects a known event.** Always returns 200. Channel Service never dead-letters a valid callback.
- **Order-independent.** `opened` arriving before `delivered` → both logged. Status = max(opened). Late `delivered` gets logged but doesn't regress.
- **Failed is terminal and final.** Once failed, late events are DISCARDED (not logged). This keeps live Redis counters and rebuild-from-comm_events perfectly aligned.
- **Concurrent-safe.** `@@unique` constraint catches the race. P2002 → return 200. No 500s.
- **Rebuildable.** Status = `failed` if any failed event exists, else max-rank of all logged events.

---

## Channel Service (Rust)

### Endpoints
- `POST /send` — receive batch of messages, return 202 Accepted immediately
- `GET /health` — liveness check
- `GET /config` — current channel rates (env-configurable)

### Channel-Aware Event Sequences

Each channel has a specific set of possible status progressions:

| Channel   | Sequence                              | Timing                | Rates                    |
|-----------|---------------------------------------|-----------------------|--------------------------|
| WhatsApp  | sent → delivered → read → clicked     | 1-3s deliver, 5-30s read | 80% deliver, 65% read, 30% click |
| Email     | sent → delivered → opened → clicked   | 5-30s deliver, 60-300s open | 95% deliver, 25% open, 15% click |
| SMS       | sent → delivered                      | 1-5s deliver          | 90% deliver              |
| RCS       | sent → delivered → opened → clicked   | 2-5s deliver, 10-45s open | 85% deliver, 60% open, 25% click |

Each transition is probabilistic. Failed can occur at any delivery step (replaces delivered).

### Behavior
- Callbacks sent INDIVIDUALLY (not batched) — enables real-time SSE UX.
- Retry on CRM callback failure: 3 attempts, exponential backoff (1s, 4s, 16s). After max retries: log + skip (CRM always returns 200 for known comms, so persistent failure means CRM is truly down).
- Backpressure: `tokio::sync::Semaphore` bounds concurrent tasks to 500. Excess awaits.
- Dedup: in-memory `HashMap` with TTL on `idempotency_key`. Loses state on restart — acceptable because CRM receipt handler is idempotent.
- Each message spawns a Tokio task. The task sleeps channel-specific random durations between state transitions.

### State Machine (Rust enum)
```rust
enum MessageStatus {
    Sent,
    Delivered,
    Failed,
    Opened,  // Email, RCS
    Read,    // WhatsApp
    Clicked, // WhatsApp, Email, RCS
}
```

Transitions are channel-aware — the simulator never emits `Read` for Email or `Opened` for WhatsApp.

---

## Campaign Completion

### Definition (single, unambiguous)
A campaign is `completed` when **zero Outbox rows remain in PENDING or PROCESSING state** for that campaign.

### Detection
- Queried using the denormalized `campaignId` column on Outbox (NOT LIKE on aggregate_id):
  ```sql
  SELECT COUNT(*) FROM outbox WHERE campaign_id = $1 AND status NOT IN ('SENT', 'DEAD_LETTER');
  ```
- Checked: after each batch the poller completes + on a periodic 10-second sweep.
- Idempotent: repeated runs with the same result are no-ops.

### Status assignment
- If count = 0 AND all communications have status `failed` → `Campaign.status = 'failed'`
- If count = 0 AND at least one communication succeeded → `Campaign.status = 'completed'`, set `completedAt`

---

## Redis Counter Durability

Redis counters (`campaign:{id}` hash) are a **materialized view** of `comm_events`, NOT the source of truth.

### Rebuild (runs on worker startup for active campaigns + on-demand):
```typescript
async function rebuildCampaignCounters(campaignId: string) {
  const counts = await db.commEvent.groupBy({
    by: ['status'],
    where: { communication: { campaignId } },
    _count: true,
  });
  const hash = Object.fromEntries(counts.map(c => [c.status, c._count]));
  await redis.del(`campaign:${campaignId}`);
  if (Object.keys(hash).length > 0) {
    await redis.hset(`campaign:${campaignId}`, hash);
  }
}
```

### HINCRBY ↔ event insert drift
HINCRBY is not in the same transaction as the CommEvent insert. A crash between them under-counts. The rebuild on worker startup self-heals this drift.

---

## SSE (Server-Sent Events)

### Subscribe-First Pattern
To prevent missing events between snapshot read and subscribe:
1. **Subscribe** to Redis pub/sub channel `campaign:{id}:updates` FIRST
2. **Read** current counter snapshot from Redis hash `campaign:{id}`
3. **Flush** the snapshot to the client as the initial event
4. **Stream** subsequent pub/sub messages as delta events

This eliminates the race where an event fires between reading the snapshot and subscribing.

### Implementation
- Force `runtime = 'nodejs'` on the SSE API route (NOT edge runtime).
- Shared Redis subscriber per process + in-process EventEmitter. Remove listeners on connection close.
