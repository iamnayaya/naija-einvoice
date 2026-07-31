import express from 'express';
import { healthRouter } from './routes/health';
import { invoicesRouter } from './routes/invoices';
import { merchantsRouter } from './routes/merchants';
import { webhooksRouter } from './routes/webhooks';
import { posWebhooksRouter } from './routes/posWebhooks';
import { subscriptionWebhooksRouter } from './routes/subscriptionWebhooks';
import { adminRouter } from './routes/admin';

export function createApp() {
  const app = express();
  // MUST mount before express.json(): webhook endpoints verify provider
  // signatures against the raw request bytes, so no JSON parsing may touch the
  // body first.
  app.use(posWebhooksRouter);
  app.use(subscriptionWebhooksRouter);
  app.use(express.json());
  app.use(healthRouter);
  app.use(webhooksRouter);
  app.use(merchantsRouter);
  app.use(invoicesRouter);
  app.use(adminRouter);
  return app;
}
