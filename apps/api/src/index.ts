import { createApp } from './app';
import { env } from './config';
import { invoiceQueue } from './queue/invoice';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`naija-api listening on http://localhost:${env.PORT}`);
});

async function shutdown() {
  console.log('naija-api shutting down...');
  server.close();
  await invoiceQueue.close().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
