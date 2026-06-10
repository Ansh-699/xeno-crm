"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiStream } from "@/lib/api";
import { Target, Users, Calendar, Sparkles, Loader2, Plus, ArrowRight } from "lucide-react";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: any;
  customerCount: number;
  aiGenerated: boolean;
  createdAt: string;
}

interface SuggestedSegment {
  name: string;
  description: string;
  naturalLanguage: string;
  priority: "high" | "medium" | "low";
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
      const data = await apiFetch<{ suggestions: SuggestedSegment[] }>("/api/insights/suggested-segments");
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
    setCreating(true);
    setCreateStatus("Analyzing request and parsing filter criteria...");

    try {
      const prompt = `Create a segment based on this description: "${input.trim()}". Only use the create_segment tool. Do not launch any campaigns or do anything else.`;

      const res = await apiStream("/api/agent/run", { message: prompt });
      if (!res.ok) throw new Error("Failed to create segment");

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
            if (event.type === "text" && event.text) {
              setCreateStatus(event.text.slice(0, 200));
            }
            if (event.type === "tool_result") {
              const output = typeof event.toolResult?.output === "string"
                ? JSON.parse(event.toolResult.output)
                : event.toolResult?.output;
              if (output?.segment || output?.success) {
                setCreateStatus("Segment created successfully!");
              }
            }
          } catch {}
        }
      }

      setNlInput("");
      await loadSegments();
      setTimeout(() => setCreateStatus(null), 3000);
    } catch (err: any) {
      setCreateStatus(`Error: ${err.message}`);
      setTimeout(() => setCreateStatus(null), 5000);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segments</h1>
          <p className="text-xs text-zinc-500 mt-1">Carve out target customer segments using natural language or AI suggestions</p>
        </div>
      </div>

      {/* AI Segment Suggestions Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">Suggested High-Value Segments</h2>
        </div>

        {loadingSuggestions ? (
          <div className="text-zinc-500 text-sm py-2">Analyzing database patterns to suggest high-impact targets...</div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-zinc-500">No suggestions available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suggestions.map((s, idx) => (
              <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-violet-400">AI Suggested</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      s.priority === "high" ? "bg-red-900/20 text-red-400" : "bg-zinc-800 text-zinc-400"
                    }`}>
                      {s.priority} priority
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-white mb-1">{s.name}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">{s.description}</p>
                </div>
                <button
                  onClick={() => {
                    setNlInput(s.naturalLanguage);
                    handleNlCreate(s.naturalLanguage);
                  }}
                  disabled={creating}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 text-xs text-zinc-300 font-medium hover:bg-zinc-800 hover:text-white border border-zinc-800 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Instantiate Segment
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Natural Language Segment Builder */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-white">Create Custom Segment with AI</span>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Describe who you want to reach in plain English. The AI parses the filter parameters and generates the segment instantly.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNlCreate()}
            placeholder='e.g. "Customers in Delhi who haven ordered in the last 2 months"'
            disabled={creating}
            className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-700 disabled:opacity-50"
          />
          <button
            onClick={() => handleNlCreate()}
            disabled={!nlInput.trim() || creating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Build
              </>
            )}
          </button>
        </div>
        {createStatus && (
          <p className={`text-xs mt-2 ${createStatus.startsWith("Error") ? "text-red-400" : "text-zinc-400"}`}>
            {createStatus}
          </p>
        )}
      </div>

      {/* Segments List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Segments</h2>
        {loading ? (
          <div className="text-zinc-500">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <Target className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No segments yet</p>
            <p className="text-sm text-zinc-600 mt-1">
              Use the AI suggestions above or custom builder to instantiate a segment.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {segments.map((seg) => (
              <div key={seg.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{seg.name}</h3>
                      {seg.aiGenerated && (
                        <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-400">AI Created</span>
                      )}
                    </div>
                    {seg.description && (
                      <p className="text-sm text-zinc-400 mt-1">{seg.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
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
                  <button
                    onClick={() => handlePreview(seg.id)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium hover:bg-zinc-700 transition-colors"
                  >
                    {preview?.id === seg.id ? "Hide" : "Preview"}
                  </button>
                </div>

                {/* Filter DSL display */}
                <div className="mt-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-1">Filter Conditions</p>
                  <div className="flex flex-wrap gap-2">
                    {seg.filters?.conditions?.map((c: any, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">
                        {c.field} {c.op} {JSON.stringify(c.value)}
                      </span>
                    )) || <span className="text-xs text-zinc-600">No conditions</span>}
                  </div>
                </div>

                {/* Preview panel */}
                {preview?.id === seg.id && (
                  <div className="mt-4 border-t border-zinc-800 pt-4">
                    <p className="text-xs text-zinc-500 mb-2">
                      Showing {preview.customers.length} of {preview.total} customers
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {preview.customers.map((c: any) => (
                        <div key={c.id} className="text-xs p-2 rounded bg-zinc-950 border border-zinc-800">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-zinc-500 ml-2">{c.city || "—"}</span>
                          <span className="text-zinc-650 ml-2">
                            {c.email ? "📧" : ""} {c.phone ? "📱" : ""}
                          </span>
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
