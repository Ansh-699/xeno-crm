import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { backfillAttribution } from "../lib/attribution";

const router = Router();

// POST /api/orders/bulk — accepts JSON array of order objects
router.post("/bulk", async (req: Request, res: Response) => {
  try {
    const orders = req.body;

    if (!Array.isArray(orders)) {
      res.status(400).json({ error: "Request body must be an array" });
      return;
    }

    const result = await prisma.order.createMany({
      data: orders.map((o: any) => ({
        customerId: o.customerId,
        amount: o.amount,
        products: o.products,
        channel: o.channel,
        orderedAt: new Date(o.orderedAt),
      })),
    });

    res.status(201).json({ count: result.count });
  } catch (error) {
    console.log("Error in POST /api/orders/bulk:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/orders/backfill-attribution — admin: attribute seeded/existing orders
router.post("/backfill-attribution", async (_req: Request, res: Response) => {
  try {
    const count = await backfillAttribution();
    res.json({ ok: true, ordersProcessed: count });
  } catch (error) {
    console.error("Error in POST /api/orders/backfill-attribution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
