import prisma from "../prisma";
import { getCampaignStats } from "../redis";
import Anthropic from "@anthropic-ai/sdk";

export async function generateCampaignBrief(campaignId: string): Promise<string> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      segment: { select: { name: true, customerCount: true } },
    },
  });

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  // Get stats from Redis
  const stats = await getCampaignStats(campaignId);

  // Get communication status breakdown
  const dbStats = await prisma.communication.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { id: true },
  });

  // Get channel breakdown
  const channelBreakdown = await prisma.communication.groupBy({
    by: ["channel"],
    where: { campaignId },
    _count: { id: true },
  });

  const statusBreakdown = Object.fromEntries(
    dbStats.map((s) => [s.status, s._count.id])
  );
  const channels = Object.fromEntries(
    channelBreakdown.map((c) => [c.channel, c._count.id])
  );

  // Build context for AI analysis
  const analysisContext = {
    campaignName: campaign.name,
    goal: campaign.goal,
    segmentName: campaign.segment?.name || "Unknown Segment",
    totalRecipients: campaign.totalRecipients,
    statusBreakdown,
    channelBreakdown: channels,
    redisStats: stats,
    campaignAge: Math.floor((Date.now() - new Date(campaign.createdAt).getTime()) / 60000) + " minutes",
  };

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: "You are a marketing analytics expert. Provide a concise performance brief (3-5 bullet points) with actionable insights. Be specific with numbers. Highlight channel effectiveness. Note that SMS only supports delivery tracking, so its open/click rates are not applicable.",
    messages: [
      {
        role: "user",
        content: `Analyze this campaign performance:\n\n${JSON.stringify(analysisContext, null, 2)}\n\nProvide a brief with: delivery rate, engagement signals, channel effectiveness, and one actionable recommendation.`,
      },
    ],
  });

  const brief =
    response.content[0].type === "text"
      ? response.content[0].text
      : "Analysis unavailable";

  // Store in campaign
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiBrief: brief },
  });

  return brief;
}
