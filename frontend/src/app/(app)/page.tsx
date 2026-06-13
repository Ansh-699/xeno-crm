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
    return <div className="text-muted-foreground">Loading Dashboard...</div>;
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
        return "border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400 dark:border-red-900/40 dark:bg-red-950/10";
      case "medium":
        return "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 dark:border-amber-900/40 dark:bg-amber-950/10";
      default:
        return "border-border bg-card text-foreground";
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back. Here is what's happening with your campaigns.</p>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-6 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">{card.label}</span>
              <div className={`p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 ${card.color.replace('text-', 'bg-').replace('400', '500/10')}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{card.value}</p>
          </div>
        ))}
      </div>

      {/* AI Contextual Insights Card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.03] to-transparent pointer-events-none" />
        
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">AI Insights</h2>
              <p className="text-sm text-muted-foreground">Proactive recommendations generated from your CRM data.</p>
            </div>
          </div>

          {loadingInsights ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 border-4 border-zinc-200 border-t-violet-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground font-medium">Analyzing patterns and segmenting customers...</p>
            </div>
          ) : insights.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
              <Sparkles className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Gather more data to unlock personalized AI insights.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-5 flex flex-col justify-between transition-all hover:shadow-md ${getPriorityStyle(
                    insight.priority
                  )}`}
                >
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="p-1.5 rounded-lg bg-current/10">
                        {getInsightIcon(insight.icon)}
                      </div>
                      <h3 className="font-bold text-sm tracking-tight">{insight.title}</h3>
                    </div>
                    <p className="text-sm opacity-80 leading-relaxed mb-6">{insight.body}</p>
                  </div>
                  {insight.action && (
                    <Link
                      href={insight.action.href}
                      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-violet-500 hover:text-violet-600 transition-colors mt-auto"
                    >
                      {insight.action.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Recent Campaigns</h2>
              <p className="text-sm text-muted-foreground">Performance of your latest outreach efforts.</p>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
              <Megaphone className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No campaigns found. Start your first one with the AI Agent.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <Megaphone className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold tracking-tight">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.segment?.name || "Global Segment"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold">{c.totalRecipients || 0}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Recipients</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        c.status === "sending" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                        "bg-zinc-100 dark:bg-zinc-800 text-muted-foreground"
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
