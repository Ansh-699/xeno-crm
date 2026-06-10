# Data Model

## Full Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Customer {
  id             String          @id @default(cuid())
  name           String
  email          String?         @unique
  phone          String?
  city           String?
  optedOut       Boolean         @default(false)
  attributes     Json            @default("{}")
  createdAt      DateTime        @default(now())
  orders         Order[]
  communications Communication[]
}

model Order {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  amount     Float
  products   Json
  channel    String
  orderedAt  DateTime

  @@index([customerId])
  @@index([orderedAt])
}

model Segment {
  id            String   @id @default(cuid())
  name          String
  description   String?
  filters       Json
  aiGenerated   Boolean  @default(false)
  customerCount Int      @default(0)
  campaigns     Campaign[]
  createdAt     DateTime @default(now())
}

model Campaign {
  id              String          @id @default(cuid())
  name            String
  segmentId       String
  segment         Segment         @relation(fields: [segmentId], references: [id])
  goal            String?
  status          String          @default("draft")
  messages        Json
  channelStrategy String          @default("per_customer")
  channel         String?
  totalRecipients Int             @default(0)
  launchToken     String?         @unique
  aiBrief         String?
  aiDecisionLog   Json?
  createdAt       DateTime        @default(now())
  completedAt     DateTime?
  communications  Communication[]

  @@index([status])
}

model Communication {
  id           String      @id @default(cuid())
  campaignId   String
  campaign     Campaign    @relation(fields: [campaignId], references: [id])
  customerId   String
  customer     Customer    @relation(fields: [customerId], references: [id])
  channel      String
  destination  String
  content      String
  status       String      @default("pending")
  sentAt       DateTime?
  deliveredAt  DateTime?
  openedAt     DateTime?
  readAt       DateTime?
  clickedAt    DateTime?
  failedAt     DateTime?
  events       CommEvent[]

  @@index([campaignId])
  @@index([customerId])
}

model CommEvent {
  id              String        @id @default(cuid())
  communicationId String
  communication   Communication @relation(fields: [communicationId], references: [id])
  status          String
  timestamp       DateTime
  createdAt       DateTime      @default(now())

  @@unique([communicationId, status])
  @@index([communicationId])
}

model Outbox {
  id          BigInt   @id @default(autoincrement())
  eventType   String
  aggregateId String
  campaignId  String
  payload     Json
  status      String   @default("PENDING")
  attempts    Int      @default(0)
  maxAttempts Int      @default(5)
  nextRetryAt DateTime @default(now())
  processedAt DateTime?
  error       String?
  createdAt   DateTime @default(now())

  @@index([nextRetryAt])
  @@index([campaignId, status])
}

model AgentRun {
  id          String   @id @default(cuid())
  messages    Json
  status      String   @default("active")
  pendingTool Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ChannelDecision {
  id         String   @id @default(cuid())
  segmentId  String
  customerId String
  channel    String
  reason     String
  createdAt  DateTime @default(now())

  @@unique([segmentId, customerId])
  @@index([segmentId])
}
```

## Field Semantics

### Customer
- `email` — optional. WhatsApp/SMS-only customers exist. Postgres allows multiple NULLs under a unique index.
- `phone` — optional. Email-only customers exist.
- `optedOut` — marketing consent flag. Opted-out customers are excluded at campaign launch.
- `attributes` — flexible JSONB for age, gender, preferences, etc. Queryable via segment DSL.

### Campaign
- `status` — lifecycle: `draft` | `queued` | `sending` | `completed` | `failed`
- `messages` — JSON object with merge-field templates per channel: `{ "whatsapp": "Hi {{name}}...", "email": "...", ... }`
- `channelStrategy` — `"per_customer"` (AI picks best channel per customer from ChannelDecision) or `"single"` (one channel for all, specified in `channel` field)
- `channel` — used only when channelStrategy = "single". The single channel to use for all recipients.
- `launchToken` — UUID for idempotency. Prevents double-launch on double-confirm or agent retry.
- `aiBrief` — AI-generated performance analysis (populated on-demand via analyze_performance tool).
- `aiDecisionLog` — records why AI made decisions (channel distribution, exclusions, etc.)

### Communication
- `destination` — snapshot of the customer's email or phone at creation time. Immutable after creation (protects against customer record changing later).
- `content` — hydrated per-customer message (merge fields resolved at launch time).
- `status` — denormalized derived field (max-rank of events from CommEvent). NOT the source of truth.

### CommEvent
- Append-only event log. Source of truth for communication lifecycle.
- `@@unique([communicationId, status])` — one event per (communication, status) pair. The unique constraint is the concurrency-safe idempotency guard (catch Prisma P2002 → return 200).

### Outbox
- `status` — `PENDING` | `PROCESSING` | `SENT` | `DEAD_LETTER`
- `campaignId` — denormalized for efficient completion queries (indexed). Avoids LIKE on aggregate_id.
- `nextRetryAt` — enables exponential backoff without a separate scheduling system.

### AgentRun
- Persists the full Claude message history for resume-after-confirmation.
- `status` — `active` | `awaiting_confirmation` | `completed`
- `pendingTool` — JSON `{name, input, toolUseId}` when paused at confirmation gate.
- TTL: 24 hours. Pruned by periodic cleanup.

### ChannelDecision
- Staging table for per-customer channel recommendations.
- Produced by `recommend_channels` tool, consumed by `launch_campaign`.
- Uses upsert semantics — re-running recommend_channels on same segment updates existing rows.
