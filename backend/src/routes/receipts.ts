import { Router, Request, Response } from "express";
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

    // Step 4: Update communication status
    const tsField = STATUS_TIMESTAMP_FIELD[status];
    const updateData: any = {};
    if (tsField) {
      updateData[tsField] = eventTimestamp;
    }

    if (status === "failed") {
      // Terminal override
      updateData.status = "failed";
      await prisma.communication.update({
        where: { id: communicationId },
        data: updateData,
      });
    } else {
      // Monotonic rank update: only advance if new rank > current rank
      const newRank = STATUS_RANK[status] ?? 0;
      const currentRank = STATUS_RANK[comm.status] ?? 0;

      if (newRank > currentRank) {
        updateData.status = status;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.communication.update({
          where: { id: communicationId },
          data: updateData,
        });
      }
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
