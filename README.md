# Naija E-Invoice

NRS-compliant e-invoicing for Nigerian micro/small merchants, delivered over
WhatsApp and POS, distributed through POS agent networks.

> **Phase 0 — foundation only.** NRS integration and real WhatsApp credentials
> are stubbed. You can run the full pipeline (WhatsApp message → transaction →
> invoice → mock NRS validation) locally without any external accounts.

## Prerequisites

- **Node.js 20+** (tested on 22)
- **pnpm** — enable with `corepack enable`, or `npm i -g pnpm`
- **Docker** (for local Postgres + Redis)

## Setup (under 10 minutes)

```bash
git clone <your-repo> && cd naija-einvoice
corepack enable              # only if `pnpm` isn't on your PATH
pnpm install                 # installs all workspaces
cp .env.example .env         # local dev defaults are already correct
docker compose up -d         # starts Postgres:5432 and Redis:6379
pnpm db:setup                # generates the Prisma client + pushes the schema + seeds 5 merchants and 1 agent
pnpm dev                     # starts API (:3000) + worker (BullMQ consumer)
```

## Verify the pipeline

```bash
# 1. Health check — DB + Redis
curl http://localhost:3000/health

# 2. Simulate a merchant WhatsApp message ("5000" naira) — no WhatsApp account needed
pnpm simulate:whatsapp
pnpm simulate:whatsapp --text "₦12000" --from 2348023456789 --name "Okafor Electronics"

# 3. Watch the invoice go draft → submitted → validated (takes ~2-4s)
curl "http://localhost:3000/invoices?status=validated"
```

Expected output: a `validated` invoice with a fake `irn` (`NRS-2026-...`), `csid`
and `qrCodeUrl`. Mock failures happen ~5% of the time — retry them with
`POST /invoices/:id/retry`.

## Testing

```bash
pnpm test                 # unit tests (no infra needed)
pnpm test:db:push         # create the test DB schema (one time, after docker up)
pnpm test                 # now includes the full-pipeline integration test
```

The integration test drives a transaction through the whole pipeline against a
real Postgres (`naija_einvoice_test`) using the deterministic mock provider:
`transaction created → invoice drafted → submitted → validated`, plus the failure
and retry paths.

## Useful commands

| Command                   | What it does                            |
| ------------------------- | --------------------------------------- |
| `pnpm dev`                | Run API + worker (watch mode)           |
| `pnpm dev:api`            | Run only the API                        |
| `pnpm dev:worker`         | Run only the worker                     |
| `pnpm db:up` / `db:down`  | Start / stop Postgres + Redis           |
| `pnpm db:setup`           | generate + push schema + seed           |
| `pnpm simulate:whatsapp`  | POST a fake WhatsApp webhook locally    |
| `pnpm test`               | Run all unit + integration tests        |
| `pnpm lint` / `pnpm build`| ESLint / TypeScript typecheck           |
| `pnpm format`             | Prettier write                          |

## Project layout

```
apps/api/            Express API + webhook + BullMQ producer
apps/whatsapp-worker/ BullMQ consumer + NRS submission providers (mock/real)
packages/shared/     Prisma schema, domain types, zod validation, NRS field reference
docs/ARCHITECTURE.md Deep-dive: domain model, pipeline, stubs, Phase 1 TODOs
```

## Configuration

All environment variables are documented in `.env.example`. Key ones:
`DATABASE_URL`, `REDIS_URL`, `NRS_PROVIDER` (`mock`|`real`), `MOCK_NRS_FAIL_RATE`,
`MOCK_NRS_DELAY_MS_MIN/MAX`, `WHATSAPP_VERIFY_TOKEN`.

## Roadmap

Phase 1 (needs NRS accreditation + real WhatsApp Business API): real UBL 2.1
payloads with the 55 mandatory NRS fields, MBS session/submission, webhook
signature verification, structured WhatsApp flows, and POS ingest. Details in
`docs/ARCHITECTURE.md` → "TODO — Phase 1".
