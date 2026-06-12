/**
 * Outbox Poller Worker
 * Separate process: run with `npx tsx src/worker/poller.ts`
 *
 * - Listens for pg_notify('outbox_new') + fallback 5s polling
 * - Batches PENDING outbox rows → sends to Channel Service
 * - Handles retries with exponential backoff
 * - Reaps stale PROCESSING rows
 * - Checks campaign completion
 */

import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { generateCampaignBrief } from "../lib/ai/brief-generator";
import { incrementCampaignCounter } from "../lib/redis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const CHANNEL_SERVICE_URL =
  process.env.CHANNEL_SERVICE_URL || "http://localhost:4000";
const BATCH_SIZE = 50;
const POLL_INTERVAL = 5000; // 5s fallback
const REAPER_INTERVAL = 60000; // 60s
const COMPLETION_CHECK_INTERVAL = 10000; // 10s
const STALE_THRESHOLD_MS = 60000; // 60s

let isPolling = false;

// ---- pg_notify listener ----
async function setupPgListener(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/xeno";

  const pgClient = new Client({ connectionString });
  await pgClient.connect();
  await pgClient.query("LISTEN outbox_new");

  pgClient.on("notification", () => {
    // Trigger immediate poll
    if (!isPolling) {
      poll().catch(console.error);
    }
  });

  pgClient.on("error", (err) => {
    console.error("pg listener error:", err);
    // Reconnect after a delay
    setTimeout(() => setupPgListener().catch(console.error), 5000);
  });

  console.log("[poller] Listening on pg_notify channel 'outbox_new'");
}

// ---- Main poll loop ----
async function poll(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    // Drain loop: keep claiming and sending batches until a claim returns fewer than
    // BATCH_SIZE rows, so a large queue empties promptly instead of one batch per 5s
    // fallback tick. The isPolling guard (above) wraps the whole drain, not each batch.
    while (true) {
    // Atomically claim a batch: UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
    // This is a single statement — no gap between the lock and the status update, so a
    // second concurrent poller instance cannot claim the same rows.
    const batch = await prisma.$queryRaw<
      Array<{
        id: bigint;
        eventType: string;
        aggregateId: string;
        campaignId: string;
        payload: any;
        attempts: number;
        maxAttempts: number;
      }>
    >`
      UPDATE "Outbox"
      SET status = 'PROCESSING', "processingAt" = NOW()
      WHERE id IN (
        SELECT id FROM "Outbox"
        WHERE status = 'PENDING'
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
        ORDER BY id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "eventType", "aggregateId", "campaignId", payload, attempts, "maxAttempts"
    `;

    if (batch.length === 0) {
      break;
    }

    // Build messages array for channel service
    const messages = batch.map((row) => {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      return {
        communication_id: payload.communication_id,
        channel: payload.channel,
        destination: payload.destination,
        content: payload.content,
        idempotency_key: payload.idempotency_key,
        callback_url: payload.callback_url,
      };
    });

    // POST to channel service OUTSIDE transaction
    try {
      const resp = await fetch(`${CHANNEL_SERVICE_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (resp.ok) {
        // Mark as SENT — derive ids from the already-claimed batch
        const batchIds = batch.map((row) => row.id);
        await prisma.$executeRaw`
          UPDATE "Outbox"
          SET status = 'SENT', "processedAt" = NOW()
          WHERE id = ANY(${batchIds}::bigint[])
        `;

        // If campaign still queued, move to sending
        const campaignIds = [...new Set(batch.map((r) => r.campaignId))];
        for (const campaignId of campaignIds) {
          await prisma.campaign.updateMany({
            where: { id: campaignId, status: "queued" },
            data: { status: "sending" },
          });
        }

        console.log(`[poller] Sent batch of ${batch.length} messages`);
      } else {
        throw new Error(`Channel service returned ${resp.status}`);
      }
    } catch (err: any) {
      console.error("[poller] Failed to send batch:", err.message);

      // Retry or dead-letter each row
      for (const row of batch) {
        const newAttempts = row.attempts + 1;

        if (newAttempts >= row.maxAttempts) {
          // Dead letter
          await prisma.$executeRaw`
            UPDATE "Outbox"
            SET status = 'DEAD_LETTER', attempts = ${newAttempts}, error = ${err.message}
            WHERE id = ${row.id}
          `;

          // Write synthetic failed CommEvent
          try {
            await prisma.commEvent.create({
              data: {
                communicationId: row.aggregateId,
                status: "failed",
                timestamp: new Date(),
              },
            });
          } catch (_) {
            // Ignore P2002
          }

          // Update Communication status
          await prisma.communication.update({
            where: { id: row.aggregateId },
            data: { status: "failed", failedAt: new Date() },
          });

          // Publish failed event
          await incrementCampaignCounter(row.campaignId, "failed");
        } else {
          // Exponential backoff: 5s * 2^attempts, max 5 minutes
          const backoffMs = Math.min(5000 * Math.pow(2, newAttempts), 300000);
          const nextRetry = new Date(Date.now() + backoffMs);

          await prisma.$executeRaw`
            UPDATE "Outbox"
            SET status = 'PENDING', attempts = ${newAttempts}, "nextRetryAt" = ${nextRetry}
            WHERE id = ${row.id}
          `;
        }
      }
    }

    // A short batch means the queue is drained; otherwise loop and claim more now.
    if (batch.length < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error("[poller] Poll error:", err);
  } finally {
    isPolling = false;
  }
}

// ---- Reaper: reset stale PROCESSING rows ----
async function reap(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  // 1. Identify stale rows
  const staleRows = await prisma.outbox.findMany({
    where: {
      status: "PROCESSING",
      processingAt: { lt: staleThreshold },
    },
    select: { id: true, attempts: true, maxAttempts: true, aggregateId: true, campaignId: true },
  });

  if (staleRows.length === 0) return;

  console.log(`[reaper] Found ${staleRows.length} stale PROCESSING rows`);

  for (const row of staleRows) {
    const newAttempts = row.attempts + 1;
    const isDead = newAttempts >= row.maxAttempts;

    if (isDead) {
      // Mark as DEAD_LETTER
      await prisma.outbox.update({
        where: { id: row.id },
        data: {
          status: "DEAD_LETTER",
          attempts: newAttempts,
          error: "Stale processing timeout (reaper)",
          processingAt: null,
        },
      });

      // Write synthetic failed CommEvent
      try {
        await prisma.commEvent.create({
          data: {
            communicationId: row.aggregateId,
            status: "failed",
            timestamp: new Date(),
          },
        });
      } catch (_) {}

      // Update Communication status
      await prisma.communication.update({
        where: { id: row.aggregateId },
        data: { status: "failed", failedAt: new Date() },
      });

      // Publish failed event
      await incrementCampaignCounter(row.campaignId, "failed");
    } else {
      // Reset to PENDING with backoff
      const backoffMs = Math.min(5000 * Math.pow(2, newAttempts), 300000);
      const nextRetry = new Date(Date.now() + backoffMs);

      await prisma.outbox.update({
        where: { id: row.id },
        data: {
          status: "PENDING",
          attempts: newAttempts,
          nextRetryAt: nextRetry,
          processingAt: null,
        },
      });
    }
  }
}

// ---- Completion checker ----
async function checkCompletion(): Promise<void> {
  // Find campaigns that are 'sending'
  const sendingCampaigns = await prisma.campaign.findMany({
    where: { status: "sending" },
    select: { id: true },
  });

  for (const campaign of sendingCampaigns) {
    const pending = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Outbox"
      WHERE "campaignId" = ${campaign.id}
      AND status NOT IN ('SENT', 'DEAD_LETTER')
    `;

    const pendingCount = Number(pending[0].count);

    if (pendingCount === 0) {
      // Check if there are any dead-lettered rows
      const deadLettered = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Outbox"
        WHERE "campaignId" = ${campaign.id} AND status = 'DEAD_LETTER'
      `;

      const deadCount = Number(deadLettered[0].count);
      const totalOutbox = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Outbox"
        WHERE "campaignId" = ${campaign.id}
      `;
      const total = Number(totalOutbox[0].count);

      // If all dead-lettered, mark failed. Otherwise completed.
      const newStatus =
        deadCount === total ? "failed" : "completed";

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: newStatus,
          completedAt: new Date(),
        },
      });

      console.log(
        `[completion] Campaign ${campaign.id} → ${newStatus}`
      );

      // Generate a static performance brief (worker has no LLM key — fallback template only).
      // For an AI-powered brief, use the "analyze_performance" tool in the agent UI.
      setTimeout(() => {
        generateCampaignBrief(campaign.id)
          .then(() => {
            console.log(`[completion] Fallback brief generated for campaign ${campaign.id} (no LLM key in worker)`);
          })
          .catch((err) => {
            console.error(`[completion] Failed to generate brief for campaign ${campaign.id}:`, err.message);
          });
      }, 30000);

      // Publish completion event
      await redis.publish(
        `campaign:${campaign.id}:updates`,
        JSON.stringify({ type: "complete", status: newStatus })
      );
    }
  }
}

// ---- Main ----
async function main(): Promise<void> {
  console.log("[poller] Starting outbox poller worker...");

  // Setup pg_notify listener
  await setupPgListener().catch((err) => {
    console.warn("[poller] pg_notify setup failed, using polling only:", err.message);
  });

  // Initial reap
  await reap();

  // Fallback polling interval
  setInterval(() => {
    poll().catch(console.error);
  }, POLL_INTERVAL);

  // Reaper interval
  setInterval(() => {
    reap().catch(console.error);
  }, REAPER_INTERVAL);

  // Completion checker
  setInterval(() => {
    checkCompletion().catch(console.error);
  }, COMPLETION_CHECK_INTERVAL);

  // Initial poll
  await poll();

  console.log("[poller] Worker running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[poller] Fatal error:", err);
  process.exit(1);
});
