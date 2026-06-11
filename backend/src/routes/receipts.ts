import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { incrementCampaignCounter } from "../lib/redis";

const router = Router();

// Status rank map for monotonic progression
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  read: 3,
  clicked: 4,
};

// Status → timestamp field mapping
const STATUS_TIMESTAMP_FIELD: Record<string, string> = {
  sent: "sentAt",
  delivered: "deliveredAt",
  opened: "openedAt",
  read: "readAt",
  clicked: "clickedAt",
  failed: "failedAt",
};

// POST /api/receipts — callback from channel service
router.post("/", async (req: Request, res: Response) => {
  try {
    const { communicationId, status, timestamp } = req.body;

    if (!communicationId || !status) {
      res.status(400).json({ error: "Missing communicationId or status" });
      return;
    }

    // Step 0: Validate status
    const ALLOWED = new Set(["sent", "delivered", "opened", "read", "clicked", "failed"]);
    if (!ALLOWED.has(status)) {
      res.status(400).json({ error: "Unknown status" });
      return;
    }

    // Step 1: Find the communication
    const comm = await prisma.communication.findUnique({
      where: { id: communicationId },
    });

    if (!comm) {
      res.status(404).json({ error: "Communication not found" });
      return;
    }

    // Step 2: If already failed, discard
    if (comm.status === "failed") {
      res.status(200).json({ ok: true, discarded: true });
      return;
    }

    // Step 3: Create CommEvent — catch P2002 (unique violation = duplicate)
    const eventTimestamp = timestamp ? new Date(timestamp) : new Date();
    try {
      await prisma.commEvent.create({
        data: {
          communicationId,
          status,
          timestamp: eventTimestamp,
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        // Duplicate event, return 200
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      throw err;
    }

    // Step 4: Update communication status atomically with monotonicity check
    const tsField = STATUS_TIMESTAMP_FIELD[status];
    const newRank = STATUS_RANK[status] ?? 0;

    if (status === "failed") {
      await prisma.communication.update({
        where: { id: communicationId },
        data: {
          status: "failed",
          failedAt: eventTimestamp,
        },
      });
    } else {
      // Enforce monotonicity in the DB so out-of-order callbacks can't regress status.
      // The timestamp column is injected as a raw identifier (tsField comes from a fixed
      // whitelist), while values stay bound params. 'opened'/'read' share rank 3.
      const tsCol = Prisma.raw(`"${tsField ?? "updatedAt"}"`);
      await prisma.$executeRaw`
        UPDATE "Communication"
        SET status = ${status},
            ${tsCol} = ${eventTimestamp},
            "updatedAt" = NOW()
        WHERE id = ${communicationId}
          AND status != 'failed'
          AND ${newRank} > (CASE status
              WHEN 'pending' THEN 0
              WHEN 'sent' THEN 1
              WHEN 'delivered' THEN 2
              WHEN 'opened' THEN 3
              WHEN 'read' THEN 3
              WHEN 'clicked' THEN 4
              ELSE 0
            END)
      `;
    }

    // Step 5: HINCRBY + PUBLISH (for new events only — we already passed P2002 check)
    await incrementCampaignCounter(comm.campaignId, status);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in POST /api/receipts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
