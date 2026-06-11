import prisma from "../prisma";
import { getCampaignStats } from "../redis";
import { makeProvider, LLMCredentials } from "./llm";

export async function generateCampaignBrief(campaignId: string, creds?: LLMCredentials): Promise<string> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      segment: { select: { name: true } },
    },
  });

  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const stats = await getCampaignStats(campaignId);

  const dbStats = await prisma.communication.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { id: true },
  });

  const channelBreakdown = await prisma.communication.groupBy({
    by: ["channel"],
    where: { campaignId },
    _count: { id: true },
  });

  const statusBreakdown = Object.fromEntries(dbStats.map((s) => [s.status, s._count.id]));
  const channels = Object.fromEntries(channelBreakdown.map((c) => [c.channel, c._count.id]));

  let brief = "";

  if (!creds) {
    // Fallback brief when no provider credentials available
    const sent = Number(stats.sent || 0);
    const delivered = Number(stats.delivered || 0);
    const rate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
    const channelParts = Object.entries(channels).map(([ch, count]) => `${ch}: ${count}`);
    brief = [
      `• Campaign launched to ${campaign.totalRecipients} recipients.`,
      `• Delivery rate reached ${rate}% (${delivered} / ${sent} sent).`,
      `• Channel split: ${channelParts.join(", ")}.`,
      `• Consider monitoring engagement over the next 24 hours.`,
    ].join("\n");
  } else {
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

    const provider = makeProvider(creds);
    const resp = await provider.generate({
      system: "You are a marketing analytics expert. Provide a concise performance brief (3-5 bullet points) with actionable insights. Be specific with numbers. Highlight channel effectiveness. Note that SMS only supports delivery tracking, so its open/click rates are not applicable.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this campaign performance:\n\n${JSON.stringify(analysisContext, null, 2)}\n\nProvide a brief with: delivery rate, engagement signals, channel effectiveness, and one actionable recommendation.`,
            },
          ],
        },
      ],
      tools: [],
      maxTokens: 1024,
    });

    brief = resp.text || "Analysis unavailable";
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { aiBrief: brief } });
  return brief;
}
