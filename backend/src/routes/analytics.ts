import { Router, Request, Response } from "express";
import { getAnalyticsData } from "../lib/analytics";

const router = Router();

/**
 * GET /api/analytics — Aggregated analytics across all campaigns
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await getAnalyticsData();
    res.json(data);
  } catch (error) {
    console.error("Error in GET /api/analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
