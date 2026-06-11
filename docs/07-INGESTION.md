# Data Ingestion

The CRM ingests customers and their orders through two hardened JSON REST endpoints.
Both validate every row, import what is valid, and report what is not — a single bad
row never fails the whole batch.

> CSV upload (`POST /api/customers/import`) still exists for the customer onboarding
> flow, but the canonical, validated ingestion path is the JSON `/bulk` endpoints below.

## `POST /api/customers/bulk`

Body: a JSON **array** of customer objects.

Each row is validated with the `CustomerInput` zod schema (`src/lib/ingest-schemas.ts`):

| field | rule |
| --- | --- |
| `name` | required, trimmed, non-empty |
| `email` | optional, valid email; **uniqueness deduped** at insert |
| `phone` | optional, non-empty |
| `city` | optional, non-empty |
| `optedOut` | optional boolean, defaults `false` |
| `attributes` | optional JSON object, defaults `{}` |

Valid rows are inserted with `createMany({ skipDuplicates: true })`, so customers
with a duplicate `email` are **skipped, not errored**.

Response (`201`, or `400` if every row was rejected):

```json
{
  "received": 4,
  "imported": 2,
  "skipped": 0,        // duplicate emails
  "rejected": 2,
  "errors": [
    { "row": 2, "error": "name: Invalid input: expected string, received undefined" },
    { "row": 3, "error": "email: invalid email" }
  ]
}
```

## `POST /api/orders/bulk`

Body: a JSON **array** of order objects, validated with `OrderInput`:

| field | rule |
| --- | --- |
| `customerId` | required; the customer **must exist** |
| `amount` | required number `>= 0` |
| `products` | required; array or object |
| `channel` | required, non-empty |
| `orderedAt` | required; ISO string or Date (coerced) |
| `externalId` | optional; **unique idempotency key** for the source order |

Processing pipeline:

1. **Validate** every row; invalid rows go to `errors[]` with their 1-based row number.
2. **Verify customer linkage** — referenced `customerId`s are looked up in one query;
   rows pointing at an unknown customer are added to `errors[]` (the batch is **not**
   aborted by a foreign-key violation).
3. **Insert + dedup** — valid rows are written with
   `createManyAndReturn({ skipDuplicates: true })`. A repeated `externalId` is skipped,
   so re-posting the same batch imports once and never double-counts revenue.
4. **Attribute in real time** — each newly inserted order is run through
   `attributeOrder()`, which credits it to the most recent communication **delivered to
   the same customer within the 7-day window** before the order. No separate backfill
   call is needed for live orders.

Response (`201`, or `400` if nothing was imported):

```json
{
  "received": 2,
  "imported": 1,
  "skipped": 0,        // duplicate externalIds
  "rejected": 1,
  "attributed": 1,     // orders credited to a campaign on this call
  "errors": [
    { "row": 2, "error": "unknown customerId: ghost-does-not-exist" }
  ]
}
```

## Attribution: live vs. backfill

- **Live** — `/api/orders/bulk` attributes each order as it is ingested.
- **Backfill** — `POST /api/orders/backfill-attribution` re-attributes orders that have
  no attribution yet. It exists for **seeded / historical** data (orders that predate
  any campaign), e.g. after the first demo campaign completes. It is not needed in the
  normal live-ingest path.

## Idempotency

`externalId` is the source system's order id. Because it is `@unique`, the same order
can be safely re-ingested any number of times: the first insert wins, later ones are
counted under `skipped`. This makes the ingestion endpoint safe to retry.

See `TRADEOFFS.md` §10 for the at-scale evolution (async consumer + same idempotency key).
