/** Shared queue name (producer in @naija/api, consumer in @naija/worker). */
export const INVOICE_SUBMISSION_QUEUE = 'invoice-submission';
export const INVOICE_SUBMISSION_JOB = 'submit';

/**
 * BullMQ-compatible job payload for an invoice-submission job.
 * The consumer re-hydrates everything from the DB by transactionId.
 */
export interface InvoiceSubmissionJobData {
  transactionId: string;
  /**
   * WhatsApp thread id (merchant WA id) of the conversation that produced
   * this transaction. Set when the job came from the conversational engine;
   * lets the worker send the receipt and mark the ConversationState completed.
   */
  threadId?: string;
}
