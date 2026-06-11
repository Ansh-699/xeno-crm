import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { getAnalyticsData } from "../lib/analytics";

const router = Router();

/**
 * GET /api/stats — Real-time dashboard statistics
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [customers, segments, campaigns] = await Promise.all([
      prisma.customer.count(),
      prisma.segment.count(),
      prisma.campaign.count(),
    ]);
    
    const { overview } = await getAnalyticsData();

    res.json({
      customers,
      segments,
      campaigns,
      deliveryRate: overview.avgDeliveryRate,
    });
  } catch (error) {
    console.error("Error in GET /api/stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;