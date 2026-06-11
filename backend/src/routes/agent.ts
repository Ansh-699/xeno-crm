import { Router, Request, Response } from "express";
import { agentLoop, createRun, AgentEvent } from "../lib/ai/agent-loop";
import { LLMCredentials } from "../lib/ai/llm";
import prisma from "../lib/prisma";

const router = Router();

export function readCreds(req: Request): LLMCredentials {
  const provider = (req.header("x-llm-provider") || "").toLowerCase() as any;
  const apiKey = req.header("x-llm-api-key") || "";
  const model = req.header("x-llm-model") || undefined;
  if (!provider || !apiKey) {
    const e: any = new Error("Missing AI credentials. Set your provider and API key in Settings.");
    e.status = 400;
    throw e;
  }
  return { provider, apiKey, model };
}

/**
 * POST /api/agent/run — Start a new run or resume an existing one.
 * Headers: x-llm-provider, x-llm-api-key, x-llm-model (optional)
 * Body: { runId?: string, message?: string, approved?: boolean }
 * Returns: NDJSON stream
 */
router.post("/run", async (req: Request, res: Response) => {
  let creds: LLMCredentials;
  try {
    creds = readCreds(req);
  } catch (e: any) {
    res.status(e.status || 400).json({ error: e.message });
    return;
  }

  try {
    const { runId, message, approved } = req.body;

    let activeRunId: string;
    if (!runId) {
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "New runs require a 'message' field" });
        return;
      }
      activeRunId = await createRun();
    } else {
      const existing = await prisma.agentRun.findUnique({ where: { id: runId } });
      if (!existing) {
        res.status(404).json({ error: `Run not found: ${runId}` });
        return;
      }
      activeRunId = runId;
    }

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Run-Id", activeRunId);

    res.write(JSON.stringify({ type: "run_started", runId: activeRunId }) + "\n");

    const input: { userMessage?: string; approved?: boolean } = {};
    if (message) input.userMessage = message;
    if (approved !== undefined) input.approved = approved;

    for await (const event of agentLoop(activeRunId, input, creds)) {
      res.write(JSON.stringify(event) + "\n");
    }

    res.end();
  } catch (error: any) {
    console.error("Error in POST /api/agent/run:", error.message);
    if (res.headersSent) {
      res.write(JSON.stringify({ type: "error", error: error.message }) + "\n");
      res.end();
    } else {
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
});

/**
 * GET /api/agent/runs — List recent agent runs
 */
router.get("/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, createdAt: true, updatedAt: true, pendingTool: true },
    });
    res.json({ runs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/agent/runs/:id — Get specific run details
 */
router.get("/runs/:id", async (req: Request, res: Response) => {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params["id"] as string } });
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const messages = (run.messages as any[]).map((msg) => {
      if (!Array.isArray(msg.content)) return { role: msg.role, content: msg.content };
      const textBlocks = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text);
      const toolUseBlocks = msg.content.filter((b: any) => b.type === "tool_use").map((b: any) => ({ tool: b.name, input: b.input }));
      const toolResultBlocks = msg.content.filter((b: any) => b.type === "tool_result").map((b: any) => ({
        toolUseId: b.toolUseId || b.tool_use_id,
        content: b.content,
      }));
      return {
        role: msg.role,
        text: textBlocks.join("\n") || undefined,
        toolUses: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
        toolResults: toolResultBlocks.length > 0 ? toolResultBlocks : undefined,
      };
    });

    res.json({ id: run.id, status: run.status, pendingTool: run.pendingTool, messages, createdAt: run.createdAt, updatedAt: run.updatedAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Legacy endpoint — POST /api/agent (backward compat)
 */
router.post("/", async (req: Request, res: Response) => {
  let creds: LLMCredentials;
  try {
    creds = readCreds(req);
  } catch (e: any) {
    res.status(e.status || 400).json({ error: e.message });
    return;
  }

  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing required field: message" });
      return;
    }

    const runId = await createRun();
    const events: AgentEvent[] = [];
    let fullText = "";

    for await (const event of agentLoop(runId, { userMessage: message }, creds)) {
      events.push(event);
      if (event.type === "text" && event.text) fullText += event.text;
    }

    res.json({ runId, response: fullText || "Actions completed. Check the run for details.", events });
  } catch (error: any) {
    console.error("Error in POST /api/agent:", error.message);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
