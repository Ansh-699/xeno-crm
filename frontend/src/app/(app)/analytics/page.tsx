"use client";

import { useEffect, useState } from "react";
import { apiFetch, aiApiFetch } from "@/lib/api";
import {
  BarChart3,
  TrendingUp,
  Send,
  CheckCircle,
  XCircle,
  Eye,
  MousePointer,
  Megaphone,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Loader2,
  RefreshCw,
  ShoppingCart,
  IndianRupee,
} from "lucide-react";

interface ChannelStats {
  [status: string]: number;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  channelStrategy: string;
  totalRecipients: number;
  segmentName: string | null;
  createdAt: string;
  completedAt: string | null;
  aiBrief: string | null;
  channels: Record<string, number>;
  stats: {
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    read: number;
    clicked: number;
  };
  deliveryRate: number;
  openRate: number;
  conversions: number;
  attributedRevenue: number;
  conversionRate: number;
}

interface AnalyticsData {
  overview: {
    totalCampaigns: number;
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalOpened: number;
    totalClicked: number;
    totalConversions: number;
    totalAttributedRevenue: number;
    overallConversionRate: number;
    avgDeliveryRate: number;
    avgOpenRate: number;
    bestChannel: string;
  };
  perChannel: Record<string, ChannelStats>;
  campaigns: CampaignDetail[];
}

// SMS only supports delivery — no opened/read/clicked events
const CHANNELS_WITH_ENGAGEMENT = ["whatsapp", "email", "rcs"];
const ALL_CHANNELS = ["whatsapp", "email", "sms", "rcs"];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch<AnalyticsData>("/api/analytics");
        setData(res);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
    loadNarrative();
  }, []);

  async function loadNarrative() {
    setLoadingNarrative(true);
    try {
      const res = await aiApiFetch<{ narrative: string }>("/api/insights/analytics-narrative");
      setNarrative(res.narrative);
    } catch {
      setNarrative("Unable to generate performance analysis summary.");
    } finally {
      setLoadingNarrative(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-4 w-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading analytics...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <BarChart3 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-muted-foreground">Unable to load analytics data</p>
      </div>
    );
  }

  const { overview, perChannel, campaigns } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Cross-campaign performance dashboards and channel efficiency
          </p>
        </div>
      </div>

      {/* AI Narrative Performance Summary Card */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Sparkles className="h-32 w-32 text-violet-400" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-foreground">AI-Generated Executive Briefing</h2>
          </div>
          <button
            onClick={loadNarrative}
            disabled={loadingNarrative}
            className="p-1 rounded hover:bg-zinc-800 text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            {loadingNarrative ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {loadingNarrative ? (
          <div className="text-xs text-muted-foreground py-1">Synthesizing delivery rates and click patterns...</div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed font-medium">
            {narrative}
          </p>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <OverviewCard
          label="Campaigns"
          value={overview.totalCampaigns}
          icon={Megaphone}
          color="text-violet-400"
          bgColor="bg-violet-500/10"
        />
        <OverviewCard
          label="Total Sent"
          value={overview.totalSent.toLocaleString()}
          icon={Send}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <OverviewCard
          label="Delivered"
          value={overview.totalDelivered.toLocaleString()}
          icon={CheckCircle}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <OverviewCard
          label="Failed"
          value={overview.totalFailed.toLocaleString()}
          icon={XCircle}
          color="text-red-400"
          bgColor="bg-red-500/10"
        />
        <OverviewCard
          label="Delivery Rate"
          value={`${overview.avgDeliveryRate}%`}
          icon={TrendingUp}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
        <OverviewCard
          label="Best Channel"
          value={overview.bestChannel}
          icon={ArrowUpRight}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
        />
        <OverviewCard
          label="Conversions"
          value={overview.totalConversions.toLocaleString()}
          icon={ShoppingCart}
          color="text-pink-400"
          bgColor="bg-pink-500/10"
        />
        <OverviewCard
          label="Attr. Revenue"
          value={`₹${overview.totalAttributedRevenue.toLocaleString()}`}
          icon={IndianRupee}
          color="text-lime-400"
          bgColor="bg-lime-500/10"
        />
      </div>

      {/* Channel Comparison — Asymmetric Metrics */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-foreground">Channel Performance Matrix</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          SMS is an asymmetric channel. It only supports delivery tracking, and engagement metrics (opened, read,
          clicked) are not available.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                  Channel
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Sent
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Delivered
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Delivery Rate
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Failed
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Opened / Read
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Clicked
                </th>
              </tr>
            </thead>
            <tbody>
              {ALL_CHANNELS.map((ch) => {
                const stats = perChannel[ch];
                if (!stats) return null;
                const sent = Number(stats.sent || 0);
                const delivered = Number(stats.delivered || 0);
                const failed = Number(stats.failed || 0);
                const opened = Number(stats.opened || 0);
                const read = Number(stats.read || 0);
                const clicked = Number(stats.clicked || 0);
                const deliveryRate =
                  sent > 0 ? Math.round((delivered / sent) * 100) : 0;
                const isSms = ch === "sms";

                return (
                  <tr
                    key={ch}
                    className="border-b border-border/50 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <ChannelBadge channel={ch} />
                        <span className="font-medium capitalize">{ch}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums text-zinc-300">
                      {sent.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums text-emerald-400">
                      {delivered.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4">
                      <RateBadge rate={deliveryRate} />
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums text-red-400">
                      {failed.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums">
                      {isSms ? (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      ) : (
                        <span className="text-amber-400">
                          {(opened + read).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-3 px-4 tabular-nums">
                      {isSms ? (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      ) : (
                        <span className="text-cyan-400">
                          {clicked.toLocaleString()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {Object.keys(perChannel).length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    No channel data yet. Launch a campaign to see metrics.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign History */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Megaphone className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-foreground">Campaign History</h2>
          <span className="text-xs text-muted-foreground ml-2">
            {campaigns.length} campaigns
          </span>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No campaigns yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const channelKeys = Object.keys(c.channels);
              // SMS is delivery-only (no opens/clicks). Detect it explicitly from the
              // campaign channel or a sole "sms" channel key — never from a count value,
              // which is 0 for a queued SMS campaign and would misclassify it.
              const isSms =
                c.channel === "sms" ||
                (channelKeys.length === 1 && channelKeys[0] === "sms");

              return (
                <div key={c.id}>
                  <div
                    className="rounded-lg border border-border bg-background p-4 cursor-pointer hover:border-zinc-700 transition-all"
                    onClick={() =>
                      setSelectedCampaign(
                        selectedCampaign === c.id ? null : c.id
                      )
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusDot status={c.status} />
                        <div>
                          <p className="font-medium text-sm text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.segmentName || "—"} ·{" "}
                            {new Date(c.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <MiniStat
                          label="Sent"
                          value={c.stats.sent}
                          color="text-blue-400"
                        />
                        <MiniStat
                          label="Delivered"
                          value={c.stats.delivered}
                          color="text-emerald-400"
                        />
                        <MiniStat
                          label="Failed"
                          value={c.stats.failed}
                          color="text-red-400"
                        />
                        {!isSms && (
                          <MiniStat
                            label="Opened"
                            value={c.stats.opened + c.stats.read}
                            color="text-amber-400"
                          />
                        )}
                        <MiniStat
                          label="Conversions"
                          value={c.conversions}
                          color="text-pink-400"
                        />
                        <div className="text-right">
                          <RateBadge rate={c.deliveryRate} />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            delivery
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Channel distribution mini bar */}
                    {Object.keys(c.channels).length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Channels:
                        </span>
                        <div className="flex gap-1.5">
                          {Object.entries(c.channels).map(([ch, count]) => (
                            <span
                              key={ch}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-muted-foreground"
                            >
                              {ch}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {selectedCampaign === c.id && (
                    <div className="mt-1 ml-4 rounded-lg border border-border bg-background p-4 space-y-4">
                      {/* Delivery progress */}
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Delivery Progress</span>
                          <span>{c.deliveryRate}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full flex">
                            <div
                              className="bg-emerald-500 transition-all"
                              style={{
                                width: `${
                                  c.stats.sent > 0
                                    ? (c.stats.delivered / c.stats.sent) * 100
                                    : 0
                                  }%`,
                                }}
                            />
                            <div
                              className="bg-red-500 transition-all"
                              style={{
                                width: `${
                                  c.stats.sent > 0
                                    ? (c.stats.failed / c.stats.sent) * 100
                                    : 0
                                  }%`,
                                }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Stats grid — asymmetric for SMS */}
                      <div
                        className={`grid gap-3 ${
                          isSms
                            ? "grid-cols-3"
                            : "grid-cols-3 sm:grid-cols-5"
                        }`}
                      >
                        <DetailStat
                          label="Sent"
                          value={c.stats.sent}
                          icon={Send}
                          color="text-blue-400"
                        />
                        <DetailStat
                          label="Delivered"
                          value={c.stats.delivered}
                          icon={CheckCircle}
                          color="text-emerald-400"
                        />
                        <DetailStat
                          label="Failed"
                          value={c.stats.failed}
                          icon={XCircle}
                          color="text-red-400"
                        />
                        {!isSms && (
                          <>
                            <DetailStat
                              label="Opened"
                              value={c.stats.opened + c.stats.read}
                              icon={Eye}
                              color="text-amber-400"
                            />
                            <DetailStat
                              label="Clicked"
                              value={c.stats.clicked}
                              icon={MousePointer}
                              color="text-cyan-400"
                            />
                          </>
                        )}
                      </div>

                      {/* Conversion attribution */}
                      {(c.conversions > 0 || c.attributedRevenue > 0) && (
                        <div className="grid grid-cols-3 gap-3">
                          <DetailStat
                            label="Conversions"
                            value={c.conversions}
                            icon={ShoppingCart}
                            color="text-pink-400"
                          />
                          <div className="rounded-lg bg-card border border-border p-3 text-center">
                            <IndianRupee className="h-3.5 w-3.5 mx-auto mb-1.5 text-lime-400" />
                            <p className="text-lg font-semibold tabular-nums text-lime-400">
                              ₹{c.attributedRevenue.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Attr. Revenue</p>
                          </div>
                          <div className="rounded-lg bg-card border border-border p-3 text-center">
                            <TrendingUp className="h-3.5 w-3.5 mx-auto mb-1.5 text-pink-400" />
                            <p className="text-lg font-semibold tabular-nums text-pink-400">
                              {c.conversionRate}%
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Conv. Rate</p>
                          </div>
                        </div>
                      )}

                      {/* AI Brief */}
                      {c.aiBrief && (
                        <div className="border-t border-border pt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="h-3.5 w-3.5 text-violet-400" />
                            <span className="text-xs font-medium text-muted-foreground">
                              AI Performance Brief
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {c.aiBrief}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper Components ────────────────────────────────── */

function OverviewCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`p-1.5 rounded-lg ${bgColor}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    whatsapp: "bg-green-900/40 text-green-400",
    email: "bg-blue-900/40 text-blue-400",
    sms: "bg-amber-900/40 text-amber-400",
    rcs: "bg-purple-900/40 text-purple-400",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full ${
        colors[channel]?.split(" ")[0] || "bg-zinc-700"
      }`}
      style={{
        backgroundColor:
          channel === "whatsapp"
            ? "#22c55e"
            : channel === "email"
            ? "#3b82f6"
            : channel === "sms"
            ? "#f59e0b"
            : channel === "rcs"
            ? "#a855f7"
            : "#71717a",
      }}
    />
  );
}

function RateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 80
      ? "text-emerald-400 bg-emerald-900/30"
      : rate >= 50
      ? "text-amber-400 bg-amber-900/30"
      : "text-red-400 bg-red-900/30";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium tabular-nums ${color}`}
    >
      {rate >= 80 ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : rate >= 50 ? (
        <Minus className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {rate}%
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "sending"
      ? "bg-blue-400 animate-pulse"
      : status === "failed"
      ? "bg-red-400"
      : "bg-zinc-500";
  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-right">
      <p className={`text-sm font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function DetailStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-card border border-border p-3 text-center">
      <Icon className={`h-3.5 w-3.5 mx-auto mb-1.5 ${color}`} />
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
