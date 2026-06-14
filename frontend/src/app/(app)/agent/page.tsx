"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiStream, hasAICredentials } from "@/lib/api";
import { Send, Bot, User, Wrench, CheckCircle, XCircle, Loader2, AlertTriangle, Key } from "lucide-react";
import { AISettingsPanel } from "@/components/AISettings";

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
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AgentContent />
    </Suspense>
  );
}

function AgentContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [credentialsOk, setCredentialsOk] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check credentials on mount and whenever the settings panel closes
  useEffect(() => {
    setCredentialsOk(hasAICredentials());
  }, [showSettings]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasAutoSent && !streaming && messages.length === 0) {
      setHasAutoSent(true);
      autoSendMessage(q);
    }
  }, [searchParams, hasAutoSent, streaming, messages]);

  async function autoSendMessage(text: string) {
    const userMsg = text.trim();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg,
    };
    setMessages([userMessage]);
    setStreaming(true);

    try {
      const res = await apiStream("/api/agent/run", { message: userMsg });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 400 && body.error?.includes("credentials")) { setShowSettings(true); throw new Error(body.error); }
        throw new Error(body.error || "Failed to start agent run");
      }

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
            if (event.type === "run_started" && event.runId) setRunId(event.runId);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
        const body = await res.json().catch(() => ({}));
        if (res.status === 400 && body.error?.includes("credentials")) { setShowSettings(true); throw new Error(body.error); }
        throw new Error(body.error || "Failed to start agent run");
      }

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
            if (event.type === "run_started" && event.runId) setRunId(event.runId);
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
    setHasAutoSent(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {showSettings && <AISettingsPanel onClose={() => setShowSettings(false)} />}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">AI Command Center</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-accent transition-colors"
          >
            Settings
          </button>
          <button
            onClick={newConversation}
            className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-accent transition-colors"
          >
            New Conversation
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pb-4">
        {/* No-credentials banner — shown until the user configures an API key */}
        {!credentialsOk && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-300 text-xs">
            <Key className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              ⚙️ Set your API key in{" "}
              <button
                onClick={() => setShowSettings(true)}
                className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
              >
                Settings
              </button>{" "}
              before chatting.
            </span>
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">What would you like to do?</p>
            <p className="text-muted-foreground text-sm mt-2 max-w-md">
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
          <div className="flex items-center gap-2 text-muted-foreground text-sm px-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={awaitingConfirmation ? "Approve or reject the action above..." : "Describe what you want to do..."}
            disabled={streaming || awaitingConfirmation}
            className="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming || awaitingConfirmation}
            className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
        <div className="max-w-[70%] rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm">
          {message.content}
        </div>
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    return (
      <div className="ml-11 my-2">
        {message.toolUse && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/50 border border-border rounded-lg px-3 py-2">
            <Wrench className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-medium text-foreground">{message.toolUse.name}</span>
            <span className="text-muted-foreground">
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

  if (message.isConfirmation && message.confirmationData) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-4 py-3 max-w-[70%]">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Confirmation Required</p>
          <p className="text-sm text-foreground mb-1">
            {message.confirmationData.toolName === "launch_campaign"
              ? "Launch this campaign to the selected segment?"
              : `Run "${message.confirmationData.toolName}"?`}
          </p>
          <pre className="text-xs text-muted-foreground bg-background rounded p-2 mb-3 overflow-x-auto">
            {JSON.stringify(message.confirmationData.input, null, 2)}
          </pre>
          {awaitingConfirmation && (
            <div className="flex items-center gap-2">
              <button
                onClick={onConfirm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/70 text-xs font-medium transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                onClick={onReject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/70 text-xs font-medium transition-colors"
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

  if (!message.content) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-violet-900/30 flex items-center justify-center flex-shrink-0">
        <Bot className="h-4 w-4 text-violet-400" />
      </div>
      <div className="max-w-[70%] rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

function ToolResultDisplay({ name, output }: { name: string; output: any }) {
  const [expanded, setExpanded] = useState(false);
  const data = typeof output === "string" ? tryParse(output) : output;

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
    <div className="mt-1 text-xs border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-card/30 hover:bg-card/60 transition-colors text-left"
      >
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
        <span className="text-foreground font-medium">{name}</span>
        {summary && <span className="text-muted-foreground truncate ml-1">— {summary}</span>}
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto bg-background border-t border-border">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function tryParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}
