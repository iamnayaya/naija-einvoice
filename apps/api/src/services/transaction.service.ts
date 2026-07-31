import { prisma, type WhatsAppValue } from '@naija/shared';
import { enqueueInvoiceSubmission } from '../queue/invoice';
import { parseAmountFromText } from './parse';

/**
 * Ingest a WhatsApp Cloud API `value` object (one webhook change) and turn
 * each text message into a Transaction + queued invoice-submission job.
 *
 * Phase 0 stub behaviour:
 *  - Only `type === 'text'` messages are handled.
 *  - The merchant is upserted by phone (WA ID). Real onboarding — collecting
 *    business name, state, preferred language, TIN via the agent network —
 *    arrives in Phase 1; until then we default to sensible placeholders.
 *  - If the amount cannot be parsed the message is logged and dropped (a
 *    structured "ask again" WhatsApp reply is a Phase 1 feature).
 *
 * Returns the number of transactions created.
 */
export async function ingestWhatsAppValue(value: WhatsAppValue): Promise<number> {
  const messages = value.messages ?? [];
  let processed = 0;

  for (const message of messages) {
    if (message.type !== 'text' || !message.text) continue;

    const merchant = await upsertMerchant(message.from, findContactName(value, message.from));

    const amount = parseAmountFromText(message.text.body);
    if (amount === null) {
      console.warn(`[ingest] unparseable amount in message ${message.id} from ${message.from}: "${message.text.body}"`);
      continue;
    }

    const transaction = await prisma.transaction.create({
      data: {
        merchantId: merchant.id,
        amount,
        source: 'whatsapp',
        rawPayload: message as unknown as object, // store exactly what came in
      },
    });

    await enqueueInvoiceSubmission(transaction.id);
    processed++;
  }

  return processed;
}

function findContactName(value: WhatsAppValue, waId: string): string | undefined {
  return value.contacts?.find((c) => c.wa_id === waId)?.profile?.name;
}

async function upsertMerchant(phone: string, contactName?: string) {
  return prisma.merchant.upsert({
    where: { phone },
    update: {},
    create: {
      businessName: contactName ?? `Merchant ${phone.slice(-4)}`,
      phone,
      state: 'Lagos',
      preferredLanguage: 'en',
    },
  });
}
