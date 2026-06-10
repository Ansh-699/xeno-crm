import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { launchCampaign } from "../lib/campaign-launcher";
import {
  subscribeCampaign,
  campaignEvents,
  getCampaignStats,
} from "../lib/redis";

const router = Router();

// POST /api/campaigns/launch
router.post("/launch", async (req: Request, res: Response) => {
  try {
    const { segmentId, name, channel, messages, launchToken, goal } = req.body;

    if (!segmentId || !name || !channel || !messages || !launchToken) {
      res.status(400).json({
        error: "Missing required fields: segmentId, name, channel, messages, launchToken",
      });
      return;
    }

    const result = await launchCampaign({
      segmentId,
      name,
      channel,
      messages,
      launchToken,
      goal,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error in POST /api/campaigns/launch:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /api/campaigns — list campaigns
router.get("/", async (_req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        segment: { select: { name: true } },
        _count: { select: { communications: true } },
      },
    });
    res.json(campaigns);
  } catch (error) {
    console.error("Error in GET /api/campaigns:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/campaigns/:id — single campaign details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        segment: true,
        _count: { select: { communications: true } },
      },
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(campaign);
  } catch (error) {
    console.error("Error in GET /api/campaigns/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/campaigns/:id/live — SSE endpoint for real-time stats
router.get("/:id/live", async (req: Request, res: Response) => {
  const campaignId = req.params.id as string;

  // Verify campaign exists
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Subscribe FIRST pattern
  const channel = `campaign:${campaignId}:updates`;
  await subscribeCampaign(campaignId);

  // Handler for delta events
  const onUpdate = (message: string) => {
    res.write(`data: ${message}\n\n`);
  };

  campaignEvents.on(channel, onUpdate);

  // Read snapshot and flush
  const stats = await getCampaignStats(campaignId);
  res.write(`data: ${JSON.stringify({ type: "snapshot", stats })}\n\n`);

  // Send campaign status
  const freshCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true, totalRecipients: true },
  });
  if (freshCampaign) {
    res.write(
      `data: ${JSON.stringify({ type: "meta", ...freshCampaign })}\n\n`
    );
  }

  // Keepalive
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  // Cleanup on disconnect
  req.on("close", () => {
    campaignEvents.off(channel, onUpdate);
    clearInterval(keepalive);
  });
});

export default router;
