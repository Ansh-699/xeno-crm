# Overview

## Product

AI-native marketing/engagement Mini CRM for a consumer brand reaching shoppers over WhatsApp, SMS, Email, and RCS. This is NOT a sales/support CRM (no deals, pipelines, leads, or tickets).

## Minimum Capabilities

1. **Ingest data** — take in customers and their orders, store them.
2. **Segment shoppers** — let the marketer (or the AI) carve out audiences based on behaviour and attributes.
3. **Send personalised communications** — dispatch tailored messages to a chosen audience through a SEPARATE stubbed channel service with an async callback loop (delivered/failed/opened/read/clicked).
4. **Surface communication performance insights** — track and present how communications performed at campaign and/or audience level.

## Architecture Constraint

Two services with a callback-driven loop:
- CRM exposes a send API. When a campaign goes out, the CRM calls a separate stubbed channel service with communication details.
- The channel service simulates outcomes. Asynchronously, it calls back into a CRM receipt API with what "happened" to each communication.
- The CRM ingests these callbacks and updates state/stats accordingly.

## Grading Axes

| Axis | What Matters |
|------|-------------|
| Build & deploy | Live hosted product + walkthrough video (baseline, not differentiator) |
| Creativity in scoping | Bold, opinionated product choices — not building everything shallowly |
| AI-native workflow | AI woven into the product itself, not bolted on |
| Code quality & structure | Clean, readable, well-organised code |
| System design & scalability | Reasoning about tradeoffs > perfect architecture |
| Thought clarity | How clearly you think, present, and explain |

## Creative Differentiator

**AI Agent Tool Layer** — instead of hardcoding AI workflow, expose CRM operations as tools the LLM invokes dynamically via Claude's tool_use. The AI decides the workflow (segment, draft, recommend channels, launch) based on the marketer's natural language intent. Confirmation gate on destructive operations.

## Brand & Seed Data

"Brewcraft Coffee" — Indian coffee chain. 2,000 customers, 8,000 orders across 6 months, realistic behavioral patterns (loyalists, regulars, at-risk, new, one-time).
