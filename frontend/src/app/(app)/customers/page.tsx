"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import {
  Upload, Search, X, Heart, ShieldAlert, Sparkles, UserCheck,
  Users, IndianRupee, UserX, Mail, Phone,
} from "lucide-react";

interface CustomerEnriched {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  optedOut: boolean;
  health: "loyal" | "regular" | "at_risk" | "churning" | "new";
  orderCount: number;
  totalSpent: number;
  daysSinceLastOrder: number | null;
  avgOrderGapDays: number | null;
}

interface CustomerSummary {
  total: number;
  totalLTV: number;
  optedOutCount: number;
  counts: { loyal: number; regular: number; at_risk: number; churning: number; new: number };
}

type HealthFilter = "all" | "loyal" | "regular" | "at_risk" | "churning" | "new";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerEnriched[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load summary KPIs on mount
  useEffect(() => {
    apiFetch<CustomerSummary>("/api/insights/customer-summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  // Reload customers when healthFilter changes (and once on mount). Resets the page.
  // This effect is the single source of mount/filter-driven loads — there is no separate
  // [] effect, which previously caused a duplicate racing request on first render.
  useEffect(() => {
    setOffset(0);
    loadCustomers(search, healthFilter, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthFilter]);

  async function loadCustomers(
    q: string,
    hFilter: HealthFilter,
    currentOffset: number,
    append: boolean
  ) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (q) params.set("search", q);
      if (hFilter !== "all") params.set("health", hFilter);
      const res = await apiFetch<{ customers: CustomerEnriched[]; total: number }>(
        `/api/insights/customer-health?${params.toString()}`
      );

      // Server applies the health filter and returns the FILTERED total, so we use the
      // rows and total as-is — no client-side filtering or slicing.
      if (append) {
        setCustomers((prev) => [...prev, ...res.customers]);
      } else {
        setCustomers(res.customers);
      }
      setTotal(res.total);
    } catch {
      if (!append) {
        setCustomers([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleSearch(q: string) {
    setSearch(q);
    setOffset(0);
    loadCustomers(q, healthFilter, 0, false);
  }

  function handleHealthFilter(h: HealthFilter) {
    // Just update state; the [healthFilter] effect resets the offset and reloads.
    setHealthFilter(h);
  }

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    loadCustomers(search, healthFilter, newOffset, true);
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/customers/import`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (res.ok) {
        if (data.message) {
          const headers = Array.isArray(data.analysis?.headers) ? data.analysis.headers.join(", ") : "n/a";
          alert(`${data.message}\nRows: ${data.analysis?.rowCount ?? 0}\nColumns: ${headers}`);
        } else {
          alert(`Imported ${data.count} customers`);
        }
        setOffset(0);
        loadCustomers(search, healthFilter, 0, false);
        // Refresh summary too
        apiFetch<CustomerSummary>("/api/insights/customer-summary")
          .then(setSummary)
          .catch(() => {});
      } else {
        alert(`Import failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert("Import failed: " + err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const getHealthBadge = (health: string) => {
    switch (health) {
      case "loyal":
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Heart className="h-3 w-3 fill-current" />
            Loyal
          </span>
        );
      case "at_risk":
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <ShieldAlert className="h-3 w-3" />
            At Risk
          </span>
        );
      case "churning":
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <ShieldAlert className="h-3 w-3" />
            Churning
          </span>
        );
      case "new":
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Sparkles className="h-3 w-3" />
            New
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
            <UserCheck className="h-3 w-3" />
            Regular
          </span>
        );
    }
  };

  const healthPills: { key: HealthFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "loyal", label: "Loyal" },
    { key: "regular", label: "Regular" },
    { key: "at_risk", label: "At Risk" },
    { key: "churning", label: "Churning" },
    { key: "new", label: "New" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-calculated health status based on purchase frequency and recency</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch(search)}
              className="pl-9 pr-8 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-700 w-64"
            />
            {search && (
              <button onClick={() => { setSearch(""); handleSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-bold uppercase tracking-wider cursor-pointer hover:opacity-90 transition-all shadow-sm">
            <Upload className="h-4 w-4" />
            {importing ? "Importing..." : "Import CSV"}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
          </label>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Customers</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{summary.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total LTV</span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">₹{summary.totalLTV.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-emerald-500 fill-current" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Loyal</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{summary.counts.loyal.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">At Risk</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{summary.counts.at_risk.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Churning</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{summary.counts.churning.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opted-Out</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {summary.total > 0 ? ((summary.optedOutCount / summary.total) * 100).toFixed(1) : "0.0"}%
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading customers & calculating stats...</div>
      ) : (
        <>
          {/* Health filter pills + total count */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {healthPills.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleHealthFilter(p.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    healthFilter === p.key
                      ? "bg-zinc-700 text-white"
                      : "bg-card text-muted-foreground border border-border hover:border-zinc-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{total.toLocaleString()} customers total</span>
              <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-emerald-400 fill-emerald-400" /> Loyal (5+ orders)</span>
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-amber-400" /> At Risk</span>
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-400" /> Churning (&gt;60d)</span>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-card border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">City</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">AI Health</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Spend</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Orders</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Last Active</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Avg Gap</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Channel Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        No customers found. Import a CSV or use the AI Agent.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-card/40 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <div>
                            <p className="text-foreground">{c.name}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground font-mono mt-0.5">
                              <Mail className="h-3 w-3 shrink-0" />
                              {c.email || <span className="text-zinc-700">—</span>}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground font-mono mt-0.5">
                              <Phone className="h-3 w-3 shrink-0" />
                              {c.phone || <span className="text-zinc-700">—</span>}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.city || "—"}</td>
                        <td className="px-4 py-3 text-center">{getHealthBadge(c.health)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">
                          {c.totalSpent > 0 ? `₹${c.totalSpent.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-300 tabular-nums">{c.orderCount}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {c.daysSinceLastOrder !== null ? `${c.daysSinceLastOrder}d ago` : "Never"}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground tabular-nums">
                          {c.avgOrderGapDays !== null ? `${c.avgOrderGapDays}d` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.optedOut ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-500">Opted Out</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/20 text-emerald-500">Subscribed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Load more */}
          {customers.length < total && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-lg bg-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading..." : `Load more (${total - customers.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
