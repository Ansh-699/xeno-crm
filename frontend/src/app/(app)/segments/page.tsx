"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiStream, aiApiFetch, hasAICredentials } from "@/lib/api";
import { Target, Users, Calendar, Sparkles, Loader2, Plus, Megaphone, AlertTriangle, IndianRupee, Heart, ShieldAlert, UserCheck } from "lucide-react";
import Link from "next/link";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: any;
  customerCount: number;
  aiGenerated: boolean;
  createdAt: string;
  segmentRevenue?: number;
  healthBreakdown?: { loyal: number; regular: number; at_risk: number; churning: number; new: number };
  reachable?: { emailable: number; textable: number; optedOut: number };
}

interface SuggestedSegment {
  name: string;
  description: string;
  naturalLanguage: string;
  priority: "high" | "medium" | "low";
}

/** Recursive renderer for the filter DSL tree. Handles nested AND/OR groups. */
function FilterConditions({ node }: { node: any }) {
  if (!node) return <span className="text-xs text-muted-foreground">No conditions</span>;

  // Leaf condition: has a field property
  if (node.field) {
    const val = Array.isArray(node.value)
      ? node.value.join(", ")
      : String(node.value ?? "");
    return (
      <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">
        {node.field} {node.op} {val}
      </span>
    );
  }

  // Group node: has operator + conditions array
  if (node.operator && Array.isArray(node.conditions)) {
    return (
      <>
        <span className="text-xs px-2 py-1 rounded bg-card text-muted-foreground border border-zinc-700">
          {node.operator}
        </span>
        {node.conditions.map((c: any, i: number) => (
          <FilterConditions key={i} node={c} />
        ))}
      </>
    );
  }

  return null;
}

/** Small inline health badge for preview cards */
function HealthPill({ health }: { health: string }) {
  switch (health) {
    case "loyal":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <Heart className="h-2.5 w-2.5 fill-current" />
          Loyal
        </span>
      );
    case "at_risk":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <ShieldAlert className="h-2.5 w-2.5" />
          At Risk
        </span>
      );
    case "churning":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
          <ShieldAlert className="h-2.5 w-2.5" />
          Churning
        </span>
      );
    case "new":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Sparkles className="h-2.5 w-2.5" />
          New
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
          <UserCheck className="h-2.5 w-2.5" />
          Regular
        </span>
      );
  }
}

/** Generate a plain-English one-liner from the filter DSL */
function filterSummary(node: any): string {
  if (!node) return "";
  if (node.field) {
    const opMap: Record<string, string> = {
      eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "contains",
    };
    const opStr = opMap[node.op] || node.op;
    const val = Array.isArray(node.value) ? node.value.join(", ") : String(node.value ?? "");
    return `${node.field} ${opStr} ${val}`;
  }
  if (node.operator && Array.isArray(node.conditions)) {
    const sep = node.operator === "OR" ? " OR " : " AND ";
    return node.conditions.map((c: any) => filterSummary(c)).filter(Boolean).join(sep);
  }
  return "";
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [preview, setPreview] = useState<{ id: string; customers: any[]; total: number } | null>(null);

  // NL Builder state
  const [nlInput, setNlInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    loadSegments();
    loadSuggestions();
  }, []);

  async function loadSegments() {
    try {
      const data = await apiFetch<Segment[]>("/api/segments");
      setSegments(data);
    } catch {
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions() {
    try {
      const data = await aiApiFetch<{ suggestions: SuggestedSegment[] }>("/api/insights/suggested-segments");
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function handlePreview(segmentId: string) {
    if (preview?.id === segmentId) {
      setPreview(null);
      return;
    }
    try {
      const data = await apiFetch<{ customers: any[]; total: number }>(
        `/api/segments/${segmentId}/preview?limit=10`
      );
      setPreview({ id: segmentId, ...data });
    } catch {
      setPreview(null);
    }
  }

  async function handleNlCreate(textOverride?: string) {
    const input = textOverride || nlInput;
    if (!input.trim() || creating) return;

    // Clear previous state
    setCreateError(null);
    setCreateStatus(null);

    // Pre-flight: check for AI credentials
    if (!hasAICredentials()) {
      setCreateError("AI credentials not configured. Click the ⚙️ icon in the sidebar to set your provider and API key.");
      return;
    }

    setCreating(true);
    setCreateStatus("Analyzing request and parsing filter criteria...");

    let segmentCreated = false;
    let aiText = "";

    try {
      const prompt = `Create a segment based on this description: "${input.trim()}". Only use the create_segment tool. Do not launch any campaigns or do anything else.`;

      const res = await apiStream("/api/agent/run", { message: prompt });
      if (!res.body) throw new Error("Empty response from server");

      const reader = res.body.getReader();
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

            if (event.type === "text" && event.text) {
              aiText += event.text;
              setCreateStatus(event.text.slice(0, 200));
            }

            if (event.type === "error") {
              const errMsg = event.error || "An unexpected error occurred";
              // Check for common API errors
              if (errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("authentication")) {
                setCreateError("Invalid API key. Please check your AI Settings (⚙️).");
              } else if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("rate")) {
                setCreateError("API rate limit or quota exceeded. Please wait a moment and try again.");
              } else {
                setCreateError(`AI Error: ${errMsg}`);
              }
              setCreateStatus(null);
              setCreating(false);
              return;
            }

            if (event.type === "tool_result") {
              const output = typeof event.toolResult?.output === "string"
                ? JSON.parse(event.toolResult.output)
                : event.toolResult?.output;
              if (output?.segment || output?.success || output?.segmentId) {
                segmentCreated = true;
                const count = output.customerCount ?? 0;
                setCreateStatus(`✅ Segment "${output.name || "Untitled"}" created with ${count} matching customers!`);
              }
              if (output?.error) {
                setCreateError(`Filter error: ${output.error}`);
              }
            }
          } catch {}
        }
      }

      // Post-stream: check if segment was actually created
      if (!segmentCreated && !createError) {
        // The AI responded with text but never called create_segment
        if (aiText.toLowerCase().includes("can't") || aiText.toLowerCase().includes("cannot") || aiText.toLowerCase().includes("unable")) {
          setCreateError(`The AI couldn't create this segment: ${aiText.slice(0, 200)}`);
        } else {
          setCreateError("No segment was created. The AI may not have understood the request. Try rephrasing, e.g., \"Customers in Delhi with orders over 500\".");
        }
        setCreateStatus(null);
      }

      if (segmentCreated) {
        setNlInput("");
        await loadSegments();
        setTimeout(() => {
          setCreateStatus(null);
          setCreateError(null);
        }, 5000);
      }
    } catch (err: any) {
      setCreateError(err.message || "Failed to create segment. Please try again.");
      setCreateStatus(null);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segments</h1>
          <p className="text-xs text-muted-foreground mt-1">Carve out target customer segments using natural language or AI suggestions</p>
        </div>
      </div>

      {/* AI Segment Suggestions Card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.02] to-transparent pointer-events-none" />
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Suggested Targets</h2>
              <p className="text-sm text-muted-foreground">High-value segments automatically identified from your database.</p>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="flex items-center gap-3 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing database patterns...
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No suggestions available at the moment.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {suggestions.map((s, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-background p-6 flex flex-col justify-between hover:shadow-md transition-all group/card">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500">AI Suggested</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        s.priority === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-zinc-100 dark:bg-zinc-800 text-muted-foreground"
                      }`}>
                        {s.priority}
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-foreground mb-2 tracking-tight">{s.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">{s.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      setNlInput(s.naturalLanguage);
                      handleNlCreate(s.naturalLanguage);
                    }}
                    disabled={creating}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Instantiate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Natural Language Segment Builder */}
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight">Custom AI Builder</span>
            <p className="text-xs text-muted-foreground mt-0.5">Define complex segments using plain English.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNlCreate()}
            placeholder='e.g. "Customers in Delhi who have not ordered in the last 2 months"'
            disabled={creating}
            className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-700 disabled:opacity-50 transition-all"
          />
          <button
            onClick={() => handleNlCreate()}
            disabled={!nlInput.trim() || creating}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 text-white text-sm font-bold uppercase tracking-wider hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Build
              </>
            )}
          </button>
        </div>
        {createStatus && (
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-4 ${createStatus.startsWith("✅") ? "text-emerald-500" : "text-muted-foreground"}`}>
            {creating && <Loader2 className="inline h-3 w-3 animate-spin mr-2" />}
            {createStatus}
          </p>
        )}
        {createError && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-relaxed">{createError}</p>
              <button
                onClick={() => setCreateError(null)}
                className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:opacity-80 mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Segments List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Segments</h2>
        {loading ? (
          <div className="text-muted-foreground">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Target className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No segments yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the AI suggestions above or custom builder to instantiate a segment.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {segments.map((seg) => (
                <div key={seg.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{seg.name}</h3>
                        {seg.aiGenerated && (
                          <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-400">AI Created</span>
                        )}
                      </div>
                      {seg.description && (
                        <p className="text-sm text-muted-foreground mt-1">{seg.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {seg.customerCount.toLocaleString()} customers
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(seg.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePreview(seg.id)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium hover:bg-zinc-700 transition-colors"
                      >
                        {preview?.id === seg.id ? "Hide" : "Preview"}
                      </button>
                      <Link
                        href={`/agent?q=Launch a campaign to segment ${seg.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 text-violet-400 text-xs font-medium hover:bg-violet-600/20 transition-colors border border-violet-900/30"
                      >
                        <Megaphone className="h-3.5 w-3.5" />
                        Launch with AI
                      </Link>
                    </div>
                  </div>

                  {/* Value strip: revenue + health bar + reachability */}
                  {(seg.segmentRevenue !== undefined || seg.healthBreakdown || seg.reachable) && (
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      {seg.segmentRevenue !== undefined && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <IndianRupee className="h-3 w-3" />
                          {seg.segmentRevenue.toLocaleString()}
                        </span>
                      )}
                      {seg.healthBreakdown && (() => {
                        const hb = seg.healthBreakdown!;
                        const total = hb.loyal + hb.regular + hb.at_risk + hb.churning + hb.new;
                        if (total === 0) return null;
                        return (
                          <div className="flex h-1.5 rounded-full overflow-hidden flex-1 min-w-[80px] max-w-[160px] bg-zinc-800">
                            {hb.loyal > 0 && <div className="bg-emerald-500" style={{ width: `${(hb.loyal / total) * 100}%` }} title={`Loyal: ${hb.loyal}`} />}
                            {hb.regular > 0 && <div className="bg-blue-500" style={{ width: `${(hb.regular / total) * 100}%` }} title={`Regular: ${hb.regular}`} />}
                            {hb.at_risk > 0 && <div className="bg-amber-500" style={{ width: `${(hb.at_risk / total) * 100}%` }} title={`At Risk: ${hb.at_risk}`} />}
                            {hb.churning > 0 && <div className="bg-red-500" style={{ width: `${(hb.churning / total) * 100}%` }} title={`Churning: ${hb.churning}`} />}
                            {hb.new > 0 && <div className="bg-zinc-500" style={{ width: `${(hb.new / total) * 100}%` }} title={`New: ${hb.new}`} />}
                          </div>
                        );
                      })()}
                      {seg.reachable && (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span>📧 {seg.reachable.emailable}</span>
                          <span>📱 {seg.reachable.textable}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Filter DSL display */}
                  <div className="mt-3 p-3 rounded-lg bg-background border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Filter Conditions</p>
                    {/* Plain-English filter summary */}
                    {seg.filters && (
                      <p className="text-xs text-muted-foreground italic mb-2">{filterSummary(seg.filters)}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <FilterConditions node={seg.filters} />
                    </div>
                  </div>

                  {/* Preview panel */}
                  {preview?.id === seg.id && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground mb-2">
                        Showing {preview.customers.length} of {preview.total} customers
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {preview.customers.map((c: any) => (
                          <div key={c.id} className="text-xs p-2 rounded bg-background border border-border">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-foreground">{c.name}</span>
                              {c.health && <HealthPill health={c.health} />}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{c.city || "—"}</span>
                              {c.totalSpent > 0 && (
                                <span className="text-emerald-400">₹{c.totalSpent.toLocaleString()}</span>
                              )}
                              {c.daysSinceLastOrder !== null && c.daysSinceLastOrder !== undefined ? (
                                <span>{c.daysSinceLastOrder}d ago</span>
                              ) : (
                                <span>Never</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
