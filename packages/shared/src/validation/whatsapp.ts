import { z } from 'zod';

/**
 * WhatsApp Business Cloud API webhook payload — Phase 0 validation.
 *
 * This validates the exact inbound shape the real Cloud API POSTs to
 * /webhooks/whatsapp (see docs/ARCHITECTURE.md for a sample). We accept the
 * whole envelope but only act on `entry[].changes[].value.messages[]` of type
 * `text`. Other message types (images, buttons, reactions) and `statuses`
 * (delivery reports) are validated but ignored in Phase 0.
 *
 * Phase 1: add request-signature verification (X-Hub-Signature-256) on top of
 * this shape, plus idempotency de-duplication on `message.id` (the Cloud API
 * can redeliver).
 */

const profileSchema = z.object({
  name: z.string().optional(),
});

const contactSchema = z.object({
  profile: profileSchema.optional(),
  wa_id: z.string(),
});

const messageTextSchema = z.object({
  body: z.string(),
});

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum([
    'text',
    'interactive',
    'button',
    'image',
    'audio',
    'video',
    'document',
    'location',
    'sticker',
    'reaction',
  ]),
  text: messageTextSchema.optional(),
});

const valueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(contactSchema).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const changeSchema = z.object({
  field: z.literal('messages'),
  value: valueSchema,
});

const entrySchema = z.object({
  id: z.string(),
  changes: z.array(changeSchema),
});

export const whatsappWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(entrySchema),
});

export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof messageSchema>;
export type WhatsAppValue = z.infer<typeof valueSchema>;
