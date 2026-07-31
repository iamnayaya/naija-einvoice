import { Router } from 'express';
import { prisma } from '@naija/shared';
import { enqueueInvoiceSubmission } from '../queue/invoice';

export const invoicesRouter = Router();

invoicesRouter.get('/invoices', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const invoices = await prisma.invoice.findMany({
      where: status ? { status: status as never } : undefined,
      include: { transaction: { include: { merchant: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ invoices });
  } catch (err) {
    console.error('[invoices] list failed:', err);
    res.status(500).json({ error: 'list failed' });
  }
});

invoicesRouter.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { transaction: { include: { merchant: true } } },
    });
    if (!invoice) {
      res.status(404).json({ error: 'invoice not found' });
      return;
    }
    res.json({ invoice });
  } catch (err) {
    console.error('[invoices] get failed:', err);
    res.status(500).json({ error: 'get failed' });
  }
});

/**
 * POST /invoices/:id/retry — manual retry of a failed invoice.
 * Re-enqueues the submission job; the worker handles dedupe/state.
 */
invoicesRouter.post('/invoices/:id/retry', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) {
      res.status(404).json({ error: 'invoice not found' });
      return;
    }
    if (invoice.status !== 'failed') {
      res.status(409).json({ error: `only failed invoices can be retried (current: ${invoice.status})` });
      return;
    }
    await enqueueInvoiceSubmission(invoice.transactionId);
    res.json({ status: 'queued', invoiceId: invoice.id });
  } catch (err) {
    console.error('[invoices] retry failed:', err);
    res.status(500).json({ error: 'retry failed' });
  }
});
