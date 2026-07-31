import { Router } from 'express';
import { whatsappWebhookSchema } from '@naija/shared';
import { env } from '../config';
import { ingestWhatsAppValue } from '../services/transaction.service';

export const webhooksRouter = Router();

/**
 * GET /webhooks/whatsapp — verification handshake.
 * The WhatsApp Business Cloud API calls this when you register the webhook.
 * Echoing `hub.challenge` proves the endpoint + token are ours.
 */
webhooksRouter.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    res.type('text/plain').send(challenge);
    return;
  }
  res.status(403).json({ error: 'verification failed' });
});

/**
 * POST /webhooks/whatsapp — inbound merchant messages.
 * Validates the Cloud API envelope, ingests text messages as Transactions and
 * enqueues invoice-submission jobs, then replies 200 immediately. Never blocks
 * on the invoice pipeline.
 *
 * Phase 1: verify X-Hub-Signature-256, de-duplicate on message.id, and reply
 * to merchants over the Worker (WhatsApp send API).
 */
webhooksRouter.post('/webhooks/whatsapp', async (req, res) => {
  const parsed = whatsappWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid webhook payload', details: parsed.error.flatten() });
    return;
  }

  try {
    let processed = 0;
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        processed += await ingestWhatsAppValue(change.value);
      }
    }
    res.status(200).json({ status: 'received', processed });
  } catch (err) {
    console.error('[webhooks/whatsapp] ingest failed:', err);
    res.status(500).json({ error: 'ingest failed' });
  }
});
