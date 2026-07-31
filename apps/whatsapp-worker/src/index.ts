import { Worker, type Job } from 'bullmq';
import { INVOICE_SUBMISSION_QUEUE, type InvoiceSubmissionJobData } from '@naija/shared';
import { redisConnection } from './queue/connection';
import { processInvoiceSubmission } from './jobs/invoiceSubmission';
import { notifyConversationReceipt } from './jobs/conversationReceipt';

const worker = new Worker(
  INVOICE_SUBMISSION_QUEUE,
  (job: Job<InvoiceSubmissionJobData>) => processInvoiceSubmission(job),
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

console.log(`naija-worker listening on queue "${INVOICE_SUBMISSION_QUEUE}" (provider: mock)`);

worker.on('completed', async (job: Job<InvoiceSubmissionJobData>, result) => {
  console.log(`job ${job.id} completed: transaction ${job.data.transactionId} -> ${result.status}`);
  // Conversation-originated jobs carry the thread id so the validated invoice
  // flows back to the merchant as a QR receipt and the conversation is closed.
  if (job.data.threadId && result.status === 'validated') {
    await notifyConversationReceipt(result.invoiceId, job.data.threadId).catch((err: Error) => {
      console.error(`[conversation:receipt] failed: ${err.message}`);
    });
  }
});

worker.on('failed', (job: Job<{ transactionId: string }> | undefined, err: Error) => {
  console.error(`job ${job?.id ?? '?'} failed: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('naija-worker error:', err);
});

async function shutdown() {
  console.log('naija-worker shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
