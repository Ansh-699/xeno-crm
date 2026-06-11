"use client";

import { useEffect, useState } from "react";
import { apiFetch, aiApiFetch } from "@/lib/api";
import {
  Users,
  Target,
  Megaphone,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface Stats {
  customers: number;
  segments: number;
  campaigns: number;
  deliveryRate: number;
}

interface AIInsight {
  icon: "trend_up" | "warning" | "users" | "target" | "sparkle";
  title: string;
  body: string;
  action?: { label: string; href: string };
  priority: "high" | "medium" | "low";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, camps] = await Promise.all([
          apiFetch<Stats>("/api/stats"),
          apiFetch<any[]>("/api/campaigns"),
        ]);
        setCampaigns(camps.slice(0, 5));
        setStats({
          customers: statsData.customers || 0,
          segments: statsData.segments || 0,
          campaigns: statsData.campaigns || 0,
          deliveryRate: statsData.deliveryRate || 0,
        });
      } catch {
        setStats({ customers: 0, segments: 0, campaigns: 0, deliveryRate: 0 });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadInsights() {
      try {
        const data = await aiApiFetch<{ insights: AIInsight[] }>("/api/insights");
        setInsights(data.insights || []);
      } catch {
        setInsights([]);
      } finally {
        setLoadingInsights(false);
      }
    }
    loadInsights();
  }, []);

  if (loading) {
    return <div className="text-zinc-500">Loading Dashboard...</div>;
  }

  const cards = [
    { label: "Customers", value: stats?.customers?.toLocaleString() || "0", icon: Users, color: "text-blue-400" },
    { label: "Segments", value: stats?.segments || "0", icon: Target, color: "text-emerald-400" },
    { label: "Campaigns", value: stats?.campaigns || "0", icon: Megaphone, color: "text-amber-400" },
    { label: "Avg Delivery", value: `${stats?.deliveryRate || 0}%`, icon: TrendingUp, color: "text-violet-400" },
  ];

  const getInsightIcon = (icon: string) => {
    switch (icon) {
      case "trend_up":
        return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case "users":
        return <Users className="h-4 w-4 text-blue-400" />;
      case "target":
        return <Target className="h-4 w-4 text-purple-400" />;
      default:
        return <Sparkles className="h-4 w-4 text-violet-400" />;
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-900/40 bg-red-950/10 text-red-200";
      case "medium":
        return "border-amber-900/40 bg-amber-950/10 text-amber-200";
      default:
        return "border-zinc-800 bg-zinc-900/50 text-zinc-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-400">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* AI Contextual Insights Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Sparkles className="h-48 w-48 text-violet-400" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-violet-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">AI-Native Insights & Proactive Actions</h2>
        </div>

        {loadingInsights ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
            <div className="h-3 w-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            Analyzing CRM data to generate smart recommendations...
          </div>
        ) : insights.length === 0 ? (
          <p className="text-sm text-zinc-500">No recommendations available at the moment. Run a campaign to gather insights.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-4 flex flex-col justify-between transition-all hover:scale-[1.01] ${getPriorityStyle(
                  insight.priority
                )}`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {getInsightIcon(insight.icon)}
                    <h3 className="font-semibold text-sm">{insight.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">{insight.body}</p>
                </div>
                {insight.action && (
                  <Link
                    href={insight.action.href}
                    className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium mt-auto"
                  >
                    {insight.action.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Campaigns */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Recent Campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-zinc-500">No campaigns yet. Use the AI Agent to launch one.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-zinc-500">{c.segment?.name || "—"}</p>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      c.status === "completed" ? "bg-emerald-900/50 text-emerald-400" :
                      c.status === "sending" ? "bg-blue-900/50 text-blue-400" :
                      "bg-zinc-800 text-zinc-400"
                    }`}>
                      {c.status}
                    </span>
                    <p className="text-[10px] text-zinc-500 mt-1">{c.totalRecipients || 0} recipients</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
