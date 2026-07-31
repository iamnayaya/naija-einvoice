import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import {
  prisma,
  checkInvoiceQuota,
  monthStart,
  type QuotaCheck,
  INVOICE_SUBMISSION_QUEUE,
  type Prisma,
  type PrismaClient,
} from '@naija/shared';
import type { InvoiceSubmissionProvider } from '../providers/invoiceSubmission';
import { getInvoiceSubmissionProvider } from '../providers/invoiceSubmission';

export { INVOICE_SUBMISSION_QUEUE };

/**
 * Consume an invoice-submission job: draft the invoice for the transaction,
 * submit it to the NRS provider, and persist the outcome.
 *
 * Idempotency: if the transaction already has an invoice in a terminal state
 * (validated/submitted) we skip straight through, so at-least-once delivery
 * from BullMQ is safe.
 *
 * Errors: a provider failure (ok:false, or a thrown error) is recorded on the
 * Invoice (status=failed, submissionError) and re-thrown so BullMQ's
 * exponential backoff retries the job. On a later attempt the same Invoice row
 * (and invoice number) is reused and retried.
 */
export interface ProcessInvoiceResult {
  invoiceId: string;
  status: string;
  /** Present when the free-tier monthly quota blocked the submission. */
  quota?: QuotaCheck;
}

export async function processInvoiceSubmission(
  job: Job<{ transactionId: string }>,
  deps: { provider?: InvoiceSubmissionProvider; prisma?: PrismaClient; now?: Date } = {},
): Promise<ProcessInvoiceResult> {
  const db = deps.prisma ?? prisma;
  const provider = deps.provider ?? getInvoiceSubmissionProvider();

  const transaction = await db.transaction.findUnique({
    where: { id: job.data.transactionId },
    include: { merchant: true },
  });
  if (!transaction) {
    throw new Error(`[invoice-submission] transaction not found: ${job.data.transactionId}`);
  }

  const existing = await db.invoice.findUnique({
    where: { transactionId: transaction.id },
  });
  if (existing && (existing.status === 'validated' || existing.status === 'submitted')) {
    return { invoiceId: existing.id, status: existing.status };
  }

  // Free-tier monthly cap — enforced here at the single pipeline choke point so
  // WhatsApp and POS sales are both covered. A blocked invoice is NOT retried
  // by BullMQ: it is a permanent condition until the merchant upgrades or the
  // month rolls over.
  const now = deps.now ?? new Date();
  const usedThisMonth = await db.invoice.count({
    where: { transaction: { merchantId: transaction.merchantId }, createdAt: { gte: monthStart(now) } },
  });
  const quota = checkInvoiceQuota(transaction.merchant.subscriptionTier, usedThisMonth);
  if (!quota.allowed) {
    const invoice = await db.invoice.upsert({
      where: { transactionId: transaction.id },
      create: {
        transactionId: transaction.id,
        invoiceNumber: generateInvoiceNumber(transaction.id),
        status: 'blocked_by_quota',
        submissionError: `free tier limit (${quota.limit}) reached for the month`,
      },
      update: {
        status: 'blocked_by_quota',
        submissionError: `free tier limit (${quota.limit}) reached for the month`,
      },
    });
    return { invoiceId: invoice.id, status: 'blocked_by_quota', quota };
  }

  const invoice = await db.invoice.upsert({
    where: { transactionId: transaction.id },
    create: {
      transactionId: transaction.id,
      invoiceNumber: generateInvoiceNumber(transaction.id),
    },
    update: { status: 'pending_submission' },
  });

  const draft = toInvoiceDraft(transaction, invoice.invoiceNumber);
  await db.invoice.update({ where: { id: invoice.id }, data: { status: 'submitted' } });

  const result = await provider.submit(draft);

  if (result.ok) {
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'validated',
        irn: result.irn,
        csid: result.csid,
        qrCodeUrl: result.qrCodeUrl,
        submissionError: null,
        submittedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    return { invoiceId: invoice.id, status: 'validated' };
  }

  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: 'failed', submissionError: result.error ?? 'unknown NRS failure' },
  });
  throw new Error(`[invoice-submission] NRS submission failed: ${result.error}`);
}

/**
 * Human-readable seller invoice number, stable across retries for a
 * transaction and unique across transactions: the suffix is the first 8 hex
 * chars of a SHA-256 of the transaction id. (A plain cuid prefix can collide
 * across processes under parallel load — the invoiceNumber column is @unique.)
 */
export function generateInvoiceNumber(transactionId: string): string {
  const year = new Date().getFullYear();
  const digest = createHash('sha256').update(transactionId).digest('hex').slice(0, 8).toUpperCase();
  return `INV-${year}-${digest}`;
}

function toInvoiceDraft(
  transaction: Prisma.TransactionGetPayload<{ include: { merchant: true } }>,
  invoiceNumber: string,
) {
  return {
    transactionId: transaction.id,
    invoiceNumber,
    merchant: {
      businessName: transaction.merchant.businessName,
      phone: transaction.merchant.phone,
      tin: transaction.merchant.tin,
      state: transaction.merchant.state,
      preferredLanguage: transaction.merchant.preferredLanguage,
    },
    amount: transaction.amount.toFixed(2),
    customerRef: transaction.customerRef ?? undefined,
    source: transaction.source,
  };
}
