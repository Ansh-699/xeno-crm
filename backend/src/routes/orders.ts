import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

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

export default router;
