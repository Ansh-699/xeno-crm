"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Server,
  Database,
  Zap,
  Bot,
  GitBranch,
  Upload,
  BarChart3,
  Shield,
  Clock,
  ChevronRight,
  ExternalLink,
  Code2,
  Cpu,
  Globe,
  Package,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────── */
/* Sidebar nav                                         */
/* ─────────────────────────────────────────────────── */

const NAV = [
  { id: "overview",       label: "Overview",            icon: Globe },
  { id: "architecture",   label: "Architecture",        icon: GitBranch },
  { id: "stack",          label: "Tech Stack",          icon: Package },
  { id: "data-model",     label: "Data Model",          icon: Database },
  { id: "send-loop",      label: "Send / Receipt Loop", icon: RefreshCw },
  { id: "ai-agent",       label: "AI Agent Layer",      icon: Bot },
  { id: "ingestion",      label: "Ingestion API",       icon: Upload },
  { id: "api-reference",  label: "API Reference",       icon: Code2 },
  { id: "tradeoffs",      label: "Design Tradeoffs",    icon: AlertTriangle },
  { id: "deploy",         label: "Deployment",          icon: Server },
];

/* ─────────────────────────────────────────────────── */
/* Primitives                                          */
/* ─────────────────────────────────────────────────── */

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6 py-10 border-b border-border/50 last:border-0">
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-3xl font-light tracking-tight text-foreground sm:text-4xl">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold text-foreground mt-8 mb-3">{children}</h3>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-relaxed text-muted-foreground max-w-2xl">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ children, language = "" }: { children: string; language?: string }) {
  return (
    <div className="relative my-4 rounded-xl border border-border bg-muted/50 overflow-hidden">
      {language && (
        <div className="border-b border-border/60 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {language}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground/90 font-mono">
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn("border-b border-border/50 last:border-0", i % 2 === 0 ? "" : "bg-muted/20")}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 font-mono text-xs text-foreground/90 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({
  icon: Icon,
  title,
  children,
  variant = "info",
}: {
  icon?: React.ElementType;
  title: string;
  children: React.ReactNode;
  variant?: "info" | "warn" | "success";
}) {
  const colors = {
    info: "border-violet-500/30 bg-violet-500/5 text-violet-400",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
  };
  return (
    <div className={cn("my-4 rounded-xl border p-4", colors[variant])}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">{children}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/* Architecture Diagram (SVG mermaid-style)            */
/* ─────────────────────────────────────────────────── */

function ArchDiagram() {
  const boxes = [
    { id: "fe",   x: 30,  y: 30,  w: 160, h: 56, label: "Next.js 15 Frontend", sub: "App Router · Tailwind · :3000", color: "#7c3aed" },
    { id: "api",  x: 260, y: 30,  w: 160, h: 56, label: "API Server",           sub: "Express 4 · TypeScript · :3001", color: "#0f766e" },
    { id: "work", x: 260, y: 140, w: 160, h: 56, label: "Outbox Poller Worker", sub: "src/worker/poller.ts",            color: "#0f766e" },
    { id: "cs",   x: 490, y: 140, w: 160, h: 56, label: "Channel Service",      sub: "Rust · Axum · :4000",            color: "#92400e" },
    { id: "pg",   x: 260, y: 250, w: 160, h: 56, label: "PostgreSQL",           sub: "Prisma · system of record",      color: "#1e40af" },
    { id: "rd",   x: 490, y: 250, w: 160, h: 56, label: "Redis",                sub: "counters · pub/sub",             color: "#9f1239" },
    { id: "llm",  x: 490, y: 30,  w: 160, h: 56, label: "LLM Provider · BYOK", sub: "Anthropic / OpenAI / Google",    color: "#4d7c0f" },
  ];

  const arrows = [
    { from: [190,58],  to: [260,58],   label: "REST + SSE" },
    { from: [340,86],  to: [340,140],  label: "drain outbox" },
    { from: [420,168], to: [490,168],  label: "POST /send" },
    { from: [490,155], to: [420,95],   label: "callbacks", dashed: true },
    { from: [340,196], to: [340,250],  label: "Prisma" },
    { from: [420,278], to: [490,278],  label: "HINCRBY" },
    { from: [490,278], to: [420,68],   label: "snapshot", dashed: true, curved: true },
    { from: [420,58],  to: [490,58],   label: "tool-use" },
  ];

  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-border bg-card/60 p-4">
      <svg viewBox="0 0 720 340" className="w-full max-w-3xl mx-auto" style={{ minWidth: 560 }}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-muted-foreground" />
          </marker>
          <marker id="arrow-dashed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-violet-400" />
          </marker>
        </defs>

        {/* boxes */}
        {boxes.map((b) => (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8}
              fill={b.color + "22"} stroke={b.color + "88"} strokeWidth={1.5} />
            <text x={b.x + b.w/2} y={b.y + 22} textAnchor="middle"
              fontSize={11} fontWeight={600} fill={b.color} fontFamily="system-ui, sans-serif">
              {b.label}
            </text>
            <text x={b.x + b.w/2} y={b.y + 38} textAnchor="middle"
              fontSize={9} fill="#94a3b8" fontFamily="monospace">
              {b.sub}
            </text>
          </g>
        ))}

        {/* straight arrows */}
        <line x1={190} y1={58} x2={256} y2={58} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={223} y={52} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="system-ui">REST+SSE</text>

        <line x1={340} y1={86} x2={340} y2={137} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={355} y={117} fontSize={8} fill="#64748b" fontFamily="system-ui">drain outbox</text>

        <line x1={420} y1={168} x2={487} y2={168} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={453} y={162} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="system-ui">POST /send</text>

        <line x1={490} y1={152} x2={422} y2={92} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrow-dashed)" />
        <text x={468} y={120} fontSize={8} fill="#8b5cf6" fontFamily="system-ui">callbacks</text>

        <line x1={340} y1={196} x2={340} y2={247} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={355} y={227} fontSize={8} fill="#64748b" fontFamily="system-ui">Prisma</text>

        <line x1={420} y1={278} x2={487} y2={278} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={453} y={272} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="system-ui">HINCRBY</text>

        <line x1={420} y1={58} x2={487} y2={58} stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arrow)" />
        <text x={453} y={52} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="system-ui">tool-use</text>

        {/* Redis snapshot back to API (curved) */}
        <path d="M 490,258 Q 450,200 420,72" fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrow-dashed)" />
        <text x={445} y={185} fontSize={8} fill="#8b5cf6" fontFamily="system-ui">snapshot</text>

        {/* Legend */}
        <g transform="translate(30, 310)">
          <line x1={0} y1={6} x2={20} y2={6} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={25} y={10} fontSize={9} fill="#64748b" fontFamily="system-ui">sync</text>
          <line x1={70} y1={6} x2={90} y2={6} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4,3" />
          <text x={95} y={10} fontSize={9} fill="#8b5cf6" fontFamily="system-ui">async / callback</text>
        </g>
      </svg>
      <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        System architecture — end-to-end loop
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/* End-to-end loop diagram                             */
/* ─────────────────────────────────────────────────── */

function E2ELoop() {
  const steps = [
    { label: "Ingest",   sub: "customers + orders" },
    { label: "Segment",  sub: "AI or manual DSL" },
    { label: "Outbox",   sub: "atomic txn write" },
    { label: "Worker",   sub: "claim + send batch" },
    { label: "Channel",  sub: "Rust async sim" },
    { label: "Receipts", sub: "callbacks → events" },
    { label: "Attribute",sub: "7-day window" },
    { label: "Insights", sub: "AI analysis" },
  ];
  return (
    <div className="my-6 overflow-x-auto">
      <div className="flex items-start gap-0 min-w-max mx-auto w-fit">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-foreground">
                {i + 1}
              </div>
              <p className="mt-1.5 text-xs font-semibold text-foreground">{s.label}</p>
              <p className="text-[9px] text-muted-foreground w-16 text-center leading-tight">{s.sub}</p>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="mx-1 mt-[-18px] h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/* Main page                                           */
/* ─────────────────────────────────────────────────── */

export function DocsPage() {
  const [active, setActive] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/landing" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <span className="text-border">·</span>
            <span className="text-sm font-semibold text-foreground">Xeno CRM — Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/anshtyagi" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="h-3 w-3" /> GitHub
            </a>
            <Link href="/dashboard"
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors">
              Open CRM
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0 px-5 sm:px-8">
        {/* Sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 flex-shrink-0 overflow-y-auto py-8 pr-6 md:block">
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActive(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active === item.id
                    ? "bg-violet-500/10 text-violet-500 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 py-10 md:pl-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-0"
          >

            {/* ─── OVERVIEW ─── */}
            <Section id="overview">
              <H2>Overview</H2>
              <Lead>
                Xeno CRM is an AI-native marketing &amp; engagement platform for a consumer brand
                (seeded as "Brewcraft Coffee") reaching shoppers over WhatsApp, SMS, Email, and RCS.
                It is <em>not</em> a sales/support CRM — no deals, pipelines, leads, or tickets.
              </Lead>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
                {[
                  { icon: Upload,   title: "Ingest",    desc: "Bulk JSON or CSV import for customers and orders with per-row validation." },
                  { icon: GitBranch,title: "Segment",   desc: "Natural-language AI segmentation compiled to a JSON filter DSL." },
                  { icon: Zap,      title: "Launch",    desc: "Transactional outbox → worker → Rust channel service → async callbacks." },
                  { icon: BarChart3,title: "Insights",  desc: "Real-time Redis counters, revenue attribution, AI-written performance briefs." },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl border border-border bg-card/60 p-4">
                    <c.icon className="mb-3 h-5 w-5 text-violet-500" />
                    <p className="font-semibold text-sm text-foreground">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                  </div>
                ))}
              </div>
              <E2ELoop />
            </Section>

            {/* ─── ARCHITECTURE ─── */}
            <Section id="architecture">
              <H2>Architecture</H2>
              <Lead>
                Three runtimes, two managed datastores. The backend is Express 4 (TypeScript via{" "}
                <Code>tsx</Code>) split into two processes. The channel service is Rust / Axum.
                The frontend is Next.js 15. PostgreSQL is the system of record; Redis holds live
                counters and SSE pub/sub.
              </Lead>
              <ArchDiagram />
              <H3>Services</H3>
              <Table
                headers={["Service", "Directory", "Port", "Runtime", "Role"]}
                rows={[
                  ["Frontend",             "frontend/",        "3000", "Next.js 15",          "Dashboard, AI agent chat, live campaign stats"],
                  ["Backend API",          "backend/",         "3001", "Express 4 · tsx",      "REST + SSE, AI agent tool layer, ingestion"],
                  ["Outbox Poller Worker", "backend/",         "—",    "Node.js (same image)", "Drains transactional outbox → channel service"],
                  ["Channel Service",      "channel-service/", "4000", "Rust · Axum · Tokio",  "Stubbed multi-channel delivery + async callbacks"],
                  ["PostgreSQL",           "managed (Neon)",   "5432", "PostgreSQL",           "System of record — all persistent state"],
                  ["Redis",                "managed",          "6379", "Redis",                "Live counters + SSE pub/sub fan-out"],
                ]}
              />
              <H3>Why two backend processes?</H3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                SSE streams and <Code>pg_notify LISTEN</Code> need long-lived connections, and the
                outbox worker must do HTTP I/O <em>outside</em> DB transactions. Splitting the worker
                from the API keeps network latency off the request path and lets each scale independently.
              </p>
              <Callout icon={Shield} title="Architecture constraint — two services, callback-driven loop" variant="info">
                The CRM exposes a send API. When a campaign goes out, the CRM calls a separate stubbed
                channel service. The channel service simulates outcomes and asynchronously calls back the
                CRM receipt API with what "happened" to each communication.
              </Callout>
            </Section>

            {/* ─── STACK ─── */}
            <Section id="stack">
              <H2>Tech Stack</H2>
              <Table
                headers={["Layer", "Technology", "Why"]}
                rows={[
                  ["Backend API",       "Express 4 + TypeScript (tsx)",      "Pure API service — lighter than Next.js, SSE + pg_notify need always-on Node process"],
                  ["Channel Service",   "Rust · Axum · Tokio",               "Separate process/container mirrors real provider boundary. Compile-time type safety for channel state machine"],
                  ["Database",          "PostgreSQL via Prisma",              "Segmentation filters are relational queries with orders.* joins, JSON path, and subqueries"],
                  ["Cache / Pub-Sub",   "Redis (ioredis)",                   "O(1) hot-path reads for live campaign counters; pub/sub for SSE fan-out"],
                  ["AI Layer",          "Anthropic · OpenAI · Google (BYOK)", "Three providers behind shared LLMProvider interface. Credentials in HTTP headers, never persisted"],
                  ["Frontend",          "Next.js 15 · Tailwind · React 19",  "App Router for RSC; talks to Express backend via NEXT_PUBLIC_API_URL"],
                  ["ORM",               "Prisma 6",                          "Migrations, typed queries, createMany with skipDuplicates for idempotent ingest"],
                  ["Validation",        "Zod 4",                             "Per-row validation on bulk ingest; single bad row never fails the batch"],
                ]}
              />
              <H3>Channel Service Crates</H3>
              <p className="text-sm text-muted-foreground mb-2">
                <Code>axum</Code> · <Code>tokio</Code> (full) · <Code>reqwest</Code> (rustls-tls) ·{" "}
                <Code>serde</Code> + <Code>serde_json</Code> · <Code>rand</Code> · <Code>dashmap</Code> · <Code>chrono</Code>
              </p>
            </Section>

            {/* ─── DATA MODEL ─── */}
            <Section id="data-model">
              <H2>Data Model</H2>
              <Lead>
                Nine Prisma models covering the full CRM domain. Relational for all persistent state;
                JSONB for flexible segment filters and order products.
              </Lead>
              <Table
                headers={["Model", "Purpose", "Key fields"]}
                rows={[
                  ["Customer",        "Shopper profile",                     "id, name, email?, phone?, city?, optedOut, attributes (JSONB)"],
                  ["Order",           "Purchase record",                     "customerId, amount, products (JSONB), channel, orderedAt, externalId?"],
                  ["Segment",         "Named audience with filter DSL",      "name, filters (JSONB), aiGenerated, customerCount"],
                  ["Campaign",        "Send job with lifecycle status",      "segmentId, status, messages (JSONB templates), channelStrategy, launchToken, aiBrief"],
                  ["Communication",   "Per-customer send record",            "campaignId, customerId, channel, destination, content, status"],
                  ["CommEvent",       "Append-only event log (source of truth)", "communicationId, status, timestamp — @@unique([commId, status])"],
                  ["Outbox",          "Transactional send intent",           "eventType, campaignId, payload, status, attempts, nextRetryAt, processedAt"],
                  ["AgentRun",        "Persistent LLM conversation",         "messages (JSONB), status, pendingTool (JSONB) — resume after confirmation"],
                  ["ChannelDecision", "Per-customer channel recommendation", "segmentId, customerId, channel, reason — @@unique([segId, custId])"],
                ]}
              />
              <H3>Status lifecycles</H3>
              <div className="grid gap-4 sm:grid-cols-3 mt-2">
                {[
                  { title: "Campaign.status", steps: ["draft", "queued", "sending", "completed", "failed"] },
                  { title: "Outbox.status",   steps: ["PENDING", "PROCESSING", "SENT", "DEAD_LETTER"] },
                  { title: "Comm.status",     steps: ["pending", "sent", "delivered", "opened / read", "clicked", "failed (terminal)"] },
                ].map((lc) => (
                  <div key={lc.title} className="rounded-xl border border-border bg-card/60 p-4">
                    <p className="font-mono text-xs font-semibold text-foreground mb-3">{lc.title}</p>
                    <div className="space-y-1.5">
                      {lc.steps.map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-3">{i + 1}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─── SEND LOOP ─── */}
            <Section id="send-loop">
              <H2>Send / Receipt Loop</H2>
              <Lead>
                Two patterns make the send path correct under crashes, retries, and out-of-order
                callbacks: a transactional outbox and an append-only event log with monotonic
                max-rank receipt handling.
              </Lead>

              <H3>Pattern 1 — Transactional Outbox</H3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <Code>Communication</Code> rows and <Code>Outbox</Code> send-intents are written in{" "}
                <strong>one Prisma transaction</strong>. Either both persist or neither does — the dual-write
                problem is solved at the DB level.
              </p>
              <CodeBlock language="sql">{`BEGIN;
  INSERT INTO communications (...) VALUES (...);  -- N rows
  INSERT INTO outbox (...) VALUES (...);           -- N events
COMMIT;`}</CodeBlock>

              <p className="text-sm text-muted-foreground mt-4 leading-relaxed">Poller logic (separate Node.js worker):</p>
              <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
                <li><strong>Short-claim:</strong> <Code>SELECT ... FOR UPDATE SKIP LOCKED</Code> → mark rows <Code>PROCESSING</Code> → COMMIT (releases lock)</li>
                <li><strong>HTTP POST batch of 50</strong> to channel service — outside the transaction</li>
                <li><strong>Success:</strong> mark <Code>SENT</Code>, set <Code>processedAt</Code></li>
                <li><strong>Failure:</strong> exponential backoff (<Code>min(5000ms × 2^attempts, 300s)</Code>) or <Code>DEAD_LETTER</Code> after max attempts</li>
                <li><strong>Wakeup:</strong> <Code>pg_notify('outbox_new')</Code> trigger + 5-second fallback polling</li>
              </ol>

              <Callout icon={RefreshCw} title="Stale PROCESSING reaper" variant="warn">
                Worker startup + every 60s: reset rows where status = 'PROCESSING' AND processingAt &lt;
                NOW() - 60s. Uses processingAt (not createdAt) to avoid resetting in-flight rows.
              </Callout>

              <H3>Pattern 2 — Append-only event log + monotonic max-rank</H3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Callbacks can arrive out of order or duplicated. <Code>CommEvent</Code> is append-only —
                every unique <Code>(communicationId, status)</Code> is recorded regardless of arrival order.
                Current status is derived as the highest-rank event seen, with <Code>failed</Code> as terminal override.
              </p>
              <CodeBlock language="typescript">{`const STATUS_RANK = {
  pending: 0, sent: 1, delivered: 2,
  opened: 3, read: 3,  // WhatsApp equivalent — same rank
  clicked: 4,
};
// "failed" is NOT in rank map — it's a terminal override`}</CodeBlock>

              <H3>Channel simulation rates</H3>
              <Table
                headers={["Channel", "Sequence", "Deliver rate", "Engage rate", "Click rate"]}
                rows={[
                  ["WhatsApp", "sent → delivered → read → clicked",    "80%", "65% read",   "30%"],
                  ["Email",    "sent → delivered → opened → clicked",  "95%", "25% open",   "15%"],
                  ["SMS",      "sent → delivered",                     "90%", "—",          "—"],
                  ["RCS",      "sent → delivered → opened → clicked",  "85%", "60% open",   "25%"],
                ]}
              />
            </Section>

            {/* ─── AI AGENT ─── */}
            <Section id="ai-agent">
              <H2>AI Agent Layer</H2>
              <Lead>
                CRM operations are exposed as tools the LLM invokes dynamically via tool-use. The agent
                decides the workflow from the marketer's natural-language intent, with a confirmation gate
                before any destructive operation.
              </Lead>

              <H3>11 tools</H3>
              <Table
                headers={["#", "Tool", "Confirmation?", "Description"]}
                rows={[
                  ["1",  "describe_schema",       "No",  "Get queryable fields, operators, and data shape for segmentation"],
                  ["2",  "query_customers",        "No",  "Query customers with filters — returns count + sample rows"],
                  ["3",  "create_segment",         "No",  "Create a named segment from filter criteria (DSL)"],
                  ["4",  "preview_audience",       "No",  "Preview customers in a segment with sample profiles + count"],
                  ["5",  "draft_messages",         "No",  "Generate channel-specific messages with merge fields"],
                  ["6",  "recommend_channels",     "No",  "Recommend best channel per customer — upserts ChannelDecision"],
                  ["7",  "launch_campaign",        "Yes ✓","Launch a campaign. Requires stable launchToken (semantic hash)"],
                  ["8",  "get_campaign_stats",     "No",  "Real-time campaign delivery stats from Redis counters"],
                  ["9",  "analyze_performance",    "No",  "Generate AI analysis of campaign results — on-demand"],
                  ["10", "compare_campaigns",      "No",  "Compare metrics across multiple campaigns"],
                  ["11", "get_segment_analytics",  "No",  "Analyse historical performance of campaigns sent to a segment"],
                ]}
              />

              <H3>BYOK multi-provider</H3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Three providers: <strong>Anthropic</strong> (Claude), <strong>OpenAI</strong> (GPT-4o),{" "}
                <strong>Google</strong> (Gemini) — all behind a shared <Code>LLMProvider</Code> interface.
                Credentials travel in HTTP headers per request and are never logged or persisted server-side.
                The app is fully functional without any key (static fallbacks on all insight surfaces).
              </p>

              <H3>Idempotency via semantic launchToken</H3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <Code>launchToken</Code> = <Code>sha256(segmentId:name:JSON(messages))</Code>. A double-click,
                agent retry, network replay, or the model re-emitting the same tool call all collapse to the
                same token — the idempotency check returns the original campaign instead of duplicating the send.
              </p>

              <H3>Merge fields</H3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                Templates stored in <Code>Campaign.messages</Code> are hydrated per-customer at launch time using grouped queries (not N+1):
              </p>
              <div className="flex flex-wrap gap-2">
                {["{{name}}", "{{top_product}}", "{{city}}", "{{days_since_last_order}}", "{{total_orders}}"].map((f) => (
                  <span key={f} className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{f}</span>
                ))}
              </div>
            </Section>

            {/* ─── INGESTION ─── */}
            <Section id="ingestion">
              <H2>Ingestion API</H2>
              <Lead>
                Two hardened JSON REST endpoints. Both validate every row, import what is valid, and
                report what is not — a single bad row never fails the whole batch.
              </Lead>

              <H3>POST /api/customers/bulk</H3>
              <Table
                headers={["Field", "Rule"]}
                rows={[
                  ["name",       "required, trimmed, non-empty"],
                  ["email",      "optional, valid email — duplicates skipped (not errored)"],
                  ["phone",      "optional, non-empty"],
                  ["city",       "optional, non-empty"],
                  ["optedOut",   "optional boolean, defaults false"],
                  ["attributes", "optional JSON object, defaults {}"],
                ]}
              />
              <CodeBlock language="json">{`{
  "received": 4, "imported": 2, "skipped": 0, "rejected": 2,
  "errors": [
    { "row": 2, "error": "name: expected string, received undefined" },
    { "row": 3, "error": "email: invalid email" }
  ]
}`}</CodeBlock>

              <H3>POST /api/orders/bulk</H3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                Same response envelope. Key fields:
              </p>
              <Table
                headers={["Field", "Rule"]}
                rows={[
                  ["customerId",  "required — customer must exist"],
                  ["amount",      "required number >= 0"],
                  ["products",    "required array or object"],
                  ["channel",     "required, non-empty"],
                  ["orderedAt",   "required ISO string or Date"],
                  ["externalId",  "optional unique idempotency key — re-posting skips duplicates"],
                ]}
              />
              <Callout icon={Zap} title="Live attribution" variant="success">
                Each newly inserted order is immediately attributed to the most recent communication
                delivered to the same customer within the 7-day window before the order.
              </Callout>
            </Section>

            {/* ─── API REFERENCE ─── */}
            <Section id="api-reference">
              <H2>API Reference</H2>
              <Lead>All routes mounted under <Code>/api</Code>. <Code>GET /health</Code> is the liveness probe.</Lead>
              <Table
                headers={["Method", "Path", "Description"]}
                rows={[
                  ["GET",  "/health",                        "Liveness probe → { status: 'ok' }"],
                  ["GET",  "/api/stats",                     "Dashboard counters — total customers, orders, campaigns, segments"],
                  ["GET",  "/api/customers",                 "List customers with optional filter/search"],
                  ["POST", "/api/customers/bulk",            "Bulk JSON ingest with per-row validation"],
                  ["POST", "/api/customers/import",          "CSV file upload (multipart/form-data)"],
                  ["GET",  "/api/orders",                    "List orders"],
                  ["POST", "/api/orders/bulk",               "Bulk JSON ingest with live attribution"],
                  ["POST", "/api/orders/backfill-attribution","Re-attribute historical orders"],
                  ["GET",  "/api/segments",                  "List segments with live customer counts"],
                  ["POST", "/api/segments",                  "Create segment from filter DSL"],
                  ["GET",  "/api/segments/:id/preview",      "Preview audience (count + sample)"],
                  ["GET",  "/api/campaigns",                 "List campaigns"],
                  ["POST", "/api/campaigns",                 "Create campaign"],
                  ["POST", "/api/campaigns/:id/launch",      "Launch campaign (writes outbox atomically)"],
                  ["GET",  "/api/campaigns/:id/stats",       "Live stats from Redis hash"],
                  ["GET",  "/api/campaigns/:id/stats/stream","SSE stream — subscribe → snapshot → deltas"],
                  ["POST", "/api/receipts",                  "Channel-service callback sink (append CommEvent)"],
                  ["POST", "/api/agent/run",                 "Create or continue AgentRun"],
                  ["POST", "/api/agent/run/:id/confirm",     "Approve / reject pending tool (launch_campaign)"],
                  ["GET",  "/api/analytics",                 "Funnel + campaign performance aggregates"],
                  ["GET",  "/api/insights",                  "AI-written or data-grounded campaign insights"],
                ]}
              />
              <Callout icon={Code2} title="Full Postman collection" variant="info">
                A complete Postman collection is available at{" "}
                <Code>docs/xeno-postman-collection.json</Code> in the repository root.
              </Callout>
            </Section>

            {/* ─── TRADEOFFS ─── */}
            <Section id="tradeoffs">
              <H2>Design Tradeoffs</H2>
              <Lead>
                Every decision is tuned for "correct, observable, and demoable" at ~2k customers /
                ~8k orders. Each tradeoff note includes what changes at production scale.
              </Lead>
              <div className="mt-6 space-y-4">
                {[
                  {
                    n: "1", title: "Transactional Outbox vs. Kafka/SQS",
                    body: "Guarantees at-least-once delivery without standing up a broker. At scale: replace the poll loop with SQS/Kafka + multiple consumers; keep the outbox as the WAL.",
                  },
                  {
                    n: "2", title: "FOR UPDATE SKIP LOCKED — atomic claim",
                    body: "Single UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING * atomically claims a batch. The two-step pattern has a race window. At scale: shard outbox by campaignId, run N pollers on non-overlapping shards.",
                  },
                  {
                    n: "3", title: "Monotonic receipt ranking",
                    body: "Status ranks pending(0) < sent(1) < delivered(2) < opened=read(3) < clicked(4). failed is terminal. Duplicate receipts are idempotent via @@unique + P2002 → 200. At scale: same logic — CommEvent append-only enables replay and audit.",
                  },
                  {
                    n: "4", title: "Redis counters for the live funnel",
                    body: "HINCRBY per event per campaign. O(1) reads during a live 2k-send. SSE subscribes first then reads snapshot to prevent missing events. At scale: Redis Cluster; reconcile against CommEvent periodically.",
                  },
                  {
                    n: "5", title: "Separate Rust channel service",
                    body: "Mirrors the real provider boundary (Twilio, Meta Cloud API) so the receipt / idempotency design is exercised honestly. At scale: swap the stub for real provider adapters behind the same callback contract.",
                  },
                  {
                    n: "6", title: "BYOK multi-provider AI",
                    body: "No vendor lock-in, no shared secret. The app is fully functional without any key (static fallbacks everywhere). At scale: server-side key vault per tenant, usage metering, model routing by cost/latency.",
                  },
                  {
                    n: "7", title: "Agent confirmation gate + stable launchToken",
                    body: "launch_campaign requires explicit approval. launchToken = sha256(segmentId:name:messages) — retried or double-confirmed launches collapse to one campaign. At scale: role-based approval, audit log, scheduled launches.",
                  },
                  {
                    n: "8", title: "Live segment counts — no cached column",
                    body: "Segment size computed fresh on every read. At 2k customers a live count is fast. At scale: materialise with DB trigger or short-TTL Redis cache.",
                  },
                ].map((t) => (
                  <div key={t.n} className="rounded-xl border border-border bg-card/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-500 mb-1">#{t.n}</p>
                    <p className="font-semibold text-sm text-foreground">{t.title}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{t.body}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─── DEPLOY ─── */}
            <Section id="deploy">
              <H2>Deployment</H2>
              <Lead>
                Five containers behind nginx + Let's Encrypt, using managed Postgres and Redis.
                CI builds and tests all three services; deploy SSHes in, pulls, rebuilds, applies
                migrations, and health-checks.
              </Lead>

              <H3>Local dev (Docker Compose)</H3>
              <CodeBlock language="bash">{`# 1. Start Postgres + Redis
docker compose up -d postgres redis

# 2. Backend setup
cd backend && npm install
npm run db:migrate   # Prisma migrations
npm run db:seed      # 2,000 customers + 8,000 orders

# 3. Run services (separate terminals)
npm run dev          # a) API server :3001
npm run worker       # b) Outbox poller

# 4. Channel service
cd channel-service && cargo run --release   # :4000

# 5. Frontend
cd frontend && npm install && npm run dev   # :3000`}</CodeBlock>

              <H3>Environment variables</H3>
              <Table
                headers={["Variable", "Service", "Example", "Notes"]}
                rows={[
                  ["DATABASE_URL",          "backend",  "postgresql://user:pass@host/xeno", "Prisma connection"],
                  ["REDIS_URL",             "backend",  "redis://host:6379",                "counters + pub/sub"],
                  ["CHANNEL_SERVICE_URL",   "backend",  "http://localhost:4000",            "where worker POSTs sends"],
                  ["CALLBACK_URL",          "backend",  "http://localhost:3001/api/receipts","callback URL for channel service"],
                  ["PORT",                  "backend",  "3001",                             "API server port"],
                  ["NEXT_PUBLIC_API_URL",   "frontend", "http://localhost:3001",            "backend base URL — inlined at build time"],
                ]}
              />

              <H3>Railway / Render</H3>
              <Table
                headers={["Service", "Root dir", "Build command", "Start command", "Port"]}
                rows={[
                  ["Backend API",          "backend/",         "npm install && npm run db:generate", "npm run start",              "3001"],
                  ["Poller Worker",        "backend/",         "npm install && npm run db:generate", "npm run worker",             "—"],
                  ["Channel Service",      "channel-service/", "cargo build --release",              "./target/release/channel-service","4000"],
                  ["Frontend",            "frontend/",        "npm install && npm run build",        "npm run start",              "3000"],
                ]}
              />

              <Callout icon={Cpu} title="No serverless" variant="warn">
                SSE connections, the long-running poller worker, and pg_notify LISTEN all require
                always-on containers. Not compatible with Vercel / serverless / edge runtimes.
              </Callout>

              <H3>Post-deploy smoke test</H3>
              <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
                <li><Code>GET /health</Code> on backend → <Code>{"{ status: \"ok\" }"}</Code></li>
                <li><Code>GET /health</Code> on channel service → <Code>{"{ status: \"ok\", service: \"channel-service\" }"}</Code></li>
                <li>Open frontend — dashboard loads with customer / segment / campaign counts</li>
                <li>Ingest a few customers via the Customers page CSV import</li>
                <li>Use the AI Agent to create a segment and launch a campaign</li>
                <li>Watch the Campaigns page live stats update in real time via SSE</li>
              </ol>
            </Section>

          </motion.div>
        </main>
      </div>
    </div>
  );
}
