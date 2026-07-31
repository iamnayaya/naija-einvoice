import { Worker, type Job } from 'bullmq';
import { INVOICE_SUBMISSION_QUEUE } from '@naija/shared';
import { redisConnection } from './queue/connection';
import { processInvoiceSubmission } from './jobs/invoiceSubmission';

const worker = new Worker(
  INVOICE_SUBMISSION_QUEUE,
  (job: Job<{ transactionId: string }>) => processInvoiceSubmission(job),
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

console.log(`naija-worker listening on queue "${INVOICE_SUBMISSION_QUEUE}" (provider: mock)`);

worker.on('completed', (job: Job<{ transactionId: string }>, result) => {
  console.log(`job ${job.id} completed: transaction ${job.data.transactionId} -> ${result.status}`);
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
