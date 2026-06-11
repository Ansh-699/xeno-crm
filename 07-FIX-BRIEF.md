# 07 — Fix Brief (Hand-off to Coding Agent)

> **Goal of this document:** a precise, file-by-file work order for an AI coding agent to make the Xeno Mini CRM match the assignment's intent. Repo root referenced below is `xeno/` (contains `backend/`, `frontend/`, `channel-service/`, `docs/`).
>
> **Read this first — the honest verdict.** The assignment's headline requirement is *"AI woven into the product, not bolted on."* A naive reading of the earlier plan said "the AI is a single standalone Command Center tab." **That is only half true and must NOT drive the work.** AI is already surfaced inline across the app:
> - Dashboard: AI insight cards with proactive CTAs (`/api/insights`)
> - Segments: natural-language segment builder + AI suggestions (`/api/insights/suggested-segments`, agent `create_segment`)
> - Customers: AI health scoring (`/api/insights/customer-health`)
> - Campaigns: AI performance brief + "next action" recommendations
> - Analytics: AI executive narrative (`/api/insights/analytics-narrative`)
> - AI Command Center: full agent chat (`/agent`)
>
> So **do not rip out the Command Center** (the PDF explicitly allows chat-first/agentic surfaces). The real problems are: **(1) credibility — fabricated/hardcoded numbers shown as if they were real or AI-generated, and (2) two genuine system-design bugs in the send/receipt loop** — which is precisely what the PDF says is graded hardest ("how you handle volume, ordering, retries, and failures").
>
> Work the priorities in order: **P0 credibility → P1 system-design → P2 AI depth → P3 docs.**

---

## P0 — Credibility bugs (fabricated data shown as real). Fix these first.

### P0.1 — Dashboard shows a hardcoded 88% delivery rate and a wrong customer count
**File:** `frontend/src/app/page.tsx`

Current code:
```ts
setStats({
  customers: segs.reduce((sum, s) => sum + (s.customerCount || 0), 0), // BUG
  segments: segs.length,
  campaigns: camps.length,
  deliveryRate: camps.length > 0 ? 88 : 0, // BUG: hardcoded
});
```
Two problems:
1. **`deliveryRate: 88` is invented.** A grader who launches a campaign will see "88%" regardless of reality.
2. **`customers` sums `segment.customerCount`** → customers in multiple segments are double-counted, and the count is `0` whenever no segments exist even if thousands of customers are imported. It is not the real customer total.

**Fix:** Add a single real stats endpoint and consume it.
- Backend: create `backend/src/routes/stats.ts` with `GET /api/stats` returning real aggregates:
```ts
router.get("/", async (_req, res) => {
  const [customers, segments, campaigns] = await Promise.all([
    prisma.customer.count(),
    prisma.segment.count(),
    prisma.campaign.count(),
  ]);
  // Reuse the analytics overview math for delivery rate (see analytics.ts):
  // delivered / sent across all completed/sending/failed campaigns.
  const { avgDeliveryRate } = await computeOverview(); // extract from analytics.ts or inline
  res.json({ customers, segments, campaigns, deliveryRate: avgDeliveryRate });
});
```
  Register it in `backend/src/index.ts` (`app.use("/api/stats", statsRouter)`).
- Frontend: replace the `load()` body in `page.tsx` to call `apiFetch("/api/stats")` and use those values directly. Remove the `reduce` and the `88` literal.

**Acceptance:** With N imported customers and zero segments, the dashboard "Customers" card shows N. "Avg Delivery" equals the same number shown on the Analytics page overview card (they must be computed by the same code path).

### P0.2 — `/api/insights` invents specific percentages when the API key is a dummy
**File:** `backend/src/routes/insights.ts`

When `isApiKeyDummy()` is true (and the committed `.env` appears to ship a dummy key starting `sk-asDQ`), the endpoints return **hardcoded fabricated metrics presented as AI output**, e.g.:
- `/api/insights`: *"WhatsApp message delivery is at 94.8% compared to SMS."*
- `/api/insights/analytics-narrative` fallback: *"...healthy at 92.4% average..."*

These numbers are not derived from any data. If the grader deploys without a live Anthropic key, the **entire "AI" surface displays invented statistics** — the worst possible look for an "AI-native" submission.

**Fix (do all three):**
1. **Never emit invented numbers.** In every mock/fallback branch, either (a) compute the figure from real data already in scope, or (b) omit the figure entirely and use a qualitative, data-free message. Specifically:
   - In the `/api/insights` dummy branch, the "WhatsApp 94.8%" insight must be replaced with a value computed from `perChannel` delivery stats (query `CommEvent` like `analytics.ts` does), or dropped if there is no campaign data.
   - In `/api/insights/analytics-narrative` the dummy branch already computes `overallDeliveryRate`/`waDeliveryRate` from `context` — good — but the **catch-block fallback** hardcodes "92.4%"; change it to a data-free sentence ("No analytics available yet.") or recompute.
2. **Label mock content honestly.** When running on a dummy key, include `"mock": true` in the JSON so the UI can badge it as sample/non-live (optional but recommended).
3. **Make the dummy-key state obvious in dev**, not silently fabricated. The `console.warn` is not enough; surface it.

**Acceptance:** Grep the repo for any hardcoded percentage literals in insights output (`94.8`, `92.4`, `88`, etc.). None may remain in any response path. Every percentage shown anywhere in the UI must trace to a `delivered/sent` (or equivalent) computation over real rows.

### P0.3 — Secrets committed to git
**Files:** `backend/.env` (committed), `.gitignore`

`backend/.env` is in the repo and `isApiKeyDummy()` keys off `sk-asDQ…`, implying a key value is shipped. Committing `.env` is a red flag in a code-quality review.

**Fix:** Add `**/.env` to `.gitignore`, `git rm --cached backend/.env`, keep only `backend/.env.example`. If the committed key was ever real, rotate it. Confirm `frontend/.env*` is handled the same way.

**Acceptance:** `git ls-files | grep -E '\.env$'` returns nothing; only `.env.example` files are tracked.

---

## P1 — System-design bugs in the send/receipt loop (graded hardest)

> The loop is **mostly solid** — keep it. Transactional outbox written in the same txn as the communications, `FOR UPDATE SKIP LOCKED`, PROCESSING state, exponential backoff, dead-letter with synthetic `failed` `CommEvent`, append-only `CommEvent` with `@@unique([communicationId,status])`, monotonic status rank, `failed` terminal override, P2002→200, and `HINCRBY`+`PUBLISH` are all present and correct. Fix the two real bugs below.

### P1.1 — `launch_campaign` mints a fresh idempotency token on every call (idempotency is effectively disabled)
**File:** `backend/src/lib/ai/tools/index.ts` → `executeLaunchCampaign`

```ts
const result = await launchCampaign({
  ...
  launchToken: randomUUID(), // BUG: new token every invocation
});
```
`campaign-launcher.ts` correctly dedupes on `launchToken` (unique), but because a brand-new UUID is generated **inside the executor**, a retried/duplicated `launch_campaign` tool-call (network blip, resumed `AgentRun`, double-confirm, model re-emitting the tool) produces a **new token → a duplicate campaign and a duplicate full send**. This is exactly the "retries/ordering/failures" failure mode the PDF calls out.

**Fix:** Derive a **stable** token from the logical intent so retries collapse to one campaign. Options (pick one, document it):
- Plumb the `AgentRun` id + tool_use id into `executeTool`/`executeLaunchCampaign` and set `launchToken = sha256(`${runId}:${toolUseId}`)`. Because the model's `tool_use` block id is stable across a single confirmation/resume, retries reuse it. (Preferred — most correct.)
- Or hash the semantic payload: `launchToken = sha256(`${segmentId}:${name}:${JSON.stringify(messages)}`)`. Simpler, but re-launching the *same* segment+name intentionally would be blocked; acceptable for the demo if documented.

Also confirm the launcher's existing-campaign short-circuit returns the original `campaignId` (it does) so the agent reports the same campaign on retry.

**Acceptance:** Invoking `launch_campaign` twice with identical arguments creates exactly **one** `Campaign` row and one set of `Communication`/`Outbox` rows; the second call returns the first campaign's id.

### P1.2 — The reaper can re-send in-flight messages (reaps on `createdAt`, not on time-of-entering-PROCESSING)
**Files:** `backend/src/worker/poller.ts` → `reap()`, `backend/prisma/schema.prisma` (Outbox)

```ts
// reap()
UPDATE "Outbox" SET status='PENDING'
WHERE status='PROCESSING' AND "createdAt" < ${staleThreshold} // BUG
```
`createdAt` is when the outbox row was first inserted, **not** when it entered PROCESSING. Any row older than 60s that the poller just claimed and is *actively sending* can be reset to PENDING by the reaper and **sent again** → duplicate delivery. At demo scale (2000 customers, batches of 50) this will happen on any batch that takes >0s once rows age past 60s.

**Fix:**
1. Add `processingAt DateTime?` to the `Outbox` model; create a migration.
2. When claiming a batch, set it: `UPDATE "Outbox" SET status='PROCESSING', "processingAt"=NOW() WHERE id = ANY(...)`.
3. Change the reaper to `WHERE status='PROCESSING' AND "processingAt" < NOW() - INTERVAL '60 seconds'`.
4. On `SENT`/retry/dead-letter transitions, leave `processingAt` as-is (only matters while PROCESSING).

**Acceptance:** A row whose `createdAt` is 10 minutes old but which entered PROCESSING 2s ago is **not** reaped. Only rows stuck in PROCESSING >60s (i.e., a crashed/orphaned worker) are reset.

### P1.3 — Dead-letter failures don't publish to the live stream (minor real-time inconsistency)
**File:** `backend/src/worker/poller.ts` (dead-letter branch)

Dead-lettering does `redis.hincrby(`campaign:${id}`, "failed", 1)` directly, bypassing the `PUBLISH`. The receipts path uses `incrementCampaignCounter()` (HINCRBY **+** PUBLISH). As a result the Campaigns live SSE view doesn't reflect dead-letter failures until the next snapshot/refresh.

**Fix:** Import and call `incrementCampaignCounter(row.campaignId, "failed")` instead of the bare `hincrby` in the dead-letter branch.

**Acceptance:** Forcing a dead-letter increments the live "Failed" counter on the open Campaigns SSE view without a manual refresh.

### P1.4 — Backoff has no cap (optional hardening)
**File:** `backend/src/worker/poller.ts`

`const backoffMs = 5000 * Math.pow(2, newAttempts);` is unbounded. With `maxAttempts=5` the worst case is ~160s, which is fine, but add a cap for safety and to match the documented design: `const backoffMs = Math.min(5000 * 2 ** newAttempts, 300_000);`

---

## P1.5 — Stale segment counts
**Files:** `backend/src/routes/segments.ts`, `backend/src/lib/ai/tools/index.ts` (`create_segment`)

`Segment.customerCount` is a snapshot stored at creation and **never recomputed**. After a CSV import or new orders, segment cards (and anything reading `customerCount`) drift. The dashboard already stops relying on it after P0.1; also make the segment list honest.

**Fix (pick one):**
- Compute counts live in `GET /api/segments` by running each segment's `filtersToWhere` count (N small queries — fine at demo scale), OR
- Recompute all segment counts after a successful `POST /api/customers/import` and `/bulk`.

**Acceptance:** Importing customers that match an existing segment updates that segment's displayed count without re-creating it.

---

## P2 — AI-native depth (make "woven in" deeper, not just present)

### P2.1 — Campaign launch lives ONLY in the agent chat (the real "bolted-on" symptom)
**Files:** `frontend/src/app/campaigns/page.tsx` (read-only today), `backend/src/routes/campaigns.ts` (`POST /api/campaigns/launch` exists but is unused by the UI)

The Campaigns page only lists campaigns + live stats; the **only** way to create one is typing in the Command Center. That's the strongest "bolted-on" signal. Pick one:
- **(Preferred, lighter) Contextual launch:** add a "Launch with AI" button on the Segments page and Campaigns page that opens the agent **pre-seeded** with that segment ("Launch a campaign to segment <id>"). This keeps the agent as the engine but makes it reachable in-context rather than as a separate destination.
- **(Heavier) Inline composer:** a campaign-create form (segment picker, channel/strategy, message textarea with a **"Draft with AI"** button that calls the agent's drafting tool) that posts to `POST /api/campaigns/launch`. Note this endpoint currently requires a single `channel` + caller-supplied `launchToken`; if you use it, generate the token server-side the same stable way as P1.1 and support `channelStrategy`.

**Acceptance:** A user can start a campaign from where they were working (a segment), not only from the chat tab.

### P2.2 — Add `compare_campaigns` and `get_segment_analytics` agent tools
**Files:** `backend/src/lib/ai/tools/index.ts` (definitions + executors + `executeTool` switch), `backend/src/lib/ai/agent-loop.ts` and `claude-provider.ts` (list them in `SYSTEM_PROMPT`)

Today the agent has 9 tools and cannot compare campaigns or analyze a segment's realized performance. Add:
- `compare_campaigns({ campaignIds: string[] })` → for each, pull `getCampaignStats` + DB status/channel breakdown (reuse `analytics.ts` logic) and return a normalized comparison (delivery/open/click rates per channel). Respect SMS asymmetry (no open/click).
- `get_segment_analytics({ segmentId })` → size, channel availability (email/phone coverage), opted-out share, and aggregate performance of campaigns previously sent to that segment.

Keep both **read-only** (do not add to `TOOLS_REQUIRING_CONFIRMATION`). Update the tool count references in docs (P3).

**Acceptance:** Asking the agent "compare my last two campaigns" and "how does the At-Risk segment perform" returns real, data-grounded answers with no fabricated numbers.

### P2.3 — `analyze_performance` / brief-generator has no dummy-key fallback (inconsistent)
**File:** `backend/src/lib/ai/brief-generator.ts`

Unlike `insights.ts`, `generateCampaignBrief` always calls Claude; on a dummy key it throws, so briefs silently never appear (and the poller logs an error on every completion). Make it consistent: if `isApiKeyDummy()` (export that helper or duplicate it), return a **computed, non-fabricated** brief assembled from the real `statusBreakdown`/`channelBreakdown`/Redis stats (e.g., "Delivered X/Y (Z%). WhatsApp delivered A/B..."). No invented figures.

**Acceptance:** With a dummy key, completing a campaign still produces a brief built from real counts; with a real key, the LLM brief is used.

### P2.4 — `draft_messages` validates but does not draft; `recommend_channels` is a pure heuristic
**File:** `backend/src/lib/ai/tools/index.ts`

- `draft_messages` only checks merge-field validity and char limits — the actual copy is written freeform by the chat model. Either rename it `validate_message` (honest), or add a real generation tool `generate_message_copy({ channel, goal, tone, segmentId? })` that returns AI-written copy grounded in the segment and channel limits. The latter makes drafting genuinely AI-native and reusable by the inline composer (P2.1).
- `recommend_channels` is deterministic if/else (defensible, but it's labeled "analyze"). Keep the logic, but either (a) document it as a rules engine, or (b) have the agent generate a one-line rationale for the *distribution* so the "AI" framing is truthful.

**Acceptance:** If you add `generate_message_copy`, the composer's "Draft with AI" button and the agent both use it; output respects per-channel char limits in `draft_messages`.

### P2.5 — `describe_schema` omits `phone`
**File:** `backend/src/lib/ai/tools/index.ts` → `executeDescribeSchema`

`filtersToWhere`/`segments.ts` support filtering on `phone`, but `describe_schema` doesn't list it, so the agent won't use it. Add `phone: { type: "string", operators: ["eq","neq","contains"] }` to the `customer.fields` block.

---

## P3 — Documentation sync (do last)

**Files:** `docs/03-SEND-RECEIPT-LOOP.md`, `docs/04-AI-AGENT-LAYER.md`, `docs/06-VERIFICATION.md`, and this `docs/07-FIX-BRIEF.md`.
- `04`: tool count 9 → 11; document `compare_campaigns`, `get_segment_analytics` (and `generate_message_copy` if added).
- `03`: update the reaper description to use `processingAt` (not `createdAt`) and note the backoff cap.
- `06`: add verification steps for (a) launch idempotency on retry creates one campaign, (b) reaper never re-sends an in-flight row, (c) no hardcoded percentages anywhere, (d) dashboard customer count = `COUNT(*)`.
- Keep `00–02` and the data-model/loop narrative as-is (accurate).

---

## Quick reference — confirmed-correct, do NOT change
- Transactional outbox (created in the same `$transaction` as `Communication` rows). ✅
- `FOR UPDATE SKIP LOCKED` claim + batch-of-50 send **outside** the transaction. ✅
- Append-only `CommEvent` + `@@unique([communicationId,status])` + P2002→200. ✅
- Monotonic `STATUS_RANK` (pending0/sent1/delivered2/opened=read3/clicked4) with `failed` terminal override; already-failed → discard. ✅
- `incrementCampaignCounter` = HINCRBY + PUBLISH; SSE snapshot-then-delta; pg_notify + 5s fallback poll. ✅
- Per-customer channel resolution with `whatsapp→email→sms→rcs` fallback and contactability checks. ✅
- Merge-field hydration defaults (`name`→"there", `top_product`→"a Brewcraft favourite", `total_orders`→"0", `city`/`days_since_last_order`→omit). ✅
- Rust channel-service (`channel-service/`) and its `Cargo.toml`/`main.rs` are present and intact. ✅

## Suggested execution order for the coding agent
1. ~~P0.3 (.env) → P0.1 (`/api/stats` + dashboard) → P0.2 (insights honesty).~~
2. ~~P1.2 migration (`processingAt`) → P1.1 (idempotency token) → P1.3, P1.4.~~
3. ~~P1.5 (segment counts).~~
4. ~~P2.2 (new tools) → P2.3 (brief fallback) → P2.5 (schema) → P2.1 (contextual launch) → P2.4 (drafting).~~
5. ~~P3 docs.~~

After each phase, run the Verifier pass in `docs/06-VERIFICATION.md` plus the new checks.
