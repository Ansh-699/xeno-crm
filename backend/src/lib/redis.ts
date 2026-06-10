import Redis from "ioredis";
import { EventEmitter } from "events";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Main client for commands
export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

// Dedicated subscriber client
export const redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

// EventEmitter for internal pub/sub bridging
export const campaignEvents = new EventEmitter();
campaignEvents.setMaxListeners(1000);

// Subscribe to campaign updates pattern
const subscribedChannels = new Set<string>();

redisSub.on("message", (channel: string, message: string) => {
  campaignEvents.emit(channel, message);
});

export async function subscribeCampaign(campaignId: string): Promise<void> {
  const channel = `campaign:${campaignId}:updates`;
  if (!subscribedChannels.has(channel)) {
    await redisSub.subscribe(channel);
    subscribedChannels.add(channel);
  }
}

export async function unsubscribeCampaign(campaignId: string): Promise<void> {
  const channel = `campaign:${campaignId}:updates`;
  if (subscribedChannels.has(channel)) {
    await redisSub.unsubscribe(channel);
    subscribedChannels.delete(channel);
  }
}

// Increment a status counter for a campaign and publish the update
export async function incrementCampaignCounter(
  campaignId: string,
  status: string
): Promise<void> {
  const key = `campaign:${campaignId}`;
  await redis.hincrby(key, status, 1);
  const update = JSON.stringify({ status, timestamp: new Date().toISOString() });
  await redis.publish(`campaign:${campaignId}:updates`, update);
}

// Get current campaign stats snapshot
export async function getCampaignStats(
  campaignId: string
): Promise<Record<string, string>> {
  const key = `campaign:${campaignId}`;
  return redis.hgetall(key);
}

// Rebuild campaign stats from database events
export async function rebuildCampaignStats(
  campaignId: string,
  events: { status: string; count: number }[]
): Promise<void> {
  const key = `campaign:${campaignId}`;
  await redis.del(key);
  if (events.length === 0) return;
  const pipeline = redis.pipeline();
  for (const e of events) {
    pipeline.hset(key, e.status, e.count.toString());
  }
  await pipeline.exec();
}

export default redis;
