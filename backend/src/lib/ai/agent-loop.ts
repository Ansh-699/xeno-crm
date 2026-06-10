import Anthropic from "@anthropic-ai/sdk";
import prisma from "../prisma";
import { toolDefinitions, executeTool, TOOLS_REQUIRING_CONFIRMATION } from "./tools/index";

const client = new Anthropic();

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
}

interface AgentRunState {
  id: string;
  messages: Anthropic.MessageParam[];
  status: "active" | "paused" | "completed" | "failed";
  pendingTool?: PendingTool;
}

async function loadRun(runId: string): Promise<AgentRunState> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  return {
    id: run.id,
    messages: run.messages as unknown as Anthropic.MessageParam[],
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
  // Clean up old runs (older than 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.agentRun.deleteMany({
    where: { createdAt: { lt: cutoff } },
  }).catch(() => {}); // non-critical

  const run = await prisma.agentRun.create({
    data: {
      messages: [],
      status: "active",
    },
  });
  return run.id;
}

export async function* agentLoop(
  runId: string,
  input: { userMessage?: string; approved?: boolean }
): AsyncGenerator<AgentEvent> {
  let run = await loadRun(runId);

  // Handle input: new message or approval/rejection
  if (input.userMessage) {
    run.messages.push({ role: "user", content: input.userMessage });
    run.status = "active";
  } else if (input.approved !== undefined && run.pendingTool) {
    if (input.approved) {
      // Execute the pending tool
      try {
        const result = await executeTool(run.pendingTool.name, run.pendingTool.input);
        run.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: run.pendingTool.toolUseId,
              content: typeof result === "string" ? result : JSON.stringify(result),
            },
          ],
        });
        yield { type: "tool_result", toolResult: { name: run.pendingTool.name, output: result } };
      } catch (err: any) {
        run.messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: run.pendingTool.toolUseId,
              content: `Error: ${err.message}`,
              is_error: true,
            },
          ],
        });
        yield { type: "error", error: `Tool execution failed: ${err.message}` };
      }
    } else {
      // User rejected
      run.messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: run.pendingTool.toolUseId,
            content: "User rejected this action. Please adjust your approach or ask the user what they'd prefer.",
            is_error: true,
          },
        ],
      });
    }
    run.pendingTool = undefined;
    run.status = "active";
  } else if (run.status === "paused" && input.approved === undefined) {
    // If paused but no approval signal, just return current state
    yield { type: "confirmation_required", confirmation: run.pendingTool as any };
    await saveRun(run);
    return;
  }

  const anthropicTools: Anthropic.Tool[] = toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  let iterations = 0;
  const maxIterations = 10;

  while (run.status === "active" && iterations < maxIterations) {
    iterations++;

    try {
      // Use streaming API
      const stream = client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: anthropicTools,
        messages: run.messages,
      });

      let accumulatedText = "";
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      // Collect streaming events
      const response = await stream.finalMessage();

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          accumulatedText += block.text;
          yield { type: "text", text: block.text };
        } else if (block.type === "tool_use") {
          toolUses.push({ id: block.id, name: block.name, input: block.input });
          yield { type: "tool_use", toolUse: { id: block.id, name: block.name, input: block.input } };
        }
      }

      // Add assistant response to history BEFORE executing tools
      run.messages.push({ role: "assistant", content: response.content });

      // If no tool calls, we're done
      if (toolUses.length === 0) {
        run.status = "completed";
        yield { type: "end" };
        break;
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let paused = false;

      for (const tool of toolUses) {
        if (TOOLS_REQUIRING_CONFIRMATION.has(tool.name)) {
          // Pause for confirmation
          run.pendingTool = { name: tool.name, input: tool.input, toolUseId: tool.id };
          run.status = "paused";
          paused = true;
          yield {
            type: "confirmation_required",
            confirmation: { toolName: tool.name, input: tool.input, toolUseId: tool.id },
          };
          break;
        }

        // Execute non-confirmation tools immediately
        try {
          const result = await executeTool(tool.name, tool.input);
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: resultStr,
          });
          yield { type: "tool_result", toolResult: { name: tool.name, output: result } };
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `Error: ${err.message}`,
            is_error: true,
          });
          yield { type: "error", error: `Tool ${tool.name} failed: ${err.message}` };
        }
      }

      if (paused) {
        // Save and return - waiting for user approval
        await saveRun(run);
        return;
      }

      // Add tool results to history and continue loop
      if (toolResults.length > 0) {
        run.messages.push({ role: "user", content: toolResults });
      }

      // If stop_reason is end_turn and there were tools, continue to get final text
      if (response.stop_reason === "end_turn") {
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
