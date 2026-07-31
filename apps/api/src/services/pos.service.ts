import {
  POS_ADAPTERS,
  PosWebhookError,
  verifyPosWebhookSignature,
  type NormalizedPosSale,
  type PosProvider,
  type PosVerificationHeaders,
  type PrismaClient,
} from '@naija/shared';
import { Prisma } from '@prisma/client';

/**
 * Provider-agnostic POS webhook ingestion.
 *
 * Flow for every provider on /webhooks/pos/:provider:
 *   verify signature (raw bytes, constant-time, fail-closed)
 *     -> normalize to NormalizedPosSale (pure adapter)
 *     -> skip non-NGN / non-sale events (ack, never fail the provider)
 *     -> resolve the merchant via PosTerminal (provider + terminalRef)
 *     -> create a Transaction (source: pos) with a unique providerReference
 *     -> enqueue into the SAME BullMQ invoice pipeline as WhatsApp sales
 *
 * A POS sale and a WhatsApp-confirmed sale therefore converge on the exact
 * same downstream invoice logic — nothing is duplicated. A webhook retry is
 * idempotent: the unique providerReference makes the second create a no-op.
 */

export interface PosSecrets {
  paystack?: string;
  moniepoint?: string;
  opay?: string;
}

export type IngestPosOutcome =
  | { outcome: 'verified_ignored' }
  | { outcome: 'no_terminal' }
  | { outcome: 'duplicate' }
  | { outcome: 'created'; transactionId: string }
  | { outcome: 'rejected'; reason: 'signature' | 'malformed' };

export interface IngestPosInput {
  provider: PosProvider;
  rawBody: Buffer;
  headers?: PosVerificationHeaders;
  ip?: string;
  secrets: PosSecrets;
  requirePaystackIp?: boolean;
}

export async function ingestPosWebhook(
  deps: { prisma: PrismaClient; enqueue: (transactionId: string) => Promise<void> },
  input: IngestPosInput,
): Promise<IngestPosOutcome> {
  const db = deps.prisma;
  const verified = verifyPosWebhookSignature({
    provider: input.provider,
    rawBody: input.rawBody,
    headers: input.headers,
    secret: input.secrets[input.provider],
    ip: input.ip,
    requireIp: input.requirePaystackIp,
  });
  if (!verified) {
    console.warn(`[pos:signature-failed] ${JSON.stringify({ provider: input.provider })}`);
    return { outcome: 'rejected', reason: 'signature' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    return { outcome: 'rejected', reason: 'malformed' };
  }

  let sale: NormalizedPosSale;
  try {
    sale = POS_ADAPTERS[input.provider].normalize(payload, input.provider);
  } catch (err) {
    if (err instanceof PosWebhookError && err.ignored) return { outcome: 'verified_ignored' };
    console.error(`[pos:normalize-failed] ${JSON.stringify({ provider: input.provider, error: (err as Error).message })}`);
    return { outcome: 'rejected', reason: 'malformed' };
  }

  // Only naira sales can become NRS invoices. Acknowledge everything else.
  if (sale.currency !== 'NGN') {
    console.log(`[pos:skip] non-NGN ${sale.currency}: ${sale.providerTransactionId}`);
    return { outcome: 'verified_ignored' };
  }

  const terminal = await db.posTerminal.findUnique({
    where: { provider_terminalRef: { provider: sale.provider, terminalRef: sale.terminalRef } },
  });
  if (!terminal) {
    // Real money moved at an unknown terminal — surface loudly in logs but
    // still ack so the provider does not retry forever. Fix = register the
    // terminal (PosTerminal) in the admin/onboarding flow.
    console.warn(
      `[pos:unregistered-terminal] ${JSON.stringify({ provider: sale.provider, terminalRef: sale.terminalRef, eventId: sale.providerEventId })}`,
    );
    return { outcome: 'no_terminal' };
  }

  try {
    const transaction = await db.transaction.create({
      data: {
        merchantId: terminal.merchantId,
        amount: sale.amount,
        customerRef: sale.customerRef,
        source: 'pos',
        providerReference: sale.providerTransactionId,
        rawPayload: {
          provider: sale.provider,
          providerEventId: sale.providerEventId,
          terminalRef: sale.terminalRef,
          occurredAt: sale.occurredAt,
          currency: sale.currency,
          raw: sale.raw as Prisma.InputJsonValue,
        },
      },
    });

    await deps.enqueue(transaction.id);

    console.log(
      `[pos:sale] ${JSON.stringify({ transactionId: transaction.id, provider: sale.provider, reference: sale.providerTransactionId, amount: sale.amount, terminalRef: sale.terminalRef })}`,
    );
    return { outcome: 'created', transactionId: transaction.id };
  } catch (err) {
    // Unique violation on providerReference => Paystack/Moniepoint/OPay
    // retried an event we already processed. Ack and move on.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.log(`[pos:duplicate] ${JSON.stringify({ reference: sale.providerTransactionId })}`);
      return { outcome: 'duplicate' };
    }
    throw err;
  }
}
