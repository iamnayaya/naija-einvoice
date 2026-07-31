import express from 'express';
import { healthRouter } from './routes/health';
import { invoicesRouter } from './routes/invoices';
import { merchantsRouter } from './routes/merchants';
import { webhooksRouter } from './routes/webhooks';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(webhooksRouter);
  app.use(merchantsRouter);
  app.use(invoicesRouter);
  return app;
}
