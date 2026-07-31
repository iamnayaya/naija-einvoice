import { Queue } from 'bullmq';
import {
  createRedisConnection,
  INVOICE_SUBMISSION_JOB,
  INVOICE_SUBMISSION_QUEUE,
} from '@naija/shared';
import { env } from '../config';
import { redisConnection } from './connection';

/**
 * Producer side of the invoice-submission queue.
 *
 * The webhook handler enqueues a job here and returns 200 immediately — the
 * WhatsApp/POS event never blocks on the invoice pipeline. The consumer
 * (@naija/worker) drafts the invoice and submits it to the NRS provider.
 */
export const invoiceQueue = new Queue(INVOICE_SUBMISSION_QUEUE, {
  connection: createRedisConnection(env.REDIS_URL),
});

export async function enqueueInvoiceSubmission(transactionId: string): Promise<void> {
  await invoiceQueue.add(
    INVOICE_SUBMISSION_JOB,
    { transactionId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  );
}

export { redisConnection };
