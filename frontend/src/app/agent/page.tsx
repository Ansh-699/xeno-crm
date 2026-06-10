"use client";

import { useState, useRef, useEffect } from "react";
import { apiStream } from "@/lib/api";
import { Send, Bot, User, Wrench, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolUse?: { name: string; input: any };
  toolResult?: { name: string; output: any };
  isConfirmation?: boolean;
  confirmationData?: { toolName: string; input: any; toolUseId: string };
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg,
    };
    setMessages((prev) => [...prev, userMessage]);
    setStreaming(true);

    try {
      const res = await apiStream("/api/agent/run", {
        runId: runId || undefined,
        message: userMsg,
      });

      if (!res.ok) {
        throw new Error("Failed to start agent run");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let assistantMsgId = crypto.randomUUID();

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event, assistantMsgId, assistantText, (text) => {
              assistantText = text;
            });

            if (event.type === "run_started" && event.runId) {
              setRunId(event.runId);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function handleEvent(
    event: any,
    assistantMsgId: string,
    currentText: string,
    setText: (t: string) => void
  ) {
    switch (event.type) {
      case "text":
        const newText = currentText + (event.text || "");
        setText(newText);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: newText } : m))
        );
        break;

      case "tool_use":
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "tool",
            content: `Calling: ${event.toolUse?.name}`,
            toolUse: event.toolUse,
          },
        ]);
        break;

      case "tool_result":
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "tool",
            content: `Result: ${event.toolResult?.name}`,
            toolResult: event.toolResult,
          },
        ]);
        break;

      case "confirmation_required":
        setAwaitingConfirmation(true);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            isConfirmation: true,
            confirmationData: event.confirmation,
          },
        ]);
        break;

      case "error":
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: `Error: ${event.error}` },
        ]);
        break;
    }
  }

  async function handleConfirmation(approved: boolean) {
    if (!runId) return;
    setAwaitingConfirmation(false);
    setStreaming(true);

    try {
      const res = await apiStream("/api/agent/run", { runId, approved });
      if (!res.ok) throw new Error("Confirmation failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let assistantMsgId = crypto.randomUUID();

      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event, assistantMsgId, assistantText, (text) => {
              assistantText = text;
            });
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function newConversation() {
    setMessages([]);
    setRunId(null);
    setAwaitingConfirmation(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">AI Command Center</h1>
        <button
          onClick={newConversation}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          New Conversation
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-zinc-700 mb-4" />
            <p className="text-zinc-400 text-lg">What would you like to do?</p>
            <p className="text-zinc-600 text-sm mt-2 max-w-md">
              Try: "Create a segment of customers in Mumbai who spent over 5000" or
              "Launch an SMS campaign to re-engage inactive users"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirm={() => handleConfirmation(true)}
            onReject={() => handleConfirmation(false)}
            awaitingConfirmation={awaitingConfirmation}
          />
        ))}

        {streaming && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm px-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={awaitingConfirmation ? "Approve or reject the action above..." : "Describe what you want to do..."}
            disabled={streaming || awaitingConfirmation}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming || awaitingConfirmation}
            className="p-3 rounded-xl bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onConfirm,
  onReject,
  awaitingConfirmation,
}: {
  message: Message;
  onConfirm: () => void;
  onReject: () => void;
  awaitingConfirmation: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[70%] rounded-xl bg-white text-black px-4 py-3 text-sm">
          {message.content}
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-zinc-400" />
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    return (
      <div className="ml-11 my-2">
        {message.toolUse && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
            <Wrench className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-medium text-zinc-300">{message.toolUse.name}</span>
            <span className="text-zinc-600">
              {JSON.stringify(message.toolUse.input).slice(0, 100)}
              {JSON.stringify(message.toolUse.input).length > 100 ? "..." : ""}
            </span>
          </div>
        )}
        {message.toolResult && (
          <ToolResultDisplay name={message.toolResult.name} output={message.toolResult.output} />
        )}
      </div>
    );
  }

  // Confirmation dialog
  if (message.isConfirmation && message.confirmationData) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        </div>
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 max-w-[70%]">
          <p className="text-sm font-medium text-amber-200 mb-2">Confirmation Required</p>
          <p className="text-sm text-zinc-300 mb-1">
            Launch campaign to segment?
          </p>
          <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 mb-3 overflow-x-auto">
            {JSON.stringify(message.confirmationData.input, null, 2)}
          </pre>
          {awaitingConfirmation && (
            <div className="flex items-center gap-2">
              <button
                onClick={onConfirm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/50 text-emerald-300 text-xs font-medium hover:bg-emerald-900/70 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                onClick={onReject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/50 text-red-300 text-xs font-medium hover:bg-red-900/70 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular assistant message
  if (!message.content) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-violet-900/30 flex items-center justify-center flex-shrink-0">
        <Bot className="h-4 w-4 text-violet-400" />
      </div>
      <div className="max-w-[70%] rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-200 whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

function ToolResultDisplay({ name, output }: { name: string; output: any }) {
  const [expanded, setExpanded] = useState(false);
  const data = typeof output === "string" ? tryParse(output) : output;

  // Show a nice summary for common tools
  let summary = "";
  if (data?.success && data?.message) {
    summary = data.message;
  } else if (data?.totalCount !== undefined) {
    summary = `Found ${data.totalCount} customers`;
  } else if (data?.campaignId) {
    summary = `Campaign ${data.campaignId} — ${data.campaignStatus || "launched"}`;
  } else if (data?.brief) {
    summary = data.brief.slice(0, 200);
  }

  return (
    <div className="mt-1 text-xs border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors text-left"
      >
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
        <span className="text-zinc-300 font-medium">{name}</span>
        {summary && <span className="text-zinc-500 truncate ml-1">— {summary}</span>}
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-zinc-400 overflow-x-auto max-h-48 overflow-y-auto bg-zinc-950 border-t border-zinc-800">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function tryParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}
