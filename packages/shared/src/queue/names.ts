/** Shared queue name (producer in @naija/api, consumer in @naija/worker). */
export const INVOICE_SUBMISSION_QUEUE = 'invoice-submission';
export const INVOICE_SUBMISSION_JOB = 'submit';

/**
 * BullMQ-compatible job payload for an invoice-submission job.
 * The consumer re-hydrates everything from the DB by transactionId.
 */
export interface InvoiceSubmissionJobData {
  transactionId: string;
}
