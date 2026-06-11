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

    const enriched = await Promise.all(segments.map(async (seg) => {
      const where = filtersToWhere(seg.filters as any);
      const liveCount = await prisma.customer.count({ where });
      return { ...seg, customerCount: liveCount };
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
    const limit = parseInt(req.query.limit as string) || 20;

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
      },
    });

    const total = await prisma.customer.count({ where });

    res.json({ customers, total });
  } catch (error) {
    console.error("Error in GET /api/segments/:id/preview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
