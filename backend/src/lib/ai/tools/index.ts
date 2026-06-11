import prisma from "../../prisma";
import { filtersToWhere, validateFilters } from "../../segments";
import { launchCampaign } from "../../campaign-launcher";
import { getCampaignStats } from "../../redis";
import { createHash } from "crypto";

// Tools that require user confirmation before execution
export const TOOLS_REQUIRING_CONFIRMATION = new Set(["launch_campaign"]);

// Tool definitions — all 9
export const toolDefinitions: Array<{ name: string; description: string; input_schema: Record<string, any> }> = [
  {
    name: "describe_schema",
    description:
      "Returns the queryable fields, operators, and data shape of the CRM database. Use this to understand what filters are available before creating segments or querying customers.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_customers",
    description:
      "Query customers with filter criteria. Returns the total count and up to 5 sample rows. Use this to explore data before creating segments.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          description:
            'Structured filter object with operator (AND/OR) and conditions array. Each condition has field, op (eq/neq/gt/gte/lt/lte/contains/in), and value. Fields: name, email, city, optedOut, createdAt, orders.amount, orders.orderedAt, orders.channel, attributes.*',
          properties: {
            operator: { type: "string", enum: ["AND", "OR"] },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  op: { type: "string" },
                  value: {
                    type: "string",
                    description:
                      "Comparison value. Numbers and dates should be passed as strings (e.g. \"5000\", \"2025-01-01\"); they are coerced server-side.",
                  },
                },
                required: ["field", "op", "value"],
              },
            },
          },
          required: ["operator", "conditions"],
        },
        limit: {
          type: "number",
          description: "Number of sample rows to return (max 10, default 5)",
        },
      },
      required: ["filters"],
    },
  },
  {
    name: "create_segment",
    description:
      "Create a customer segment based on filter criteria. Use this when the user describes an audience they want to target.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A short descriptive name for the segment",
        },
        description: {
          type: "string",
          description: "Natural language description of who this segment targets",
        },
        filters: {
          type: "object",
          description:
            'Structured filter object with operator (AND/OR) and conditions array. Each condition has field, op (eq/neq/gt/gte/lt/lte/contains/in), and value.',
          properties: {
            operator: { type: "string", enum: ["AND", "OR"] },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  op: { type: "string" },
                  value: {
                    type: "string",
                    description:
                      "Comparison value. Numbers and dates should be passed as strings (e.g. \"5000\", \"2025-01-01\"); they are coerced server-side.",
                  },
                },
                required: ["field", "op", "value"],
              },
            },
          },
          required: ["operator", "conditions"],
        },
      },
      required: ["name", "filters"],
    },
  },
  {
    name: "preview_audience",
    description:
      "Preview segment members — returns count and sample customers for a given segment ID or filter criteria.",
    input_schema: {
      type: "object",
      properties: {
        segmentId: {
          type: "string",
          description: "Existing segment ID to preview",
        },
        filters: {
          type: "object",
          description: "Alternative: provide filters directly instead of segmentId",
          properties: {
            operator: { type: "string", enum: ["AND", "OR"] },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  op: { type: "string" },
                  value: {
                    type: "string",
                    description:
                      "Comparison value. Numbers and dates should be passed as strings (e.g. \"5000\", \"2025-01-01\"); they are coerced server-side.",
                  },
                },
                required: ["field", "op", "value"],
              },
            },
          },
          required: ["operator", "conditions"],
        },
      },
      required: [],
    },
  },
  {
    name: "draft_messages",
    description:
      "Validate and prepare message templates with merge fields. Available merge fields: {{name}}, {{top_product}}, {{city}}, {{days_since_last_order}}, {{total_orders}}.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["whatsapp", "email", "sms", "rcs"],
          description: "The channel to draft messages for",
        },
        goal: {
          type: "string",
          description: "The goal of the message (e.g., re-engagement, promotion)",
        },
        tone: {
          type: "string",
          description: "Desired tone (e.g., friendly, professional, urgent)",
        },
        template: {
          type: "string",
          description:
            "The message template with merge fields like {{name}}, {{top_product}}, etc.",
        },
      },
      required: ["channel", "template"],
    },
  },
  {
    name: "recommend_channels",
    description:
      "Analyze customer order history and engagement patterns to recommend the best communication channel per customer in a segment. Upserts ChannelDecision records for each customer.",
    input_schema: {
      type: "object",
      properties: {
        segmentId: {
          type: "string",
          description: "The segment ID to analyze and recommend channels for",
        },
      },
      required: ["segmentId"],
    },
  },
  {
    name: "launch_campaign",
    description:
      "Launch a campaign to send messages to a segment. This action REQUIRES user confirmation before executing. Supports single-channel or per_customer channel strategy.",
    input_schema: {
      type: "object",
      properties: {
        segmentId: {
          type: "string",
          description: "The ID of the segment to target",
        },
        name: {
          type: "string",
          description: "Campaign name",
        },
        channel: {
          type: "string",
          enum: ["whatsapp", "email", "sms", "rcs"],
          description: "Channel to send through (for single-channel strategy)",
        },
        channelStrategy: {
          type: "string",
          enum: ["single", "per_customer"],
          description:
            "Strategy: 'single' uses one channel for all, 'per_customer' uses ChannelDecision per person (run recommend_channels first)",
        },
        messages: {
          type: "object",
          description:
            "Per-channel message templates. Provide a template for each channel you intend to use. Templates may include merge fields like {{name}}, {{top_product}}, {{city}}.",
          properties: {
            whatsapp: { type: "string", description: "WhatsApp message template" },
            email: { type: "string", description: "Email message template" },
            sms: { type: "string", description: "SMS message template" },
            rcs: { type: "string", description: "RCS message template" },
          },
        },
        goal: {
          type: "string",
          description: "Campaign goal/objective",
        },
      },
      required: ["segmentId", "name", "messages"],
    },
  },
  {
    name: "get_campaign_stats",
    description:
      "Get live delivery stats for a campaign from Redis (sent, delivered, opened, failed counts).",
    input_schema: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: "The campaign ID to get stats for",
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "analyze_performance",
    description:
      "Generate an AI-powered performance brief for a campaign. Reads stats and communication statuses, then produces a concise analysis with insights and recommendations.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: "The campaign ID to analyze",
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "compare_campaigns",
    description:
      "Compare the performance of two or more campaigns. Returns side-by-side metrics including delivery, open, and click rates per channel.",
    input_schema: {
      type: "object",
      properties: {
        campaignIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of campaign IDs to compare",
        },
      },
      required: ["campaignIds"],
    },
  },
  {
    name: "get_segment_analytics",
    description:
      "Analyze a segment's size, channel availability, opted-out share, and aggregate performance of previous campaigns sent to it.",
    input_schema: {
      type: "object",
      properties: {
        segmentId: {
          type: "string",
          description: "The segment ID to analyze",
        },
      },
      required: ["segmentId"],
    },
  },
];

// Tool executors
export async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case "describe_schema":
      return executeDescribeSchema();
    case "query_customers":
      return executeQueryCustomers(input);
    case "create_segment":
      return executeCreateSegment(input);
    case "preview_audience":
      return executePreviewAudience(input);
    case "draft_messages":
      return executeDraftMessages(input);
    case "recommend_channels":
      return executeRecommendChannels(input);
    case "launch_campaign":
      return executeLaunchCampaign(input);
    case "get_campaign_stats":
      return executeGetCampaignStats(input);
    case "analyze_performance":
      return executeAnalyzePerformance(input);
    case "compare_campaigns":
      return executeCompareCampaigns(input);
    case "get_segment_analytics":
      return executeGetSegmentAnalytics(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Tool 1: describe_schema ─────────────────────────────────────────────────

function executeDescribeSchema(): Promise<string> {
  return Promise.resolve(
    JSON.stringify({
      schema: {
        customer: {
          fields: {
            name: { type: "string", operators: ["eq", "neq", "contains"], note: "Case-insensitive" },
            email: { type: "string", operators: ["eq", "neq", "contains"], note: "Case-insensitive" },
            phone: { type: "string", operators: ["eq", "neq", "contains"], note: "Case-insensitive" },
            city: { type: "string", operators: ["eq", "neq", "contains", "in"], note: "Case-insensitive. Use exact city names like Delhi, Mumbai, Jaipur, etc." },
            optedOut: { type: "boolean", operators: ["eq"] },
            createdAt: { type: "datetime", operators: ["gt", "gte", "lt", "lte", "eq"], note: "Supports relative dates like '30 days ago' or 'last 2 months'" },
          },
          nested: {
            "orders.amount": { type: "number", operators: ["gt", "gte", "lt", "lte", "eq"], note: "Individual order amount, NOT average" },
            "orders.orderedAt": { type: "datetime", operators: ["gt", "gte", "lt", "lte", "eq"], note: "Supports relative dates like '30 days ago' or 'last 2 months'" },
            "orders.channel": { type: "string", operators: ["eq", "in"], values: ["online", "app", "store"] },
          },
          virtual: {
            lastOrderDays: {
              type: "number",
              operators: ["lte"],
              description: "Matches customers who have at least one order in the last N days. Use 'lastOrderDays lte N'. E.g., 'lastOrderDays lte 50' means active in last 50 days.",
            },
          },
          jsonPath: {
            "attributes.*": { type: "any", operators: ["eq", "contains"] },
          },
        },
        filterFormat: {
          description: "Filters use operator (AND/OR) + conditions array. String comparisons are case-insensitive. Dates support relative values.",
          example: {
            operator: "AND",
            conditions: [
              { field: "city", op: "eq", value: "Mumbai" },
              { field: "orders.amount", op: "gt", value: "1000" },
            ],
          },
        },
        commonPatterns: {
          premiumSpenders: "Use 'orders.amount gt <threshold>' to find customers who make large purchases",
          activeRecently: "Use 'lastOrderDays lte N' or 'orders.orderedAt gte <relative_date>' to find recently active customers",
          inactiveCustomers: "Use 'orders.orderedAt lt <relative_date>' to find inactive customers",
          cityBased: "Use 'city eq <city_name>' — matching is case-insensitive",
        },
        mergeFields: ["name", "top_product", "city", "days_since_last_order", "total_orders"],
        channels: ["whatsapp", "email", "sms", "rcs"],
      },
    })
  );
}

// ─── Tool 2: query_customers ─────────────────────────────────────────────────

async function executeQueryCustomers(input: {
  filters: any;
  limit?: number;
}): Promise<string> {
  if (!validateFilters(input.filters)) {
    return JSON.stringify({ error: "Invalid filter format. Use describe_schema to see the correct format." });
  }

  const where = filtersToWhere(input.filters);
  const limit = Math.min(input.limit || 5, 10);

  const [count, samples] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        optedOut: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
  ]);

  return JSON.stringify({
    totalCount: count,
    sampleSize: samples.length,
    samples: samples.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      optedOut: c.optedOut,
      orderCount: c._count.orders,
      createdAt: c.createdAt,
    })),
  });
}

// ─── Tool 3: create_segment ──────────────────────────────────────────────────

async function executeCreateSegment(input: {
  name: string;
  description?: string;
  filters: any;
}): Promise<string> {
  if (!validateFilters(input.filters)) {
    return JSON.stringify({ error: "Invalid filter format" });
  }

  const where = filtersToWhere(input.filters);
  const customerCount = await prisma.customer.count({ where });

  const segment = await prisma.segment.create({
    data: {
      name: input.name,
      description: input.description || null,
      filters: input.filters,
      aiGenerated: true,
    },
  });

  return JSON.stringify({
    success: true,
    segmentId: segment.id,
    name: segment.name,
    customerCount,
    message: `Created segment "${segment.name}" with ${customerCount} matching customers.`,
  });
}

// ─── Tool 4: preview_audience ────────────────────────────────────────────────

async function executePreviewAudience(input: {
  segmentId?: string;
  filters?: any;
}): Promise<string> {
  let where: any;

  if (input.segmentId) {
    const segment = await prisma.segment.findUnique({ where: { id: input.segmentId } });
    if (!segment) {
      return JSON.stringify({ error: `Segment not found: ${input.segmentId}` });
    }
    where = filtersToWhere(segment.filters as any);
  } else if (input.filters) {
    if (!validateFilters(input.filters)) {
      return JSON.stringify({ error: "Invalid filter format" });
    }
    where = filtersToWhere(input.filters);
  } else {
    return JSON.stringify({ error: "Provide either segmentId or filters" });
  }

  const [count, samples] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        optedOut: true,
      },
    }),
  ]);

  const channelAvailability = {
    withEmail: samples.filter((c) => c.email).length,
    withPhone: samples.filter((c) => c.phone).length,
    optedOut: samples.filter((c) => c.optedOut).length,
  };

  return JSON.stringify({
    totalCount: count,
    sampleSize: samples.length,
    samples: samples.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ? "✓" : "✗",
      phone: c.phone ? "✓" : "✗",
      city: c.city,
      optedOut: c.optedOut,
    })),
    channelAvailability,
  });
}

// ─── Tool 5: draft_messages ──────────────────────────────────────────────────

async function executeDraftMessages(input: {
  channel: string;
  goal?: string;
  tone?: string;
  template: string;
}): Promise<string> {
  const validFields = [
    "name",
    "top_product",
    "city",
    "days_since_last_order",
    "total_orders",
  ];
  const usedFields = (input.template.match(/\{\{(\w+)\}\}/g) || []).map((m) =>
    m.replace(/[{}]/g, "")
  );
  const invalidFields = usedFields.filter((f) => !validFields.includes(f));

  if (invalidFields.length > 0) {
    return JSON.stringify({
      warning: `Unknown merge fields: ${invalidFields.join(", ")}. Valid fields: ${validFields.join(", ")}`,
      template: input.template,
      channel: input.channel,
    });
  }

  // Character limits by channel
  const charLimits: Record<string, number> = {
    sms: 160,
    whatsapp: 1000,
    email: 5000,
    rcs: 2000,
  };

  const limit = charLimits[input.channel] || 1000;
  const warning = input.template.length > limit
    ? `Template exceeds recommended ${limit} character limit for ${input.channel} (current: ${input.template.length})`
    : undefined;

  return JSON.stringify({
    success: true,
    channel: input.channel,
    template: input.template,
    mergeFields: usedFields,
    characterCount: input.template.length,
    ...(warning && { warning }),
    message: `Message template ready for ${input.channel} channel.`,
  });
}

// ─── Tool 6: recommend_channels ──────────────────────────────────────────────

async function executeRecommendChannels(input: {
  segmentId: string;
}): Promise<string> {
  const segment = await prisma.segment.findUnique({ where: { id: input.segmentId } });
  if (!segment) {
    return JSON.stringify({ error: `Segment not found: ${input.segmentId}` });
  }

  const where = filtersToWhere(segment.filters as any);
  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      optedOut: true,
      orders: {
        select: { channel: true, orderedAt: true, amount: true },
        orderBy: { orderedAt: "desc" },
        take: 10,
      },
    },
  });

  const distribution: Record<string, number> = {
    whatsapp: 0,
    email: 0,
    sms: 0,
    rcs: 0,
    excluded: 0,
  };

  const decisions: Array<{ segmentId: string; customerId: string; channel: string; reason: string }> = [];

  for (const customer of customers) {
    if (customer.optedOut) {
      distribution.excluded++;
      continue;
    }

    const hasPhone = !!customer.phone;
    const hasEmail = !!customer.email;
    const recentOrders = customer.orders.slice(0, 5);
    const hasRecentOrders = recentOrders.length > 0;
    const orderChannels = recentOrders.map((o) => o.channel.toLowerCase());
    const usesDigital = orderChannels.some((ch) => ch === "online" || ch === "app");

    let channel: string;
    let reason: string;

    if (hasPhone && hasRecentOrders && usesDigital) {
      // Tech-savvy customer with phone: WhatsApp
      channel = "whatsapp";
      reason = "Has phone, recent digital orders (app/online) — high WhatsApp engagement likelihood";
    } else if (hasPhone && hasRecentOrders && !usesDigital) {
      // Phone-only, orders from store: SMS
      channel = "sms";
      reason = "Has phone, orders primarily from store — SMS is direct and simple";
    } else if (hasEmail && !hasPhone) {
      // Email only
      channel = "email";
      reason = "Email-only contact available — no phone number on file";
    } else if (hasPhone && !hasRecentOrders) {
      // Has phone but inactive: SMS as lightweight re-engagement
      channel = "sms";
      reason = "Has phone, no recent orders — SMS for lightweight re-engagement";
    } else if (hasEmail && hasPhone) {
      // Both available, default to whatsapp
      channel = "whatsapp";
      reason = "Both phone and email available — WhatsApp for rich media engagement";
    } else {
      // No contact info
      distribution.excluded++;
      continue;
    }

    distribution[channel]++;
    decisions.push({
      segmentId: input.segmentId,
      customerId: customer.id,
      channel,
      reason,
    });
  }

  // Batch upsert decisions: delete existing and createMany
  await prisma.$transaction([
    prisma.channelDecision.deleteMany({ where: { segmentId: input.segmentId } }),
    prisma.channelDecision.createMany({ data: decisions }),
  ]);

  return JSON.stringify({
    success: true,
    segmentId: input.segmentId,
    totalCustomers: customers.length,
    decisionsCreated: decisions.length,
    distribution,
    message: `Channel recommendations created for ${decisions.length} customers. Distribution: WhatsApp=${distribution.whatsapp}, Email=${distribution.email}, SMS=${distribution.sms}, RCS=${distribution.rcs}, Excluded=${distribution.excluded}.`,
  });
}

// ─── Tool 7: launch_campaign ─────────────────────────────────────────────────

async function executeLaunchCampaign(input: {
  segmentId: string;
  name: string;
  channel?: string;
  channelStrategy?: string;
  messages: Record<string, string>;
  goal?: string;
}): Promise<string> {
  const strategy = input.channelStrategy || (input.channel ? "single" : "per_customer");

  const semanticPayload = `${input.segmentId}:${input.name}:${JSON.stringify(input.messages)}`;
  const stableToken = createHash("sha256").update(semanticPayload).digest("hex");

  const result = await launchCampaign({
    segmentId: input.segmentId,
    name: input.name,
    channel: input.channel || "whatsapp",
    channelStrategy: strategy,
    messages: input.messages,
    launchToken: stableToken,
    goal: input.goal,
  });

  return JSON.stringify({
    success: true,
    campaignId: result.campaignId,
    totalRecipients: result.totalRecipients,
    exclusions: result.exclusions,
    channelDistribution: result.channelDistribution,
    message: `Campaign "${input.name}" launched to ${result.totalRecipients} recipients. ${result.exclusions.total} customers excluded (${result.exclusions.optedOut} opted out, ${result.exclusions.noContact} no contact info).`,
  });
}

// ─── Tool 8: get_campaign_stats ──────────────────────────────────────────────

async function executeGetCampaignStats(input: {
  campaignId: string;
}): Promise<string> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, name: true, status: true, totalRecipients: true, createdAt: true },
  });

  if (!campaign) {
    return JSON.stringify({ error: `Campaign not found: ${input.campaignId}` });
  }

  const stats = await getCampaignStats(input.campaignId);

  // Also get DB-level status breakdown
  const dbStats = await prisma.communication.groupBy({
    by: ["status"],
    where: { campaignId: input.campaignId },
    _count: { id: true },
  });

  const statusBreakdown = Object.fromEntries(
    dbStats.map((s) => [s.status, s._count.id])
  );

  return JSON.stringify({
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignStatus: campaign.status,
    totalRecipients: campaign.totalRecipients,
    createdAt: campaign.createdAt,
    redisStats: stats,
    dbStatusBreakdown: statusBreakdown,
  });
}

import { generateCampaignBrief } from "../brief-generator";
import { getAnalyticsData } from "../../analytics";
import type { LLMCredentials } from "../llm";

let _toolCreds: LLMCredentials | undefined;
export function setToolCreds(c: LLMCredentials | undefined) { _toolCreds = c; }

async function executeAnalyzePerformance(input: {
  campaignId: string;
}): Promise<string> {
  const brief = await generateCampaignBrief(input.campaignId, _toolCreds);
  return JSON.stringify({
    success: true,
    campaignId: input.campaignId,
    brief,
  });
}

async function executeCompareCampaigns(input: { campaignIds: string[] }): Promise<string> {
  const { campaigns } = await getAnalyticsData();
  const toCompare = campaigns.filter(c => input.campaignIds.includes(c.id));
  if (toCompare.length === 0) {
    throw new Error("No matching campaigns found.");
  }
  return JSON.stringify({
    comparisons: toCompare.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      segmentName: c.segmentName,
      totalRecipients: c.totalRecipients,
      stats: c.stats,
      deliveryRate: c.deliveryRate,
      openRate: c.openRate,
    }))
  });
}

async function executeGetSegmentAnalytics(input: { segmentId: string }): Promise<string> {
  const segment = await prisma.segment.findUnique({ where: { id: input.segmentId } });
  if (!segment) {
    throw new Error(`Segment not found: ${input.segmentId}`);
  }

  const where = filtersToWhere(segment.filters as any);
  const customers = await prisma.customer.findMany({
    where,
    select: { email: true, phone: true, optedOut: true }
  });

  const channelAvailability = {
    withEmail: customers.filter((c) => c.email).length,
    withPhone: customers.filter((c) => c.phone).length,
    optedOut: customers.filter((c) => c.optedOut).length,
  };

  const pastCampaigns = await prisma.campaign.findMany({
    where: { segmentId: input.segmentId, status: { in: ["completed", "sending"] } },
    select: { id: true, name: true, status: true, totalRecipients: true, createdAt: true }
  });

  return JSON.stringify({
    segmentId: input.segmentId,
    name: segment.name,
    customerCount: customers.length,
    channelAvailability,
    pastCampaigns
  });
}
