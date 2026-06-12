# AI Agent Layer

## Tools (11 total)

| # | Name | Description | requiresConfirmation |
|---|------|-------------|---------------------|
| 1 | `describe_schema` | Get queryable fields, operators, and data shape for segmentation. Prevents invalid filters. | false |
| 2 | `query_customers` | Query customers with filters. Returns count + sample rows. | false |
| 3 | `create_segment` | Create a named segment from filter criteria (DSL). | false |
| 4 | `preview_audience` | Preview customers in a segment with sample profiles + count. | false |
| 5 | `draft_messages` | Generate channel-specific messages with merge fields for a segment. | false |
| 6 | `recommend_channels` | Recommend best channel per customer based on engagement history. Upserts ChannelDecision. | false |
| 7 | `launch_campaign` | Launch a campaign to a segment. Requires stable launchToken (semantic hash) for idempotency. | **true** |
| 8 | `get_campaign_stats` | Get real-time campaign delivery stats from Redis counters. | false |
| 9 | `analyze_performance` | Generate AI analysis of campaign results. On-demand. | false |
| 10 | `compare_campaigns` | Compare metrics (delivery, open, click rates) across multiple campaigns. | false |
| 11 | `get_segment_analytics` | Analyze historical performance of campaigns sent to a segment. | false |

---

## Agent Loop with Persistent AgentRun

### Flow

> The pseudo-code below is illustrative of the control flow and invariants. The real loop
> calls `provider.generate({ system, messages, tools })` once per turn (non-streaming) and
> reads `toolUses` / `stopReason` from the response to decide whether to run a tool, pause at
> the confirmation gate, or finish — see the Provider Abstraction section below.

```typescript
async function* agentLoop(runId: string, input: { userMessage?: string; approved?: boolean }) {
  let run = await loadRun(runId);

  if (input.userMessage) {
    // Fresh start
    run.messages.push({ role: "user", content: input.userMessage });
    run.status = 'active';
  } else if (input.approved !== undefined && run.pendingTool) {
    // Resuming after confirmation gate
    if (input.approved) {
      const result = await executeTool(run.pendingTool.name, run.pendingTool.input);
      run.messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: run.pendingTool.toolUseId, content: JSON.stringify(result) }]
      });
      yield { type: "tool_result", name: run.pendingTool.name, output: result };
    } else {
      run.messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: run.pendingTool.toolUseId, content: "User rejected this action.", is_error: true }]
      });
    }
    run.pendingTool = undefined;
    run.status = 'active';
  }

  // Main loop — keep calling Claude until done or paused at gate
  while (run.status === 'active') {
    for await (const event of provider.streamWithTools(run.messages, CRM_TOOLS)) {
      if (event.type === "text") yield event;
      if (event.type === "tool_call") {
        const tool = CRM_TOOLS.find(t => t.name === event.name);
        // Record assistant tool_use BEFORE executing
        run.messages.push({
          role: "assistant",
          content: [{ type: "tool_use", id: event.id, name: event.name, input: event.input }]
        });

        if (tool.requiresConfirmation) {
          // PAUSE — persist state
          run.status = 'awaiting_confirmation';
          run.pendingTool = { name: event.name, input: event.input, toolUseId: event.id };
          await saveRun(run);
          yield { type: "confirmation_required", tool: event.name, input: event.input, runId: run.id };
          return;
        }

        const result = await executeTool(event.name, event.input);
        run.messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: event.id, content: JSON.stringify(result) }]
        });
        yield { type: "tool_result", name: event.name, output: result };
      }
      if (event.type === "done") { run.status = 'completed'; break; }
    }
  }
  await saveRun(run);
}
```

### Critical Invariants
- Full message history persisted in `AgentRun` — resume loads complete context
- Assistant `tool_use` block recorded BEFORE execution (so it's in history if we pause)
- On rejection: `tool_result` with `is_error: true` — Claude adjusts plan without re-running prior tools
- On approval: tool executes, result appended, loop continues naturally

---

## launch_campaign Idempotency

`launch_campaign` derives a **stable** `launchToken` from the logical intent — a SHA-256 hash of `segmentId : name : JSON(messages)` — rather than minting a fresh UUID per call. The token is checked before the campaign is created:

```typescript
async function executeLaunchCampaign(input: LaunchInput) {
  const launchToken = sha256(`${input.segmentId}:${input.name}:${JSON.stringify(input.messages)}`);

  const existing = await db.campaign.findUnique({ where: { launchToken } });
  if (existing) return { campaignId: existing.id, alreadyLaunched: true };

  // Create campaign + communications + outbox in one transaction
  return await db.$transaction(async (tx) => { ... });
}
```

Because the token is derived from the request, a double-click, agent retry, resumed `AgentRun`, network replay, or the model re-emitting the same tool call all collapse to the **same** token — the idempotency check returns the original campaign instead of duplicating the send. (A fresh UUID per call would have defeated this — the bug this design fixes.)

---

## Personalization: Merge-Field Templates

### Template Format
Campaign.messages stores templates with `{{merge_fields}}`:
```json
{
  "whatsapp": "Hi {{name}}, your favourite {{top_product}} is calling! 20% off your next order.",
  "email": "Subject: We miss you, {{name}}!\n\nIt's been {{days_since_last_order}} days since your last visit..."
}
```

### Hydration at Launch
When creating Communication rows, each template is hydrated per-customer:
- `{{name}}` → customer.name
- `{{top_product}}` → most-ordered product from their orders
- `{{city}}` → customer.city
- `{{days_since_last_order}}` → days since their last order
- `{{total_orders}}` → count of their orders

The hydrated result is stored in `Communication.content`.

### Fallbacks for Missing Data (NEVER render "undefined")
- `top_product` → `"a Brewcraft favourite"` (if no orders)
- `city` → omit the clause entirely
- `days_since_last_order` → omit the clause entirely
- `total_orders` → `"0"` (if no orders)
- `name` → `"there"` (if somehow null)

### Batch Hydration
Merge-field data (top_product, total_orders, days_since_last_order) MUST be computed with grouped queries, not an N+1 loop. Single query per field across all recipients.

---

## Launch Rules (apply exactly)

### Audience Derivation
The audience is the segment's **current members** — NOT the ChannelDecision rows. ChannelDecision is a lookup/enrichment layer.

```
for each customer in segment.currentMembers:
  if customer.optedOut → exclude (count as opted_out)
  determine channel:
    if channelStrategy == 'single' → use campaign.channel
    if channelStrategy == 'per_customer':
      look up ChannelDecision for (segmentId, customerId)
      if found → use decision.channel
      if not found → use default contactable channel (best available)
  verify contactability:
    if channel requires phone (whatsapp/sms/rcs) AND customer.phone is null → try fallback channel
    if channel requires email AND customer.email is null → try fallback channel
    if NO contactable channel available → exclude (count as unreachable)
  verify template exists:
    if campaign.messages[channel] is undefined → try fallback channel with template
    if no channel has both template AND contactability → exclude (count as unreachable)
  create Communication with resolved channel + hydrated content + destination snapshot
```

### Contactability Guard
```typescript
const CHANNEL_REQUIREMENTS: Record<string, 'phone' | 'email'> = {
  whatsapp: 'phone',
  sms: 'phone',
  rcs: 'phone',
  email: 'email',
};

function getContactableChannels(customer: Customer): string[] {
  return Object.entries(CHANNEL_REQUIREMENTS)
    .filter(([_, field]) => customer[field] != null)
    .map(([channel]) => channel);
}
```

### Channel Fallback Order
When the preferred channel is unavailable (no address or no template): `whatsapp → email → sms → rcs`

### Exclusion Reporting
Launch returns a breakdown:
```json
{
  "campaignId": "...",
  "launched": 1850,
  "excluded": {
    "optedOut": 120,
    "unreachable": 30
  },
  "channelDistribution": { "whatsapp": 1200, "email": 500, "sms": 150 }
}
```
This is stored in `Campaign.aiDecisionLog`.

### recommend_channels Upserts
Re-running `recommend_channels` on the same segment uses upsert (update existing ChannelDecision if it exists, create if not). Never throws on @@unique constraint.

---

## AI Provider Abstraction (BYOK, multi-provider)

The agent is provider-agnostic. The user supplies their own key per request (Bring Your Own Key) via the UI Settings panel; credentials travel in HTTP headers and are never logged or persisted server-side. `makeProvider(creds)` returns the right adapter for `anthropic`, `openai`, or `google` — **all three are implemented**.

```typescript
type LLMProviderName = "anthropic" | "openai" | "google";

interface LLMProvider {
  generate(opts: {
    system: string;
    messages: LLMMessage[];
    tools: LLMToolDef[];
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

interface LLMResponse {
  text: string;
  toolUses: Array<{ id: string; name: string; input: any }>;
  stopReason: string;
}

function makeProvider(creds: LLMCredentials): LLMProvider {
  switch (creds.provider) {
    case "anthropic": return anthropicProvider(creds.apiKey, creds.model);
    case "openai":    return openaiProvider(creds.apiKey, creds.model);
    case "google":    return googleProvider(creds.apiKey, creds.model);
  }
}
```

Notes:
- The agent loop calls `provider.generate(...)` per turn and inspects `toolUses` / `stopReason` to decide whether to run tools or finish — a normalized, non-streaming tool-calling contract shared across all three providers.
- The Google adapter sanitizes tool schemas to Gemini's OpenAPI subset (strips `additionalProperties`, `$schema`, etc.) so the same tool definitions work everywhere.
- The app is fully functional **without** any LLM key: insight/narrative/brief surfaces fall back to data-grounded, non-fabricated content.
