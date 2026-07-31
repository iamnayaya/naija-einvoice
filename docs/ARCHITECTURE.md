# Naija E-Invoice — Architecture

Compliance-as-a-service for Nigerian micro/small merchants. Generates NRS-compliant
e-invoices from WhatsApp and POS events, distributed through POS agent networks.

This document covers **Phase 0**: the foundation. No NRS integration, no real
WhatsApp credentials — both are stubbed so the pipeline can be built, tested, and
operated before accreditation.

---

## 1. Tech stack

| Layer         | Choice                                   |
| ------------- | ---------------------------------------- |
| Monorepo      | pnpm workspaces                          |
| HTTP API      | Node.js + TypeScript + Express           |
| Database      | PostgreSQL 16 + Prisma 5 ORM             |
| Queue         | BullMQ 5 + Redis 7 (async invoice pipeline) |
| Validation    | Zod (runtime) + TypeScript (compile time) |
| Tests         | Vitest                                   |
| Lint/format   | ESLint 9 (flat config) + Prettier        |
| Local infra   | Docker Compose (Postgres + Redis)        |

## 2. Repository layout

```
apps/
  api/               HTTP API: webhooks, merchants, invoices, health. Also the
                     BullMQ producer (enqueues invoice-submission jobs).
  whatsapp-worker/   BullMQ consumer. Drafts invoices and submits them to the
                     NRS provider (mock today). This is where the real NRS MBS
                     integration will live.
packages/
  shared/            Single source of truth:
                     - prisma/schema.prisma (domain models, generated client)
                     - domain types (InvoiceDraft, SubmissionResult)
                     - NRS/Peppol BIS 3.0 mandatory-field reference
                     - zod validation (WhatsApp webhook, invoice draft)
                     - queue names + Redis connection helper
```

Both apps import everything from `@naija/shared` (the generated Prisma client is
exported from there too), so the three workspaces stay the entire codebase.

## 3. Domain model

```
Agent (POS agent who onboarded the merchant)
  ├── merchant 0..*  (onboardedByAgentId)
Merchant (1) ───< (N) Transaction
  ├── phone unique, tin nullable until NRS registration
  ├── preferredLanguage: ha | yo | ig | pcm | en
  └── subscriptionTier: free | starter | growth
Transaction
  ├── amount Decimal(12,2)  (naira — never float in code or JSON)
  ├── source: whatsapp | pos
  ├── rawPayload Json       (exact inbound payload, untouched, for audit/replay)
  └── invoice 0..1
Invoice
  ├── invoiceNumber (stable across retries — NRS may dedupe on it)
  ├── status: draft -> pending_submission -> submitted -> validated | failed
  ├── irn / csid / qrCodeUrl (populated by the submission provider)
  ├── submissionError (last failure, for retry diagnostics)
  └── submittedAt / validatedAt
```

Indexes: `Transaction(merchantId, createdAt)`, `Transaction(source, createdAt)`,
`Invoice(status, createdAt)`, `Invoice(status, updatedAt)` — the reporting and
retry-scan queries.

## 4. The async pipeline (why the webhook never blocks)

```
WhatsApp Cloud API (or CLI harness)
        │  POST /webhooks/whatsapp
        ▼
@naija/api  ─ validate (zod) ─ upsert merchant ─ create Transaction(rawPayload)
        │
        │  enqueue { transactionId }  →  queue "invoice-submission"  (3 attempts, exp. backoff)
        ▼
@naija/worker  ─ draft invoice ─ submit to InvoiceSubmissionProvider ─ persist result
```

- The API returns `200` immediately after enqueueing; Redis decouples ingest from
  the (2–4s) invoice pipeline.
- The worker is idempotent: an already-`validated`/`submitted` invoice is skipped,
  so at-least-once delivery is safe.
- Provider failures are persisted (`failed` + `submissionError`) and the job is
  re-thrown for BullMQ retry; a later attempt reuses the same invoice number.
- `POST /invoices/:id/retry` re-enqueues a failed invoice manually.

## 5. Provider interface pattern (and why NRS/WhatsApp are stubbed)

### NRS — `InvoiceSubmissionProvider`

```ts
interface InvoiceSubmissionProvider {
  submit(invoice: InvoiceDraft): Promise<SubmissionResult>;
}
```

One method, one seam. Everything upstream (drafting, state machine, retries,
persistence) depends only on this interface.

- **`MockNRSProvider`** (Phase 0): simulates the real service — 2–4s latency, 5%
  configurable failure rate, returns fake IRN/CSID/QR. It accepts an injectable
  RNG so tests can force success/failure deterministically.
- **`RealNRSProvider`** (Phase 1): throws today. Its file carries the full
  integration notes — UBL 2.1/Peppol BIS 3.0 mapping, the 55 mandatory NRS fields,
  signing, MBS session/CSID handshake, and response mapping. See
  `apps/whatsapp-worker/src/providers/realNrsProvider.ts` and
  `packages/shared/src/domain/nrs.ts`.

Switch with `NRS_PROVIDER=mock|real`.

**Why stub:** the real integration requires NRS accreditation (Solution Provider
certification) and onboarding credentials we do not yet hold. Building against a
provider that mimics real latency and failure lets retry/error handling be
developed and tested now instead of on production accreditation day.

### WhatsApp — webhook + CLI harness

- `POST /webhooks/whatsapp` accepts the real WhatsApp Business Cloud API webhook
  envelope (validated with zod) including the GET verification handshake.
- No credentials are needed in Phase 0: `pnpm simulate:whatsapp` POSTs a realistic
  payload locally. A real Cloud API access token, app secret (for
  `X-Hub-Signature-256`), and phone number are Phase 1.

## 6. Running locally (10 minutes)

See `README.md`. Short version:

```bash
corepack enable          # if pnpm isn't on PATH
pnpm install             # also runs prisma generate
cp .env.example .env
docker compose up -d     # Postgres + Redis
pnpm db:setup            # push schema + seed 5 merchants + 1 agent
pnpm dev                 # API :3000 + worker
pnpm simulate:whatsapp   # push a fake WhatsApp message through the pipeline
pnpm test                # unit + integration (integration needs test DB)
```

Useful endpoints:
- `GET /health` — DB + Redis checks
- `GET /invoices?status=validated` — inspect pipeline output
- `POST /invoices/:id/retry` — retry a failed invoice

## 7. NRS payload reference

The 55 mandatory fields of the NRS e-invoice (Peppol BIS 3.0 profile of UBL 2.1)
are grouped and listed in `packages/shared/src/domain/nrs.ts`. Treat the list as a
pre-accreditation reference summary; the authoritative register arrives in the NRS
MBS onboarding pack.

## 8. TODO — Phase 1

Marked for when NRS accreditation and real WhatsApp Business API access land.

- **Real NRS integration**
  - Implement `RealNRSProvider.submit` (UBL 2.1 XML build, signing per onboarding
    pack, MBS session/CSID handshake, response mapping).
  - Confirm the authoritative 55-field register; reconcile `domain/nrs.ts`.
  - Add TIN collection during onboarding (Merchant.tin is nullable today).
  - Decide the retry policy against real NRS rejections (business vs transport
    errors), and whether to add a separate DLQ.
- **Real WhatsApp Business Cloud API**
  - Verify `X-Hub-Signature-256` on every webhook.
  - De-duplicate redelivered messages on `message.id`.
  - Configure a real WABA + phone number; set `WHATSAPP_VERIFY_TOKEN`.
  - Replace free-text amount parsing with a structured interactive-message flow
    (captures amount + customer reference), and send confirmations/receipts back
    through the worker (WhatsApp Messages API).
- **POS integration**
  - Add a POS webhook/endpoint following the `source: pos` path already modelled
    in the Transaction enum.
- **Platform hardening**
  - Merchant onboarding flow through agents (state, language, TIN, MoMo payout).
  - Auth/RBAC for the merchant/invoice admin endpoints.
  - Idempotency keys, structured logging, request tracing, metrics.
  - Real bundling/building of `@naija/shared` (currently consumed as TS source via
    `tsx`; switch to compiled output when deploying Node builds).
