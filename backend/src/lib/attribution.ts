import prisma from "./prisma";

export const ATTRIBUTION_WINDOW_DAYS = 7;

/**
 * Attribute a single order to the most recent Communication that:
 *  (a) targeted the same customer,
 *  (b) reached at least "delivered" status within the attribution window before the order.
 */
export async function attributeOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  const windowStart = new Date(order.orderedAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86_400_000);

  const comm = await prisma.communication.findFirst({
    where: {
      customerId: order.customerId,
      deliveredAt: { not: null, gte: windowStart, lte: order.orderedAt },
    },
    orderBy: { deliveredAt: "desc" },
    select: { id: true, campaignId: true },
  });

  if (!comm) return null;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      attributedCampaignId: comm.campaignId,
      attributedCommunicationId: comm.id,
      attributedAt: new Date(),
    },
  });

  return comm;
}

/**
 * Backfill attribution for all orders that haven't been attributed yet.
 * Useful after running a campaign on seeded data.
 */
export async function backfillAttribution(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { attributedCommunicationId: null },
    select: { id: true },
  });
  for (const o of orders) await attributeOrder(o.id);
  return orders.length;
}
