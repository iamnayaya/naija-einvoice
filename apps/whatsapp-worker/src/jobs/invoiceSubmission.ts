import type { Job } from 'bullmq';
import { prisma, INVOICE_SUBMISSION_QUEUE, type Prisma, type PrismaClient } from '@naija/shared';
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
export async function processInvoiceSubmission(
  job: Job<{ transactionId: string }>,
  deps: { provider?: InvoiceSubmissionProvider; prisma?: PrismaClient } = {},
): Promise<{ invoiceId: string; status: string }> {
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

/** Human-readable seller invoice number, stable across retries for a transaction. */
export function generateInvoiceNumber(transactionId: string): string {
  const year = new Date().getFullYear();
  const short = transactionId.slice(0, 8).toUpperCase();
  return `INV-${year}-${short}`;
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
