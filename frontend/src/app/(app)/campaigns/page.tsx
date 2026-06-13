"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch, sseUrl, apiStream } from "@/lib/api";
import { Megaphone, Radio, BarChart3, Clock, Sparkles, Loader2, ArrowRight } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  channelStrategy: string;
  totalRecipients: number;
  goal: string | null;
  aiBrief: string | null;
  createdAt: string;
  segment: { name: string } | null;
  _count: { communications: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const data = await apiFetch<Campaign[]>("/api/campaigns");
      setCampaigns(data);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Campaigns</h1>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No campaigns launched yet</p>
          <p className="text-sm text-muted-foreground mt-1">Use the AI Agent to create and launch campaigns</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <div key={c.id}>
              <div
                className="rounded-xl border border-border bg-card p-5 cursor-pointer hover:border-zinc-700 transition-colors"
                onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{c.name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {c.segment?.name || "—"} · {c.channel || "multi"} · {c.totalRecipients || c._count.communications} recipients
                    </p>
                    {c.goal && <p className="text-xs text-muted-foreground mt-1">{c.goal}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(c.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {selectedId === c.id && (
                <LiveStats campaignId={c.id} initialBrief={c.aiBrief} channel={c.channel} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    sending: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    queued: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    failed: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles[status] || "bg-zinc-100 dark:bg-zinc-800 text-muted-foreground border-transparent"}`}>
      {status}
    </span>
  );
}

function LiveStats({
  campaignId,
  initialBrief,
  channel,
}: {
  campaignId: string;
  initialBrief: string | null;
  channel: string | null;
}) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<{ status?: string; totalRecipients?: number }>({});
  const [aiBrief, setAiBrief] = useState<string | null>(initialBrief);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [loadingNextStep, setLoadingNextStep] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // SMS only supports delivery — no opened/read/clicked events
  const isSmsOnly = channel?.toLowerCase() === "sms";

  useEffect(() => {
    const url = sseUrl(`/api/campaigns/${campaignId}/live`);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "snapshot") {
          setStats(data.stats || {});
        } else if (data.type === "meta") {
          setMeta(data);
        } else if (data.type === "delta") {
          setStats((prev) => {
            const next = { ...prev };
            next[data.event] = (next[data.event] || 0) + 1;
            return next;
          });
        } else if (data.type === "complete") {
          // Trigger brief update after a short delay
          setTimeout(async () => {
            try {
              const updatedCampaign = await apiFetch<Campaign>(`/api/campaigns/${campaignId}`);
              setAiBrief(updatedCampaign.aiBrief);
            } catch {}
          }, 3000);
        }
      } catch {}
    };

    return () => {
      es.close();
    };
  }, [campaignId]);

  async function handleManualBrief() {
    setGeneratingBrief(true);
    try {
      const prompt = `Analyze campaign ${campaignId} and write a performance brief. Only use the analyze_performance tool.`;
      const res = await apiStream("/api/agent/run", { message: prompt });
      if (!res.ok) throw new Error("Failed to generate");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (event.type === "tool_result" && event.toolResult?.name === "analyze_performance") {
              const output = JSON.parse(event.toolResult.output);
              if (output.brief) {
                setAiBrief(output.brief);
              }
            }
          } catch {}
        }
      }

      // Final fallback fetch
      const updatedCampaign = await apiFetch<Campaign>(`/api/campaigns/${campaignId}`);
      setAiBrief(updatedCampaign.aiBrief);
    } catch (err: any) {
      alert("Failed to generate performance brief: " + err.message);
    } finally {
      setGeneratingBrief(false);
    }
  }

  async function handleGetNextSteps() {
    setLoadingNextStep(true);
    setNextStep(null);
    try {
      // Ask for a direct text recommendation — explicitly tell the agent not to call tools
      // so the response comes back as plain text, not a tool_result.
      const prompt = `Based on campaign ${campaignId}'s performance, give me ONE concise next marketing action I should take. Reply in 2-3 sentences of plain text only — do NOT call any tools.`;
      const res = await apiStream("/api/agent/run", { message: prompt });
      if (!res.ok) throw new Error("Failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

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
            // Capture streamed text tokens
            if (event.type === "text" && event.text) {
              fullText += event.text;
              setNextStep(fullText);
            }
            // Also surface any tool_result brief if the agent ignores the instruction
            if (
              event.type === "tool_result" &&
              event.toolResult?.name === "analyze_performance"
            ) {
              try {
                const out = JSON.parse(event.toolResult.output);
                if (out.brief && !fullText) {
                  fullText = out.brief;
                  setNextStep(fullText);
                }
              } catch {}
            }
          } catch {}
        }
      }

      // If the agent returned nothing at all, show a fallback
      if (!fullText) {
        setNextStep("Unable to generate a recommendation. Try the Generate Brief button above first.");
      }
    } catch {
      setNextStep("Failed to generate recommendations. Please try again.");
    } finally {
      setLoadingNextStep(false);
    }
  }

  const sent = Number(stats.sent || 0);
  const delivered = Number(stats.delivered || 0);
  const failed = Number(stats.failed || 0);
  const opened = Number(stats.opened || 0);
  const read = Number(stats.read || 0);
  const total = meta.totalRecipients || sent || 1;
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background p-6 space-y-6 shadow-inner">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live Delivery Stats</span>
        {isSmsOnly && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500 ml-auto px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            SMS Mode
          </span>
        )}
      </div>

      <div className={`grid gap-4 ${isSmsOnly ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
        <StatCard label="Sent" value={sent} color="text-blue-600 dark:text-blue-400" />
        <StatCard label="Delivered" value={delivered} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Failed" value={failed} color="text-red-600 dark:text-red-400" />
        {!isSmsOnly && (
          <StatCard label="Opened" value={opened + read} color="text-amber-600 dark:text-amber-400" />
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
          <span>Delivery Progress</span>
          <span>{deliveryRate}%</span>
        </div>
        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${(delivered / total) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-700 ease-out"
              style={{ width: `${(failed / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* AI Brief and Recommendations Section */}
      <div className="border-t border-border pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Performance Brief</span>
          </div>
          {!aiBrief && (
            <button
              onClick={handleManualBrief}
              disabled={generatingBrief}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {generatingBrief ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Generate
                </>
              )}
            </button>
          )}
        </div>

        {aiBrief ? (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed bg-zinc-50 dark:bg-zinc-900 p-5 rounded-xl border border-border/50">
            {aiBrief}
          </p>
        ) : (
          <div className="py-4 text-center">
             <p className="text-xs text-muted-foreground italic">Insights will be ready once delivery completes.</p>
          </div>
        )}

        {/* Proactive Next Steps */}
        <div className="bg-violet-500/[0.03] dark:bg-violet-500/[0.02] border border-violet-500/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-violet-600 dark:text-violet-400 flex items-center gap-2 tracking-widest">
              <Sparkles className="h-3.5 w-3.5" />
              Recommendation
            </span>
            {!nextStep && !loadingNextStep && (
              <button
                onClick={handleGetNextSteps}
                className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 hover:opacity-80 transition-opacity inline-flex items-center gap-1"
              >
                Get Action Step
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {loadingNextStep && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              Synthesizing data...
            </div>
          )}
          {nextStep && (
            <p className="text-sm text-foreground/80 leading-relaxed font-medium">
              {nextStep}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-card border border-border p-4 text-center shadow-sm">
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value.toLocaleString()}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
