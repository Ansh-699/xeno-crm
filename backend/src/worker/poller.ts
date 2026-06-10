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
    // SELECT FOR UPDATE SKIP LOCKED
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
      SELECT id, "eventType", "aggregateId", "campaignId", payload, attempts, "maxAttempts"
      FROM "Outbox"
      WHERE status = 'PENDING' AND "nextRetryAt" <= NOW()
      ORDER BY "nextRetryAt"
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (batch.length === 0) {
      return;
    }

    const ids = batch.map((row) => row.id);

    // Mark as PROCESSING
    await prisma.$executeRaw`
      UPDATE "Outbox" SET status = 'PROCESSING' WHERE id = ANY(${ids}::bigint[])
    `;

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
        // Mark as SENT
        await prisma.$executeRaw`
          UPDATE "Outbox"
          SET status = 'SENT', "processedAt" = NOW()
          WHERE id = ANY(${ids}::bigint[])
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

          // HINCRBY Redis failed
          await redis.hincrby(`campaign:${row.campaignId}`, "failed", 1);
        } else {
          // Exponential backoff: 5s * 2^attempts
          const backoffMs = 5000 * Math.pow(2, newAttempts);
          const nextRetry = new Date(Date.now() + backoffMs);

          await prisma.$executeRaw`
            UPDATE "Outbox"
            SET status = 'PENDING', attempts = ${newAttempts}, "nextRetryAt" = ${nextRetry}
            WHERE id = ${row.id}
          `;
        }
      }
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
  const result = await prisma.$executeRaw`
    UPDATE "Outbox"
    SET status = 'PENDING'
    WHERE status = 'PROCESSING' AND "createdAt" < ${staleThreshold}
  `;
  if (typeof result === "number" && result > 0) {
    console.log(`[reaper] Reset ${result} stale PROCESSING rows`);
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

      // Generate AI performance brief asynchronously
      generateCampaignBrief(campaign.id)
        .then((brief) => {
          console.log(`[completion] Auto-generated AI performance brief for campaign ${campaign.id}`);
        })
        .catch((err) => {
          console.error(`[completion] Failed to auto-generate AI brief for campaign ${campaign.id}:`, err.message);
        });

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
