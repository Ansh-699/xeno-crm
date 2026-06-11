import prisma from "./prisma";
import { filtersToWhere } from "./segments";

interface LaunchInput {
  segmentId: string;
  name: string;
  channel: string;
  channelStrategy?: string;
  messages: Record<string, string>; // channel → template
  launchToken: string;
  goal?: string;
}

interface LaunchResult {
  campaignId: string;
  totalRecipients: number;
  exclusions: {
    optedOut: number;
    noContact: number;
    total: number;
  };
  channelDistribution?: Record<string, number>;
}

// Channel → required contact field
const CHANNEL_CONTACT_FIELD: Record<string, "phone" | "email"> = {
  whatsapp: "phone",
  sms: "phone",
  rcs: "phone",
  email: "email",
};

// Channel fallback order
const CHANNEL_FALLBACK_ORDER = ["whatsapp", "email", "sms", "rcs"];

const BRAND = process.env.BRAND_NAME || "Brewcraft";

// Merge-field hydration
export function hydrateTemplate(
  template: string,
  data: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    if (val === null || val === undefined || val === "") {
      switch (key) {
        case "name":
          return "there";
        case "top_product":
          return `a ${BRAND} favourite`;
        case "city":
          return "";
        case "days_since_last_order":
          return "";
        case "total_orders":
          return "0";
        default:
          return "";
      }
    }
    return String(val);
  });
}

/**
 * Determine if a customer is contactable on a given channel
 */
function isContactable(
  customer: { email: string | null; phone: string | null },
  channel: string
): boolean {
  const field = CHANNEL_CONTACT_FIELD[channel];
  if (!field) return false;
  const val = customer[field];
  return !!val && val.trim() !== "";
}

/**
 * Find the best channel for a customer given available templates
 */
function resolveFallbackChannel(
  customer: { email: string | null; phone: string | null },
  availableTemplates: Record<string, string>
): string | null {
  for (const channel of CHANNEL_FALLBACK_ORDER) {
    if (availableTemplates[channel] && isContactable(customer, channel)) {
      return channel;
    }
  }
  return null;
}

export async function launchCampaign(input: LaunchInput): Promise<LaunchResult> {
  const { segmentId, name, channel, channelStrategy, messages, launchToken, goal } = input;
  const strategy = channelStrategy || "single";

  // 1. Idempotency check
  const existing = await prisma.campaign.findUnique({
    where: { launchToken },
    include: {
      communications: { select: { channel: true } },
    },
  });
  if (existing) {
    const dist: Record<string, number> = {};
    for (const comm of existing.communications) {
      dist[comm.channel] = (dist[comm.channel] || 0) + 1;
    }
    return {
      campaignId: existing.id,
      totalRecipients: existing.totalRecipients,
      exclusions: { optedOut: 0, noContact: 0, total: 0 },
      channelDistribution: dist,
    };
  }

  // 2. Get segment
  const segment = await prisma.segment.findUniqueOrThrow({
    where: { id: segmentId },
  });

  const filters = segment.filters as any;
  const where = filtersToWhere(filters);

  // 3. Get segment members
  const allCustomers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      optedOut: true,
    },
  });

  // 4. Exclude optedOut
  const optedOutCount = allCustomers.filter((c) => c.optedOut).length;
  const eligible = allCustomers.filter((c) => !c.optedOut);

  if (strategy === "per_customer") {
    return launchPerCustomer(
      { segmentId, name, messages, launchToken, goal },
      eligible,
      optedOutCount
    );
  }

  // ─── Single-channel strategy ───────────────────────────────────────────────
  const contactField = CHANNEL_CONTACT_FIELD[channel.toLowerCase()];
  const noContactCount = eligible.filter(
    (c) => !c[contactField] || c[contactField]!.trim() === ""
  ).length;
  const contactable = eligible.filter(
    (c) => c[contactField] && c[contactField]!.trim() !== ""
  );

  if (contactable.length === 0) {
    throw new Error(
      `No contactable customers for channel ${channel}. OptedOut: ${optedOutCount}, NoContact: ${noContactCount}`
    );
  }

  // 5. Build campaign
  const template = messages[channel.toLowerCase()] || messages[Object.keys(messages)[0]] || "";
  const callbackUrl = process.env.CALLBACK_URL || "http://localhost:3001/api/receipts";

  const campaign = await prisma.campaign.create({
    data: {
      name,
      segmentId,
      goal: goal || null,
      status: "queued",
      messages: messages as any,
      channelStrategy: "single",
      channel: channel.toLowerCase(),
      totalRecipients: contactable.length,
      launchToken,
    },
  });

  // 6. Process in chunks of 1000 to prevent memory spikes
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < contactable.length; i += CHUNK_SIZE) {
    const chunk = contactable.slice(i, i + CHUNK_SIZE);
    const chunkCustomerIds = chunk.map((c) => c.id);
    const { orderStatsMap, topProductMap } = await getMergeFieldData(chunkCustomerIds);

    await prisma.$transaction(async (tx) => {
      const commsData = chunk.map((customer) => {
        const stats = orderStatsMap.get(customer.id);
        const daysSinceLastOrder = stats?.lastOrder
          ? Math.floor((Date.now() - new Date(stats.lastOrder).getTime()) / 86400000)
          : null;

        const content = hydrateTemplate(template, {
          name: customer.name,
          city: customer.city,
          top_product: topProductMap.get(customer.id) || null,
          total_orders: stats?.totalOrders ?? null,
          days_since_last_order: daysSinceLastOrder,
        });

        const destination = contactField === "email" ? customer.email! : customer.phone!;

        return {
          customerId: customer.id,
          channel: channel.toLowerCase(),
          destination,
          content,
          campaignId: campaign.id,
        };
      });

      await tx.communication.createMany({ data: commsData });

      const createdComms = await tx.communication.findMany({
        where: { campaignId: campaign.id, customerId: { in: chunkCustomerIds } },
        select: { id: true, channel: true, destination: true, content: true },
      });

      const outboxData = createdComms.map((comm) => ({
        eventType: "SEND_MESSAGE",
        aggregateId: comm.id,
        campaignId: campaign.id,
        payload: {
          communication_id: comm.id,
          channel: comm.channel,
          destination: comm.destination,
          content: comm.content,
          idempotency_key: `${campaign.id}:${comm.id}`,
          callback_url: callbackUrl,
        },
        status: "PENDING",
      }));

      await tx.outbox.createMany({ data: outboxData });
    });
  }

  return {
    campaignId: campaign.id,
    totalRecipients: contactable.length,
    exclusions: {
      optedOut: optedOutCount,
      noContact: noContactCount,
      total: optedOutCount + noContactCount,
    },
    channelDistribution: { [channel.toLowerCase()]: contactable.length },
  };
}

// ─── Per-Customer Strategy ─────────────────────────────────────────────────────

async function launchPerCustomer(
  params: {
    segmentId: string;
    name: string;
    messages: Record<string, string>;
    launchToken: string;
    goal?: string;
  },
  eligible: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    optedOut: boolean;
  }>,
  optedOutCount: number
): Promise<LaunchResult> {
  const { segmentId, name, messages, launchToken, goal } = params;

  // Load ChannelDecision records for this segment
  const decisions = await prisma.channelDecision.findMany({
    where: { segmentId },
  });
  const decisionMap = new Map(decisions.map((d) => [d.customerId, d]));

  // Resolve channel for each customer
  const resolved: Array<{
    customer: (typeof eligible)[0];
    channel: string;
    destination: string;
  }> = [];

  let noContactCount = 0;
  const channelDistribution: Record<string, number> = {};

  for (const customer of eligible) {
    const decision = decisionMap.get(customer.id);
    let resolvedChannel: string | null = null;

    if (decision) {
      // Check if the recommended channel has a template AND customer is contactable
      if (messages[decision.channel] && isContactable(customer, decision.channel)) {
        resolvedChannel = decision.channel;
      } else {
        // Fallback: try channels in order that have a template and are contactable
        resolvedChannel = resolveFallbackChannel(customer, messages);
      }
    } else {
      // No ChannelDecision — use best contactable channel with available template
      resolvedChannel = resolveFallbackChannel(customer, messages);
    }

    if (!resolvedChannel) {
      noContactCount++;
      continue;
    }

    const contactField = CHANNEL_CONTACT_FIELD[resolvedChannel];
    const destination = contactField === "email" ? customer.email! : customer.phone!;

    resolved.push({ customer, channel: resolvedChannel, destination });
    channelDistribution[resolvedChannel] = (channelDistribution[resolvedChannel] || 0) + 1;
  }

  if (resolved.length === 0) {
    throw new Error(
      `No contactable customers with available templates. OptedOut: ${optedOutCount}, NoContact: ${noContactCount}`
    );
  }

  const callbackUrl = process.env.CALLBACK_URL || "http://localhost:3001/api/receipts";

  // Create campaign first
  const campaign = await prisma.campaign.create({
    data: {
      name,
      segmentId,
      goal: goal || null,
      status: "queued",
      messages: messages as any,
      channelStrategy: "per_customer",
      channel: null,
      totalRecipients: resolved.length,
      launchToken,
      aiDecisionLog: channelDistribution as any,
    },
  });

  // Process in chunks
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < resolved.length; i += CHUNK_SIZE) {
    const chunk = resolved.slice(i, i + CHUNK_SIZE);
    const chunkCustomerIds = chunk.map((r) => r.customer.id);
    const { orderStatsMap, topProductMap } = await getMergeFieldData(chunkCustomerIds);

    await prisma.$transaction(async (tx) => {
      const commsData = chunk.map(({ customer, channel, destination }) => {
        const stats = orderStatsMap.get(customer.id);
        const daysSinceLastOrder = stats?.lastOrder
          ? Math.floor((Date.now() - new Date(stats.lastOrder).getTime()) / 86400000)
          : null;

        const template = messages[channel] || "";
        const content = hydrateTemplate(template, {
          name: customer.name,
          city: customer.city,
          top_product: topProductMap.get(customer.id) || null,
          total_orders: stats?.totalOrders ?? null,
          days_since_last_order: daysSinceLastOrder,
        });

        return {
          customerId: customer.id,
          channel,
          destination,
          content,
          campaignId: campaign.id,
        };
      });

      await tx.communication.createMany({ data: commsData });

      const createdComms = await tx.communication.findMany({
        where: { campaignId: campaign.id, customerId: { in: chunkCustomerIds } },
        select: { id: true, channel: true, destination: true, content: true },
      });

      const outboxData = createdComms.map((comm) => ({
        eventType: "SEND_MESSAGE",
        aggregateId: comm.id,
        campaignId: campaign.id,
        payload: {
          communication_id: comm.id,
          channel: comm.channel,
          destination: comm.destination,
          content: comm.content,
          idempotency_key: `${campaign.id}:${comm.id}`,
          callback_url: callbackUrl,
        },
        status: "PENDING",
      }));

      await tx.outbox.createMany({ data: outboxData });
    });
  }

  return {
    campaignId: campaign.id,
    totalRecipients: resolved.length,
    exclusions: {
      optedOut: optedOutCount,
      noContact: noContactCount,
      total: optedOutCount + noContactCount,
    },
    channelDistribution,
  };
}

// ─── Shared Helpers ────────────────────────────────────────────────────────────

async function getMergeFieldData(customerIds: string[]) {
  const [orderStats, orders] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { customerId: { in: customerIds } },
      _count: { id: true },
      _max: { orderedAt: true },
    }),
    prisma.order.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, products: true },
    }),
  ]);

  const orderStatsMap = new Map(
    orderStats.map((s) => [
      s.customerId,
      { totalOrders: s._count.id, lastOrder: s._max.orderedAt },
    ])
  );

  const topProductMap = new Map<string, string>();
  const productFrequencyMap = new Map<string, Map<string, number>>();

  for (const order of orders) {
    const cid = order.customerId;
    if (!productFrequencyMap.has(cid)) productFrequencyMap.set(cid, new Map());
    const freq = productFrequencyMap.get(cid)!;

    const products = order.products as any;
    const items = Array.isArray(products) ? products : typeof products === "string" ? [products] : [];

    for (const item of items) {
      freq.set(item, (freq.get(item) || 0) + 1);
    }
  }

  for (const [cid, freq] of productFrequencyMap.entries()) {
    let top: string | null = null;
    let max = 0;
    for (const [item, count] of freq.entries()) {
      if (count > max) {
        max = count;
        top = item;
      }
    }
    if (top) topProductMap.set(cid, top);
  }

  return { orderStatsMap, topProductMap };
}
