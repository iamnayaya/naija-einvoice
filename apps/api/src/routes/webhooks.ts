import { Router } from 'express';
import { whatsappWebhookSchema, type WhatsAppValue } from '@naija/shared';
import { env } from '../config';
import { handleMerchantMessage } from '../services/conversation.service';

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
 * Validates the Cloud API envelope and drives each text message through the
 * Phase 1 conversational engine (parse -> clarify/confirm -> transaction ->
 * BullMQ job). Replies 200 immediately; never blocks on the invoice pipeline.
 *
 * Phase 1: verify X-Hub-Signature-256, de-duplicate on message.id, and send
 * the bot replies through the real WhatsApp API (swap the mock sender).
 */
webhooksRouter.post('/webhooks/whatsapp', async (req, res) => {
  const parsed = whatsappWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid webhook payload', details: parsed.error.flatten() });
    return;
  }

  try {
    let handled = 0;
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        handled += await handleWhatsAppValue(change.value);
      }
    }
    res.status(200).json({ status: 'received', handled });
  } catch (err) {
    console.error('[webhooks/whatsapp] ingest failed:', err);
    res.status(500).json({ error: 'ingest failed' });
  }
});

async function handleWhatsAppValue(value: WhatsAppValue): Promise<number> {
  const messages = value.messages ?? [];
  let handled = 0;

  for (const message of messages) {
    if (message.type !== 'text' || !message.text) continue;
    await handleMerchantMessage({
      phone: message.from,
      text: message.text.body,
      contactName: findContactName(value, message.from),
    });
    handled += 1;
  }

  return handled;
}

function findContactName(value: WhatsAppValue, waId: string): string | undefined {
  return value.contacts?.find((c) => c.wa_id === waId)?.profile?.name;
}
