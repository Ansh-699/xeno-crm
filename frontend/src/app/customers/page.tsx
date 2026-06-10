"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Upload, Search, X, Heart, ShieldAlert, Sparkles, UserCheck } from "lucide-react";

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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerEnriched[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      const res = await apiFetch<{ customers: CustomerEnriched[]; total: number }>(
        `/api/insights/customer-health?${params.toString()}`
      );
      setCustomers(res.customers);
      setTotal(res.total);
    } catch {
      setCustomers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
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
        loadCustomers();
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
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">
            <Heart className="h-3 w-3 fill-emerald-400" />
            Loyal
          </span>
        );
      case "at_risk":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/30 animate-pulse">
            <ShieldAlert className="h-3 w-3" />
            At Risk
          </span>
        );
      case "churning":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/30">
            <ShieldAlert className="h-3 w-3" />
            Churning
          </span>
        );
      case "new":
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/30">
            <Sparkles className="h-3 w-3" />
            New
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-zinc-800/50 text-zinc-300 border border-zinc-700/30">
            <UserCheck className="h-3 w-3" />
            Regular
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-xs text-zinc-500 mt-1">AI-calculated health status based on purchase frequency and recency</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadCustomers()}
              className="pl-9 pr-8 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 w-64"
            />
            {search && (
              <button onClick={() => { setSearch(""); loadCustomers(); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-sm font-medium cursor-pointer hover:bg-zinc-700 transition-colors">
            <Upload className="h-4 w-4" />
            {importing ? "Importing..." : "Import CSV"}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading customers & calculating stats...</div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-zinc-500">
            <span>{total.toLocaleString()} customers total</span>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-emerald-400 fill-emerald-400" /> Loyal (5+ orders)</span>
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-amber-400" /> At Risk (Idle &gt; 2x frequency)</span>
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-400" /> Churning (Idle &gt; 60 days)</span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 border-b border-zinc-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">City</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400">AI Health</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">Total Spend</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400">Orders</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400">Last Active</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400">Channel Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No customers found. Import a CSV or use the AI Agent.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <div>
                            <p className="text-white">{c.name}</p>
                            <p className="text-xs text-zinc-500 font-mono mt-0.5">{c.email || c.phone || "—"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{c.city || "—"}</td>
                        <td className="px-4 py-3 text-center">{getHealthBadge(c.health)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">
                          {c.totalSpent > 0 ? `₹${c.totalSpent.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-300 tabular-nums">{c.orderCount}</td>
                        <td className="px-4 py-3 text-center text-zinc-400">
                          {c.daysSinceLastOrder !== null
                            ? `${c.daysSinceLastOrder}d ago`
                            : "Never"}
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
        </>
      )}
    </div>
  );
}
