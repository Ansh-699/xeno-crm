import { Router, Request, Response } from "express";
import { agentLoop, createRun, AgentEvent } from "../lib/ai/agent-loop";
import prisma from "../lib/prisma";

const router = Router();

/**
 * POST /api/agent/run — Start a new run or resume an existing one.
 * Body: { runId?: string, message?: string, approved?: boolean }
 * Returns: NDJSON stream (one JSON object per line)
 */
router.post("/run", async (req: Request, res: Response) => {
  try {
    const { runId, message, approved } = req.body;

    let activeRunId: string;

    if (!runId) {
      // Create a new run
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "New runs require a 'message' field" });
        return;
      }
      activeRunId = await createRun();
    } else {
      // Validate existing run
      const existing = await prisma.agentRun.findUnique({ where: { id: runId } });
      if (!existing) {
        res.status(404).json({ error: `Run not found: ${runId}` });
        return;
      }
      activeRunId = runId;
    }

    // Set up NDJSON streaming response
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Run-Id", activeRunId);

    // Send the run ID as the first event
    res.write(JSON.stringify({ type: "run_started", runId: activeRunId }) + "\n");

    // Build input for agent loop
    const input: { userMessage?: string; approved?: boolean } = {};
    if (message) input.userMessage = message;
    if (approved !== undefined) input.approved = approved;

    // Stream events from agent loop
    const generator = agentLoop(activeRunId, input);

    for await (const event of generator) {
      res.write(JSON.stringify(event) + "\n");
    }

    res.end();
  } catch (error: any) {
    console.error("Error in POST /api/agent/run:", error);
    // If headers already sent, write error as NDJSON line
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
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        pendingTool: true,
      },
    });

    res.json({ runs });
  } catch (error: any) {
    console.error("Error in GET /api/agent/runs:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/agent/runs/:id — Get specific run details
 */
router.get("/runs/:id", async (req: Request, res: Response) => {
  try {
    const runId = req.params.id as string;
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    // Extract text content from messages for display
    const messages = (run.messages as any[]).map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content };
      }
      // Array content (tool results or multi-block)
      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text);
        const toolUseBlocks = msg.content
          .filter((b: any) => b.type === "tool_use")
          .map((b: any) => ({ tool: b.name, input: b.input }));
        const toolResultBlocks = msg.content
          .filter((b: any) => b.type === "tool_result")
          .map((b: any) => ({ toolUseId: b.tool_use_id, content: b.content }));

        return {
          role: msg.role,
          text: textBlocks.join("\n") || undefined,
          toolUses: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
          toolResults: toolResultBlocks.length > 0 ? toolResultBlocks : undefined,
        };
      }
      return { role: msg.role, content: msg.content };
    });

    res.json({
      id: run.id,
      status: run.status,
      pendingTool: run.pendingTool,
      messages,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    });
  } catch (error: any) {
    console.error("Error in GET /api/agent/runs/:id:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Legacy endpoint — POST /api/agent (simple request/response, backward compat)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing required field: message" });
      return;
    }

    // Use the new persistent agent loop but collect all output
    const runId = await createRun();
    const events: AgentEvent[] = [];

    const generator = agentLoop(runId, { userMessage: message });
    let fullText = "";

    for await (const event of generator) {
      events.push(event);
      if (event.type === "text" && event.text) {
        fullText += event.text;
      }
    }

    res.json({
      runId,
      response: fullText || "Actions completed. Check the run for details.",
      events,
    });
  } catch (error: any) {
    console.error("Error in POST /api/agent:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
