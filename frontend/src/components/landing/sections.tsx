"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  FileSpreadsheet,
  Gauge,
  Users,
  PenLine,
  Split,
  Bot,
  Heart,
  ShieldAlert,
  UserPlus,
  Activity,
  Check,
  ArrowRight,
} from "lucide-react";
import { Reveal, Eyebrow, SectionHeading } from "./reveal";
import { CursorCard, CursorCardsContainer } from "@/components/ui/cursor-cards";
import { PipelineArchitecture } from "@/components/ui/pipeline-architecture";
import { Pricing as SinglePricing } from "@/components/ui/single-pricing-card";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

const card = "rounded-2xl border border-border bg-card/60 backdrop-blur-xl shadow-sm";

/* ------------------------------------------------------------------ */
/* Tech strip.                                                         */
/* ------------------------------------------------------------------ */
export function TechStrip() {
  const tech = ["Claude", "Next.js", "PostgreSQL", "Redis", "Tailwind", "Three.js"];
  return (
    <section className="border-y border-border/60 py-8">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="mb-5 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
          Built on a modern, AI-native stack
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {tech.map((t) => (
            <span key={t} className="text-lg font-semibold tracking-tight text-muted-foreground/70">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works — a real CSV → stages → channels animated flow.        */
/* ------------------------------------------------------------------ */
export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>How it works</Eyebrow>
          <SectionHeading>From a CSV to a launched campaign</SectionHeading>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Your data flows through one autonomous pipeline — eight stages, most of them hands-off.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-3xl">
          <div className={`p-6 sm:p-10 ${card}`}>
            <PipelineArchitecture className="h-auto w-full" text="XENO AI" />
            <p className="mt-4 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
              CSV rows flow through ingest · clean · score · segment · draft · route · launch · attribute
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features — the single merged capability grid (real, concrete icons).*/
/* ------------------------------------------------------------------ */
const FEATURES = [
  { icon: FileSpreadsheet, title: "CSV import", body: "Drop a CSV and start. Fuzzy column mapping and per-row validation mean messy exports just work." },
  { icon: Gauge, title: "Health scoring", body: "Every shopper is auto-scored — loyal, regular, at-risk, churning, new — from recency, frequency & spend." },
  { icon: Users, title: "Natural-language segments", body: "“Customers in Delhi who spent over ₹5,000.” The AI compiles plain English into a precise audience." },
  { icon: PenLine, title: "AI message drafting", body: "On-brand copy generated per segment and per channel — ready to review before anything sends." },
  { icon: Split, title: "Per-customer channel routing", body: "The AI picks WhatsApp, SMS, or Email individually, per recipient, from engagement patterns." },
  { icon: Bot, title: "Autonomous agent · BYOK", body: "Eleven tools with confirmation gates before any send. Use your own Anthropic, OpenAI, or Google key." },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Features</Eyebrow>
          <SectionHeading>Everything you need to grow</SectionHeading>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            A complete AI-native CRM loop — from ingestion to attribution — that works while you sleep.
          </p>
        </Reveal>

        <CursorCardsContainer className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <CursorCard key={f.title} className="h-full rounded-2xl">
              <div className="group flex h-full flex-col p-6">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500 transition-transform group-hover:scale-110 dark:text-violet-400">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mb-2 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </CursorCard>
          ))}
        </CursorCardsContainer>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* AI Agent showcase.                                                  */
/* ------------------------------------------------------------------ */
const AGENT_STEPS = [
  { tool: "query_customers", note: "Scanning 12,480 profiles by recency & spend" },
  { tool: "create_segment", note: "“Churning VIPs” — high LTV, no order in 90d+" },
  { tool: "preview_audience", note: "342 customers matched" },
  { tool: "draft_messages", note: "Win-back copy generated for 2 channels" },
  { tool: "recommend_channels", note: "WhatsApp for 71%, Email for 29%" },
  { tool: "launch_campaign", note: "Awaiting your approval…" },
];

export function AgentShowcase() {
  return (
    <section id="agent" className="scroll-mt-24 py-10 sm:py-16">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>AI Command Center</Eyebrow>
          <SectionHeading>An agent that does the work</SectionHeading>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Tell it a goal in plain language. It queries your data, builds the segment, drafts the
            messages, picks the channel, and launches — pausing for your approval before anything
            reaches a customer.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              "11 specialized tools, orchestrated automatically",
              "Confirmation gates before any send",
              "Your own API key — never stored",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm text-foreground">
                <Check className="h-4 w-4 flex-shrink-0 text-violet-500 dark:text-violet-400" />
                {t}
              </li>
            ))}
          </ul>
          <Link
            href="/agent"
            className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Try the AI Agent
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <div className={`overflow-hidden ${card}`}>
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Bot className="h-4 w-4 text-violet-500 dark:text-violet-400" />
              <span className="text-xs font-semibold text-foreground">AI Growth Agent</span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="ml-auto w-fit max-w-[80%] rounded-xl rounded-br-sm bg-violet-600 px-3.5 py-2 text-sm text-white">
                Find churning VIPs and win them back
              </div>
              {AGENT_STEPS.map((s, i) => (
                <motion.div
                  key={s.tool}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.16, duration: 0.4 }}
                  className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                  <div>
                    <code className="text-xs font-semibold text-foreground">{s.tool}</code>
                    <p className="text-xs text-muted-foreground">{s.note}</p>
                  </div>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + AGENT_STEPS.length * 0.16, duration: 0.5 }}
                className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3.5 py-2.5"
              >
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Campaign sent</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ 1,204</span>
              </motion.div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Customer intelligence — health tiers.                               */
/* ------------------------------------------------------------------ */
const TIERS = [
  { icon: Heart, label: "Loyal", desc: "Frequent, recent, high spend", count: "1,204", tone: "text-emerald-500" },
  { icon: Users, label: "Regular", desc: "Steady, dependable buyers", count: "3,860", tone: "text-sky-500" },
  { icon: ShieldAlert, label: "At-risk", desc: "Slipping — overdue to buy", count: "342", tone: "text-amber-500" },
  { icon: Activity, label: "Churning", desc: "No purchase in 90 days+", count: "511", tone: "text-red-500" },
  { icon: UserPlus, label: "New", desc: "First purchase under 7 days", count: "89", tone: "text-violet-500" },
];

export function Intelligence() {
  return (
    <section className="py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Customer Intelligence</Eyebrow>
          <SectionHeading>Know every shopper at a glance</SectionHeading>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every customer is scored into a health tier automatically — so the right audience is
            always one click away.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {TIERS.map((t, i) => (
            <Reveal key={t.label} delay={i * 0.06} className="h-full">
              <div className={`flex h-full flex-col p-6 ${card}`}>
                <t.icon className={`mb-4 h-5 w-5 ${t.tone}`} />
                <p className="text-2xl font-bold tracking-tight text-foreground">{t.count}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{t.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stats band.                                                         */
/* ------------------------------------------------------------------ */
const STATS = [
  { v: "11", l: "AI agent tools" },
  { v: "3", l: "messaging channels" },
  { v: "5", l: "customer health tiers" },
  { v: "100%", l: "your data, your keys" },
];

export function Stats() {
  return (
    <section className="border-y border-border/60 py-10">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 sm:px-8 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.07} className="text-center">
            <p className="font-serif text-4xl font-light text-foreground sm:text-5xl">{s.v}</p>
            <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{s.l}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing — single card layout with BorderTrail.                      */
/* ------------------------------------------------------------------ */
export function Pricing() {
  return <SinglePricing />;
}

/* ------------------------------------------------------------------ */
/* Final CTA — just the liquid glass button, centered.                */
/* ------------------------------------------------------------------ */
export function FinalCTA() {
  return (
    <section className="flex justify-center py-8 pb-16">
      <Link href="/dashboard">
        <LiquidButton size="xl">Launch CRM</LiquidButton>
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer.                                                             */
/* ------------------------------------------------------------------ */
const FOOTER = {
  Product: [
    { l: "Dashboard", h: "/" },
    { l: "Customers", h: "/customers" },
    { l: "Segments", h: "/segments" },
    { l: "Campaigns", h: "/campaigns" },
  ],
  Platform: [
    { l: "AI Agent", h: "/agent" },
    { l: "Analytics", h: "/analytics" },
    { l: "How it works", h: "#how" },
    { l: "Pricing", h: "#pricing" },
  ],
  Resources: [
    { l: "Features", h: "#features" },
    { l: "Docs", h: "/docs" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-14">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-semibold tracking-tight text-foreground">Xeno</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">CRM</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              An AI-native mini CRM that autonomously analyzes customer data, discovers high-value
              segments, and runs personalized multi-channel campaigns.
            </p>
          </div>
          {Object.entries(FOOTER).map(([group, links]) => (
            <div key={group}>
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-foreground">{group}</p>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.l}>
                    <Link href={l.h} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.l}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© 2026 Xeno CRM. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">WhatsApp · SMS · Email · Built with Claude</p>
        </div>
      </div>
    </footer>
  );
}
