import prisma from "../prisma";
import { toolDefinitions, executeTool, TOOLS_REQUIRING_CONFIRMATION, setToolCreds } from "./tools/index";
import { makeProvider, LLMCredentials, LLMMessage, LLMContentBlock, LLMToolDef } from "./llm";

const SYSTEM_PROMPT = `You are an AI campaign manager for a CRM system called Xeno. You help users create audience segments, draft marketing messages, recommend channels, and launch campaigns.

You have access to the following tools:
- describe_schema: Get the data schema (queryable fields, operators)
- query_customers: Query customers with filters (returns count + sample rows)
- create_segment: Create a customer segment based on filter criteria
- preview_audience: Preview segment members before launching
- draft_messages: Validate and prepare message templates with merge fields
- recommend_channels: Analyze customers and recommend best channel per person
- launch_campaign: Launch a campaign (requires confirmation)
- get_campaign_stats: Get live campaign delivery stats
- analyze_performance: Get an AI-generated performance brief for a campaign
- compare_campaigns: Compare performance across multiple campaigns
- get_segment_analytics: Analyze historical performance for a segment

Available merge fields: {{name}}, {{top_product}}, {{city}}, {{days_since_last_order}}, {{total_orders}}.

When users describe their audience, convert it into structured filters using the segment filter DSL. When they want to send messages, help draft templates. When launching, always recommend channels first if using per_customer strategy.

Be concise and action-oriented. Ask clarifying questions only when truly necessary.`;

export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "confirmation_required" | "end" | "error";
  text?: string;
  toolUse?: { id: string; name: string; input: any };
  toolResult?: { name: string; output: any };
  confirmation?: { toolName: string; input: any; toolUseId: string };
  error?: string;
}

interface PendingTool {
  name: string;
  input: any;
  toolUseId: string;
  // Results of non-confirmation tools that ran in the same turn. Held here so that
  // on approval all tool_results for this assistant turn land in ONE user message.
  partialResults?: LLMContentBlock[];
}

interface AgentRunState {
  id: string;
  messages: LLMMessage[];
  status: "active" | "paused" | "completed" | "failed";
  pendingTool?: PendingTool;
}

async function loadRun(runId: string): Promise<AgentRunState> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  return {
    id: run.id,
    messages: run.messages as unknown as LLMMessage[],
    status: run.status as AgentRunState["status"],
    pendingTool: run.pendingTool as unknown as PendingTool | undefined,
  };
}

async function saveRun(run: AgentRunState): Promise<void> {
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      messages: run.messages as any,
      status: run.status,
      pendingTool: run.pendingTool as any || null,
    },
  });
}

export async function createRun(): Promise<string> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.agentRun.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});

  const run = await prisma.agentRun.create({ data: { messages: [], status: "active" } });
  return run.id;
}

export async function* agentLoop(
  runId: string,
  input: { userMessage?: string; approved?: boolean },
  creds: LLMCredentials
): AsyncGenerator<AgentEvent> {
  let run = await loadRun(runId);

  const makeResultBlock = (toolUseId: string, content: string, isError = false): LLMContentBlock => ({
    type: "tool_result",
    toolUseId,
    content,
    isError,
  });

  // Handle input: new message or approval/rejection
  if (input.userMessage) {
    run.messages.push({ role: "user", content: [{ type: "text", text: input.userMessage }] });
    run.status = "active";
  } else if (input.approved !== undefined && run.pendingTool) {
    const partialResults: LLMContentBlock[] = run.pendingTool.partialResults ?? [];
    if (input.approved) {
      try {
        const result = await executeTool(run.pendingTool.name, run.pendingTool.input);
        const content = typeof result === "string" ? result : JSON.stringify(result);
        run.messages.push({
          role: "user",
          content: [...partialResults, makeResultBlock(run.pendingTool.toolUseId, content)],
        });
        yield { type: "tool_result", toolResult: { name: run.pendingTool.name, output: result } };
      } catch (err: any) {
        run.messages.push({
          role: "user",
          content: [...partialResults, makeResultBlock(run.pendingTool.toolUseId, `Error: ${err.message}`, true)],
        });
        yield { type: "error", error: `Tool execution failed: ${err.message}` };
      }
    } else {
      run.messages.push({
        role: "user",
        content: [
          ...partialResults,
          makeResultBlock(
            run.pendingTool.toolUseId,
            "User rejected this action. Please adjust your approach or ask the user what they'd prefer.",
            true
          ),
        ],
      });
    }
    run.pendingTool = undefined;
    run.status = "active";
  } else if (run.status === "paused" && input.approved === undefined) {
    yield { type: "confirmation_required", confirmation: run.pendingTool as any };
    await saveRun(run);
    return;
  }

  setToolCreds(creds);
  const provider = makeProvider(creds);
  const tools: LLMToolDef[] = toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));

  let iterations = 0;
  const maxIterations = 10;

  while (run.status === "active" && iterations < maxIterations) {
    iterations++;

    try {
      const resp = await provider.generate({
        system: SYSTEM_PROMPT,
        messages: run.messages,
        tools,
        maxTokens: 4096,
      });

      // Yield text and tool_use events
      if (resp.text) yield { type: "text", text: resp.text };
      for (const tu of resp.toolUses) {
        yield { type: "tool_use", toolUse: { id: tu.id, name: tu.name, input: tu.input } };
      }

      // Persist assistant turn in neutral format
      run.messages.push({
        role: "assistant",
        content: [
          ...(resp.text ? [{ type: "text" as const, text: resp.text }] : []),
          ...resp.toolUses.map((t) => ({ type: "tool_use" as const, id: t.id, name: t.name, input: t.input })),
        ],
      });

      if (resp.toolUses.length === 0) {
        run.status = "completed";
        yield { type: "end" };
        break;
      }

      const toolResults: LLMContentBlock[] = [];
      let paused = false;
      let pendingTool: PendingTool | undefined;

      for (const tool of resp.toolUses) {
        if (TOOLS_REQUIRING_CONFIRMATION.has(tool.name)) {
          // Only capture the first confirmation-gated tool per turn to avoid orphaned tool_use.
          if (!pendingTool) {
            pendingTool = { name: tool.name, input: tool.input, toolUseId: tool.id };
            paused = true;
          }
          continue;
        }

        try {
          const result = await executeTool(tool.name, tool.input);
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          toolResults.push(makeResultBlock(tool.id, resultStr));
          yield { type: "tool_result", toolResult: { name: tool.name, output: result } };
        } catch (err: any) {
          toolResults.push(makeResultBlock(tool.id, `Error: ${err.message}`, true));
          yield { type: "error", error: `Tool ${tool.name} failed: ${err.message}` };
        }
      }

      if (paused && pendingTool) {
        // Stash partial results; on approval they'll be emitted in one user message.
        pendingTool.partialResults = toolResults;
        run.pendingTool = pendingTool;
        run.status = "paused";
        yield {
          type: "confirmation_required",
          confirmation: { toolName: pendingTool.name, input: pendingTool.input, toolUseId: pendingTool.toolUseId },
        };
        await saveRun(run);
        return;
      }

      if (toolResults.length > 0) {
        run.messages.push({ role: "user", content: toolResults });
      }

      if (resp.stopReason === "end_turn" || resp.stopReason === "stop") {
        run.status = "completed";
        yield { type: "end" };
        break;
      }
    } catch (err: any) {
      run.status = "failed";
      yield { type: "error", error: err.message };
      break;
    }
  }

  if (iterations >= maxIterations && run.status === "active") {
    run.status = "completed";
    yield { type: "end" };
  }

  await saveRun(run);
}
