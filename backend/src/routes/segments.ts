import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { filtersToWhere, validateFilters } from "../lib/segments";

const router = Router();

// POST /api/segments — create a segment
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, description, filters, aiGenerated } = req.body;

    if (!name || !filters) {
      res.status(400).json({ error: "Missing required fields: name, filters" });
      return;
    }

    if (!validateFilters(filters)) {
      res.status(400).json({ error: "Invalid filter format" });
      return;
    }

    // Count matching customers
    const where = filtersToWhere(filters);
    const customerCount = await prisma.customer.count({ where });

    const segment = await prisma.segment.create({
      data: {
        name,
        description: description || null,
        filters,
        aiGenerated: aiGenerated || false,
      },
    });

    res.status(201).json({ ...segment, customerCount });
  } catch (error) {
    console.error("Error in POST /api/segments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/segments — list segments
router.get("/", async (_req: Request, res: Response) => {
  try {
    const segments = await prisma.segment.findMany({
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();

    const enriched = await Promise.all(segments.map(async (seg) => {
      const where = filtersToWhere(seg.filters as any);
      const liveCount = await prisma.customer.count({ where });

      // Fetch all customers in segment with orders for health + revenue computation
      const segCustomers = await prisma.customer.findMany({
        where,
        select: {
          email: true,
          phone: true,
          optedOut: true,
          orders: {
            select: { orderedAt: true, amount: true },
          },
        },
      });

      // Compute segmentRevenue and healthBreakdown in one pass
      let segmentRevenue = 0;
      const healthBreakdown = { loyal: 0, regular: 0, at_risk: 0, churning: 0, new: 0 };
      const reachable = { emailable: 0, textable: 0, optedOut: 0 };

      for (const c of segCustomers) {
        // Revenue
        segmentRevenue += c.orders.reduce((sum, o) => sum + o.amount, 0);

        // Reachability
        if (c.email != null) reachable.emailable++;
        if (c.phone != null) reachable.textable++;
        if (c.optedOut) reachable.optedOut++;

        // Health
        const orderCount = c.orders.length;
        const sortedOrders = [...c.orders].sort(
          (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()
        );
        const lastOrderDate = sortedOrders[0]?.orderedAt;
        const daysSinceLastOrder = lastOrderDate
          ? Math.floor((now - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let avgOrderGapDays: number | null = null;
        if (orderCount >= 2) {
          const dates = c.orders.map((o) => new Date(o.orderedAt).getTime()).sort();
          const gaps: number[] = [];
          for (let i = 1; i < dates.length; i++) {
            gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
          }
          avgOrderGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }

        let health: "loyal" | "regular" | "at_risk" | "churning" | "new";
        if (orderCount === 0) {
          health = "new";
        } else if (daysSinceLastOrder !== null && daysSinceLastOrder > 60) {
          health = "churning";
        } else if (
          daysSinceLastOrder !== null &&
          avgOrderGapDays !== null &&
          daysSinceLastOrder > avgOrderGapDays * 2
        ) {
          health = "at_risk";
        } else if (orderCount >= 5) {
          health = "loyal";
        } else {
          health = "regular";
        }

        healthBreakdown[health]++;
      }

      return {
        ...seg,
        customerCount: liveCount,
        segmentRevenue: Math.round(segmentRevenue),
        healthBreakdown,
        reachable,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error in GET /api/segments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/segments/:id — single segment
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const segment = await prisma.segment.findUnique({
      where: { id },
    });
    if (!segment) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }
    res.json(segment);
  } catch (error) {
    console.error("Error in GET /api/segments/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/segments/:id/preview — preview segment members
router.get("/:id/preview", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const segment = await prisma.segment.findUnique({
      where: { id },
    });
    if (!segment) {
      res.status(404).json({ error: "Segment not found" });
      return;
    }

    const where = filtersToWhere(segment.filters as any);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

    const customers = await prisma.customer.findMany({
      where,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        optedOut: true,
        orders: {
          select: { orderedAt: true, amount: true },
          orderBy: { orderedAt: "desc" },
        },
      },
    });

    const total = await prisma.customer.count({ where });

    const now = Date.now();
    const enriched = customers.map((c) => {
      const orderCount = c.orders.length;
      const lastOrderDate = c.orders[0]?.orderedAt;
      const daysSinceLastOrder = lastOrderDate
        ? Math.floor((now - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const totalSpent = Math.round(c.orders.reduce((sum, o) => sum + o.amount, 0));

      let avgOrderGapDays: number | null = null;
      if (orderCount >= 2) {
        const dates = c.orders.map((o) => new Date(o.orderedAt).getTime()).sort();
        const gaps: number[] = [];
        for (let i = 1; i < dates.length; i++) {
          gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        }
        avgOrderGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }

      let health: "loyal" | "regular" | "at_risk" | "churning" | "new";
      if (orderCount === 0) {
        health = "new";
      } else if (daysSinceLastOrder !== null && daysSinceLastOrder > 60) {
        health = "churning";
      } else if (
        daysSinceLastOrder !== null &&
        avgOrderGapDays !== null &&
        daysSinceLastOrder > avgOrderGapDays * 2
      ) {
        health = "at_risk";
      } else if (orderCount >= 5) {
        health = "loyal";
      } else {
        health = "regular";
      }

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        optedOut: c.optedOut,
        health,
        orderCount,
        totalSpent,
        daysSinceLastOrder,
      };
    });

    res.json({ customers: enriched, total });
  } catch (error) {
    console.error("Error in GET /api/segments/:id/preview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
