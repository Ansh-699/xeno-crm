import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { makeProvider, LLMCredentials } from "../lib/ai/llm";
import { readCreds } from "./agent";
import { getCampaignStats } from "../lib/redis";

const router = Router();

function tryReadCreds(req: Request): LLMCredentials | null {
  try { return readCreds(req); } catch { return null; }
}

/**
 * GET /api/insights — AI-generated contextual insights for the dashboard
 * Returns 3-5 actionable recommendations based on current CRM data.
 * Results are generated fresh but can be cached (TTL 5min) in production.
 */
router.get("/", async (req: Request, res: Response) => {
  const creds = tryReadCreds(req);
  try {
    // Gather data context for AI
    const [
      totalCustomers,
      optedOutCount,
      recentOrders,
      segmentCount,
      campaigns,
      atRiskCustomers,
      topCities,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { optedOut: true } }),
      prisma.order.count({
        where: {
          orderedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.segment.count(),
      prisma.campaign.findMany({
        where: { status: { in: ["completed", "sending", "failed"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          channel: true,
          totalRecipients: true,
          aiBrief: true,
          createdAt: true,
        },
      }),
      // Customers with no orders in 30+ days who HAVE ordered before
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT c.id)::bigint as count
        FROM "Customer" c
        JOIN "Order" o ON o."customerId" = c.id
        WHERE c."optedOut" = false
        GROUP BY c.id
        HAVING MAX(o."orderedAt") < NOW() - INTERVAL '30 days'
      `.then((rows) => rows.length),
      // Top cities by customer count
      prisma.$queryRaw<{ city: string; count: bigint }[]>`
        SELECT city, COUNT(*)::bigint as count
        FROM "Customer"
        WHERE city IS NOT NULL
        GROUP BY city
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    // Get stats for recent campaigns
    const campaignStats = await Promise.all(
      campaigns.map(async (c) => {
        const stats = await getCampaignStats(c.id);
        return {
          name: c.name,
          status: c.status,
          channel: c.channel,
          recipients: c.totalRecipients,
          sent: Number(stats.sent || 0),
          delivered: Number(stats.delivered || 0),
          failed: Number(stats.failed || 0),
          opened: Number(stats.opened || 0),
        };
      })
    );

    const context = JSON.stringify({
      totalCustomers,
      optedOutCustomers: optedOutCount,
      ordersLast30Days: recentOrders,
      segmentCount,
      atRiskCustomers,
      topCities: topCities.map((c) => ({
        city: c.city,
        count: Number(c.count),
      })),
      recentCampaigns: campaignStats,
    });

    let insights: any[] = [];

    if (!creds) {
      // No LLM key: emit only insights that are grounded in the real data above.
      const grounded: any[] = [];

      // Churn risk — only when there actually are at-risk customers.
      if (Number(atRiskCustomers) > 0) {
        grounded.push({
          icon: "warning",
          title: "High Risk Churn Segment Identified",
          body: `${atRiskCustomers} customers who previously ordered haven't placed an order in over 30 days. Consider a win-back discount campaign.`,
          action: { label: "Create Segment", href: "/segments" },
          priority: "high",
        });
      }

      // Channel comparison — only when WhatsApp genuinely out-delivers SMS.
      const byChannel: Record<string, { sent: number; delivered: number }> = {};
      for (const cs of campaignStats) {
        const ch = (cs.channel || "unknown").toLowerCase();
        if (!byChannel[ch]) byChannel[ch] = { sent: 0, delivered: 0 };
        byChannel[ch].sent += cs.sent;
        byChannel[ch].delivered += cs.delivered;
      }
      const waRate = byChannel.whatsapp?.sent
        ? byChannel.whatsapp.delivered / byChannel.whatsapp.sent
        : null;
      const smsRate = byChannel.sms?.sent
        ? byChannel.sms.delivered / byChannel.sms.sent
        : null;
      if (waRate !== null && smsRate !== null && waRate > smsRate) {
        grounded.push({
          icon: "trend_up",
          title: "WhatsApp Channel is Outperforming",
          body: `WhatsApp delivery (${Math.round(waRate * 100)}%) is outpacing SMS (${Math.round(
            smsRate * 100
          )}%). Consider shifting budget to WhatsApp for upcoming campaigns.`,
          action: { label: "AI Agent", href: "/agent" },
          priority: "medium",
        });
      }

      // Top market — only when the #1 city is actually Delhi; use the real count.
      const topCity = topCities[0];
      if (
        topCity &&
        typeof topCity.city === "string" &&
        topCity.city.toLowerCase() === "delhi"
      ) {
        grounded.push({
          icon: "users",
          title: "Rapid Audience Growth in Delhi",
          body: `Delhi is your top market with ${Number(
            topCity.count
          )} customers. Consider launching a regional special offer.`,
          action: { label: "View Customers", href: "/customers" },
          priority: "low",
        });
      }

      // Always return something actionable, without inventing specifics.
      if (grounded.length === 0) {
        grounded.push({
          icon: "sparkle",
          title: "Your CRM is Ready",
          body: "Import customers and launch a campaign to start generating data-driven insights.",
          action: { label: "Open AI Agent", href: "/agent" },
          priority: "medium",
        });
      }

      return res.json({ insights: grounded, generatedAt: new Date().toISOString() });
    } else {
      const provider = makeProvider(creds);
      const resp = await provider.generate({
        system: `You are an AI marketing advisor embedded in a CRM dashboard for "Brewcraft Coffee", an Indian coffee chain. Generate exactly 3-5 actionable insights based on the current CRM data. Each insight should be a JSON object with:
  - "icon": one of "trend_up", "warning", "users", "target", "sparkle"
  - "title": a short bold headline (max 8 words)
  - "body": one sentence of actionable advice (max 25 words)
  - "action": optional CTA object with "label" (button text) and "href" (page path like "/segments" or "/agent")
  - "priority": "high", "medium", or "low"

  Return ONLY a JSON array. No markdown, no explanation.`,
        messages: [{ role: "user", content: [{ type: "text", text: `Here is the current CRM data:\n${context}` }] }],
        tools: [],
        maxTokens: 1024,
      });

      const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid LLM response structure");
      }
    }

    res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error in GET /api/insights:", error);
    // Return static fallback insights instead of 500
    res.json({
      insights: [
        {
          icon: "sparkle",
          title: "Welcome to Xeno CRM",
          body: "Use the AI Agent to create segments and launch campaigns.",
          action: { label: "Open AI Agent", href: "/agent" },
          priority: "medium",
        },
      ],
      generatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/insights/customer-summary — Workspace-wide customer aggregates
 * Computes total customers, total LTV, opted-out count, and health distribution.
 */
router.get("/customer-summary", async (_req: Request, res: Response) => {
  try {
    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        optedOut: true,
        orders: {
          select: { orderedAt: true, amount: true },
        },
      },
    });

    const now = Date.now();
    let totalLTV = 0;
    let optedOutCount = 0;
    const counts = { loyal: 0, regular: 0, at_risk: 0, churning: 0, new: 0 };

    for (const c of allCustomers) {
      if (c.optedOut) optedOutCount++;

      const orderCount = c.orders.length;
      totalLTV += c.orders.reduce((sum, o) => sum + o.amount, 0);

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

      counts[health]++;
    }

    res.json({
      total: allCustomers.length,
      totalLTV: Math.round(totalLTV),
      optedOutCount,
      counts,
    });
  } catch (error) {
    console.error("Error in GET /api/insights/customer-summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/insights/customer-health — Compute customer health scores
 * Returns health categories for all customers (or a page of them).
 * Supports an optional `health` filter; when set, the health is computed over the
 * full candidate set, filtered, and THEN paginated so `total` reflects the filtered
 * count (not the unfiltered table size).
 */
type EnrichedCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  optedOut: boolean;
  health: "loyal" | "regular" | "at_risk" | "churning" | "new";
  orderCount: number;
  totalSpent: number;
  daysSinceLastOrder: number | null;
  avgOrderGapDays: number | null;
};

const CUSTOMER_HEALTH_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  city: true,
  optedOut: true,
  orders: {
    select: { orderedAt: true, amount: true },
    orderBy: { orderedAt: "desc" as const },
  },
} as const;

function enrichCustomerHealth(c: any, now: number): EnrichedCustomer {
  const orderCount = c.orders.length;
  const lastOrderDate = c.orders[0]?.orderedAt;
  const daysSinceLastOrder = lastOrderDate
    ? Math.floor((now - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const totalSpent = c.orders.reduce((sum: number, o: any) => sum + o.amount, 0);

  // Compute average order gap (frequency)
  let avgOrderGapDays: number | null = null;
  if (orderCount >= 2) {
    const dates = c.orders.map((o: any) => new Date(o.orderedAt).getTime()).sort();
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    avgOrderGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  // Determine health status
  let health: EnrichedCustomer["health"];
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
    totalSpent: Math.round(totalSpent),
    daysSinceLastOrder,
    avgOrderGapDays,
  };
}

const VALID_HEALTH = new Set(["loyal", "regular", "at_risk", "churning", "new"]);

router.get("/customer-health", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string) || "";
    const healthParam = (req.query.health as string) || "all";

    // Build search filter
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const now = Date.now();

    // Fast path: no health filter → paginate in the DB.
    if (healthParam === "all" || !VALID_HEALTH.has(healthParam)) {
      const customers = await prisma.customer.findMany({
        where: searchFilter,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        select: CUSTOMER_HEALTH_SELECT,
      });
      const total = await prisma.customer.count({ where: searchFilter });
      const enriched = customers.map((c) => enrichCustomerHealth(c, now));
      return res.json({ customers: enriched, total });
    }

    // Health-filtered path: health is a derived value, so compute it over the full
    // candidate set, filter, then paginate. `total` is the filtered count.
    const allCustomers = await prisma.customer.findMany({
      where: searchFilter,
      orderBy: { createdAt: "desc" },
      select: CUSTOMER_HEALTH_SELECT,
    });
    const filtered = allCustomers
      .map((c) => enrichCustomerHealth(c, now))
      .filter((c) => c.health === healthParam);
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    res.json({ customers: page, total });
  } catch (error) {
    console.error("Error in GET /api/insights/customer-health:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/insights/suggested-segments — AI-suggested segments based on data patterns
 */
router.get("/suggested-segments", async (req: Request, res: Response) => {
  const creds = tryReadCreds(req);
  try {
    const existingCount = await prisma.segment.count();

    // Get data summary for AI
    const cityDist = await prisma.$queryRaw<{ city: string; count: bigint }[]>`
      SELECT city, COUNT(*)::bigint as count FROM "Customer"
      WHERE city IS NOT NULL GROUP BY city ORDER BY count DESC LIMIT 5
    `;

    const orderStats = await prisma.$queryRaw<
      [{ avg_amount: number; max_amount: number; min_amount: number }]
    >`
      SELECT AVG(amount) as avg_amount, MAX(amount) as max_amount, MIN(amount) as min_amount
      FROM "Order"
    `;

    let suggestions: any[] = [];

    if (!creds) {
      // No LLM key: return generic starter templates clearly labelled as such.
      // These are NOT data-driven AI suggestions — they are common segment archetypes
      // useful as a starting point before real campaign data exists. The one
      // location-based template is grounded in the actual top city from the data.
      const topCity = cityDist.length > 0 ? cityDist[0].city : null;
      suggestions = [
        {
          name: "Win-Back: Dormant High-Spenders",
          description: "Customers with high past spend who haven't ordered recently — prime candidates for a re-engagement discount.",
          naturalLanguage: "Customers who spent over 5000 and last order was more than 45 days ago",
          priority: "high",
          source: "starter",
        },
        {
          name: topCity ? `${topCity} Loyalists` : "City Loyalists",
          description: topCity
            ? `Highly engaged customers in ${topCity} (your highest-volume city) with 5+ orders.`
            : "Highly engaged customers in your highest-volume city with 5+ orders.",
          naturalLanguage: topCity
            ? `Customers in ${topCity} with more than 4 orders`
            : "Customers with more than 4 orders",
          priority: "medium",
          source: "starter",
        },
        {
          name: "First-Purchase Conversion",
          description: "New customers with exactly 1 order — target them before they churn.",
          naturalLanguage: "Customers with exactly 1 order who registered in the last 30 days",
          priority: "low",
          source: "starter",
        },
      ];
    } else {
      const provider = makeProvider(creds);
      const resp = await provider.generate({
        system: `You are a marketing strategist for "Brewcraft Coffee". Suggest 3 high-value customer segments. Return ONLY a JSON array where each object has:
  - "name": segment name (concise, 3-5 words)
  - "description": why this segment matters (1 sentence)
  - "naturalLanguage": the plain-English description a marketer would type to create this segment
  - "priority": "high", "medium", or "low"
  No markdown, no explanation. Just the JSON array.`,
        messages: [{
          role: "user",
          content: [{ type: "text", text: `Data: ${existingCount} segments exist. Cities: ${JSON.stringify(cityDist.map((c) => ({ city: c.city, count: Number(c.count) })))}. Order stats: avg ₹${Math.round(orderStats[0]?.avg_amount || 0)}, max ₹${Math.round(orderStats[0]?.max_amount || 0)}.` }],
        }],
        tools: [],
        maxTokens: 1024,
      });
      const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) suggestions = JSON.parse(jsonMatch[0]);
    }

    res.json({ suggestions, existingCount });
  } catch (error) {
    console.error("Error in GET /api/insights/suggested-segments:", error);
    // Don't fabricate suggestions on error — return an empty list so the UI can degrade.
    res.json({ suggestions: [], existingCount: 0 });
  }
});

/**
 * GET /api/insights/analytics-narrative — AI interpretation of analytics data
 */
router.get("/analytics-narrative", async (req: Request, res: Response) => {
  const creds = tryReadCreds(req);
  try {
    // Get channel performance data
    const channelStats = await prisma.$queryRaw<
      { channel: string; status: string; count: bigint }[]
    >`
      SELECT c.channel, ce.status, COUNT(*)::bigint as count
      FROM "CommEvent" ce
      JOIN "Communication" c ON ce."communicationId" = c.id
      GROUP BY c.channel, ce.status
    `;

    const campaignCount = await prisma.campaign.count({
      where: { status: { in: ["completed", "sending", "failed"] } },
    });

    if (channelStats.length === 0) {
      res.json({
        narrative:
          "No campaign data yet. Launch your first campaign through the AI Agent to see performance insights here.",
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    const context = channelStats.map((s) => ({
      channel: s.channel,
      event: s.status,
      count: Number(s.count),
    }));

    let narrative = "";

    if (!creds) {
      // No LLM key: build a strictly data-grounded narrative. Never name a "best"
      // channel unless the computed stats actually support it.
      let totalSent = 0, totalDelivered = 0, whatsappSent = 0, whatsappDelivered = 0;
      const sentByChannel: Record<string, number> = {};
      context.forEach(c => {
        if (c.event === "sent") {
          totalSent += c.count;
          sentByChannel[c.channel] = (sentByChannel[c.channel] || 0) + c.count;
          if (c.channel === "whatsapp") whatsappSent += c.count;
        }
        if (c.event === "delivered") {
          totalDelivered += c.count;
          if (c.channel === "whatsapp") whatsappDelivered += c.count;
        }
      });

      if (totalSent === 0) {
        narrative = "No sent messages found in the data yet. Launch a campaign to start tracking delivery performance.";
      } else {
        const overallRate = Math.round((totalDelivered / totalSent) * 100);
        // Determine the highest-volume channel from the real data.
        let topChannel = "";
        let topVol = 0;
        for (const [ch, vol] of Object.entries(sentByChannel)) {
          if (vol > topVol) { topVol = vol; topChannel = ch; }
        }
        const whatsappIsTop = topChannel === "whatsapp" && whatsappSent > 0;

        if (whatsappIsTop) {
          // Only claim WhatsApp is the most active channel when it truly leads by volume.
          const waRate = Math.round((whatsappDelivered / whatsappSent) * 100);
          narrative = `Overall delivery rate stands at ${overallRate}% across ${campaignCount} campaign${campaignCount !== 1 ? "s" : ""}. WhatsApp is the most active channel by volume with ${waRate}% delivery efficiency. Because SMS cannot track opens or clicks, WhatsApp offers richer engagement tracking for re-engagement campaigns.`;
        } else {
          // WhatsApp is not the leader — report the overall rate and the real top channel factually, without naming a "best".
          const channelClause = topChannel
            ? ` ${topChannel.charAt(0).toUpperCase() + topChannel.slice(1)} accounts for the highest message volume.`
            : "";
          narrative = `Overall delivery rate stands at ${overallRate}% across ${campaignCount} campaign${campaignCount !== 1 ? "s" : ""}.${channelClause} Review the Analytics page for a full channel breakdown.`;
        }
      }
      return res.json({ narrative, generatedAt: new Date().toISOString() });
    } else {
      const provider = makeProvider(creds);
      const resp = await provider.generate({
        system: `You are a marketing analytics advisor for "Brewcraft Coffee". Write a 2-3 sentence narrative summary of the campaign performance data. Be specific with numbers and percentages. Mention channel comparisons if relevant. Note that SMS cannot track opens/clicks (delivery only). No markdown formatting — plain text only.`,
        messages: [{ role: "user", content: [{ type: "text", text: `${campaignCount} campaigns run. Channel events: ${JSON.stringify(context)}` }] }],
        tools: [],
        maxTokens: 512,
      });
      narrative = resp.text || "Unable to generate narrative.";
    }

    res.json({ narrative, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error in GET /api/insights/analytics-narrative:", error);
    // Don't fabricate channel specifics on error — return a neutral, data-free message.
    res.json({
      narrative:
        "Analytics are temporarily unavailable. Please refresh in a moment to see channel performance.",
      generatedAt: new Date().toISOString(),
    });
  }
});

export default router;
