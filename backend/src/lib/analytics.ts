import prisma from "./prisma";
import { getCampaignStats } from "./redis";

export async function getAnalyticsData() {
  // 1. Get all campaigns with their communications grouped by channel
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["completed", "sending", "failed"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      channel: true,
      channelStrategy: true,
      totalRecipients: true,
      createdAt: true,
      completedAt: true,
      aiBrief: true,
      segment: { select: { name: true } },
    },
  });

  // 2. Get per-channel aggregated stats from CommEvents
  const channelStats = await prisma.$queryRaw<
    { channel: string; status: string; count: bigint }[]
  >`
    SELECT c.channel, ce.status, COUNT(*)::bigint as count
    FROM "CommEvent" ce
    JOIN "Communication" c ON ce."communicationId" = c.id
    GROUP BY c.channel, ce.status
    ORDER BY c.channel, ce.status
  `;

  // Build per-channel map
  const perChannel: Record<string, Record<string, number>> = {};
  for (const row of channelStats) {
    const ch = row.channel;
    if (!perChannel[ch]) perChannel[ch] = {};
    perChannel[ch][row.status] = Number(row.count);
  }

  // 3. Get per-campaign stats from Redis (fast path) with fallback to DB
  const campaignDetails = await Promise.all(
    campaigns.map(async (camp) => {
      // Try Redis first
      let stats: Record<string, any> = await getCampaignStats(camp.id);

      // If Redis is empty, compute from DB
      if (Object.keys(stats).length === 0) {
        const dbStats = await prisma.commEvent.groupBy({
          by: ["status"],
          where: { communication: { campaignId: camp.id } },
          _count: true,
        });
        stats = Object.fromEntries(dbStats.map((s) => [s.status, s._count]));
      }

      // Get channel distribution for this campaign
      const channelDist = await prisma.communication.groupBy({
        by: ["channel"],
        where: { campaignId: camp.id },
        _count: true,
      });

      const channels = Object.fromEntries(
        channelDist.map((cd) => [cd.channel, cd._count])
      );

      const sent = Number(stats.sent || 0);
      const delivered = Number(stats.delivered || 0);
      const failed = Number(stats.failed || 0);
      const opened = Number(stats.opened || 0);
      const read = Number(stats.read || 0);
      const clicked = Number(stats.clicked || 0);

      // "opened" and "read" are the same rank-3 engagement stage (email emits "opened",
      // WhatsApp emits "read"), so a delivered message reaches it at most once. Treat the
      // pair as a single unique-open count and divide by DELIVERED (not sent); cap at
      // delivered so the rate can never exceed 100%.
      const uniqueOpened = Math.min(opened + read, delivered);
      const uniqueClicked = Math.min(clicked, delivered);

      return {
        id: camp.id,
        name: camp.name,
        status: camp.status,
        channel: camp.channel,
        channelStrategy: camp.channelStrategy,
        totalRecipients: camp.totalRecipients,
        segmentName: camp.segment?.name || null,
        createdAt: camp.createdAt,
        completedAt: camp.completedAt,
        aiBrief: camp.aiBrief,
        channels,
        stats: { sent, delivered, failed, opened, read, clicked },
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
        openRate: delivered > 0 ? Math.round((uniqueOpened / delivered) * 100) : 0,
        clickRate: delivered > 0 ? Math.round((uniqueClicked / delivered) * 100) : 0,
        // Conversion attribution
        conversions: 0,
        attributedRevenue: 0,
        conversionRate: 0,
      };
    })
  );

  // Enrich each campaign with attributed orders
  await Promise.all(
    campaignDetails.map(async (camp) => {
      const conv = await prisma.order.aggregate({
        where: { attributedCampaignId: camp.id },
        _count: { id: true },
        _sum: { amount: true },
      });
      camp.conversions = conv._count.id;
      camp.attributedRevenue = Math.round(conv._sum.amount ?? 0);
      camp.conversionRate =
        camp.stats.delivered > 0
          ? Math.round((camp.conversions / camp.stats.delivered) * 100)
          : 0;
    })
  );

  // 4. Compute overview metrics
  const totalSent = campaignDetails.reduce((s, c) => s + c.stats.sent, 0);
  const totalDelivered = campaignDetails.reduce(
    (s, c) => s + c.stats.delivered,
    0
  );
  const totalFailed = campaignDetails.reduce((s, c) => s + c.stats.failed, 0);
  const totalOpened = campaignDetails.reduce(
    (s, c) => s + c.stats.opened + c.stats.read,
    0
  );
  const totalClicked = campaignDetails.reduce(
    (s, c) => s + c.stats.clicked,
    0
  );

  // Find best performing channel by delivery rate
  let bestChannel = "—";
  let bestRate = 0;
  for (const [ch, stats] of Object.entries(perChannel)) {
    const chSent = Number(stats.sent || 0);
    const chDelivered = Number(stats.delivered || 0);
    if (chSent > 0) {
      const rate = chDelivered / chSent;
      if (rate > bestRate) {
        bestRate = rate;
        bestChannel = ch;
      }
    }
  }

  const totalConversions = campaignDetails.reduce((s, c) => s + c.conversions, 0);
  const totalAttributedRevenue = campaignDetails.reduce((s, c) => s + c.attributedRevenue, 0);

  const overview = {
    totalCampaigns: campaigns.length,
    totalSent,
    totalDelivered,
    totalFailed,
    totalOpened,
    totalClicked,
    totalConversions,
    totalAttributedRevenue,
    avgDeliveryRate:
      totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
    avgOpenRate:
      totalDelivered > 0
        ? Math.min(100, Math.round((totalOpened / totalDelivered) * 100))
        : 0,
    overallConversionRate:
      totalDelivered > 0 ? Math.round((totalConversions / totalDelivered) * 100) : 0,
    bestChannel,
  };

  return { overview, perChannel, campaigns: campaignDetails };
}
