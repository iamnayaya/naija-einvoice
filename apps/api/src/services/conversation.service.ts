import { prisma, handleIncomingMessage, MockWhatsAppSender, AnthropicTier2 } from '@naija/shared';
import { env } from '../config';
import { enqueueInvoiceSubmission } from '../queue/invoice';

/**
 * API-side adapter for the conversational invoice engine.
 *
 * - Upserts the merchant by phone (WA id) with Phase 0 defaults.
 * - Constructs the engine deps once: the mock WhatsApp sender (swapping the
 *   real Cloud API in later = construct a different sender here), an
 *   Anthropic Tier-2 parser fallback when an API key is configured, and the
 *   BullMQ enqueue adapter (which now carries the conversation thread id so
 *   the worker can deliver the receipt).
 */

export const mockWhatsAppSender = new MockWhatsAppSender();

const tier2Llm = env.ANTHROPIC_API_KEY ? new AnthropicTier2({ apiKey: env.ANTHROPIC_API_KEY, model: env.TIER2_MODEL }) : undefined;

export interface HandleMerchantMessageInput {
  /** WhatsApp id of the merchant (also the conversation thread id). */
  phone: string;
  text: string;
  contactName?: string;
}

export async function handleMerchantMessage(input: HandleMerchantMessageInput) {
  const merchant = await prisma.merchant.upsert({
    where: { phone: input.phone },
    update: {},
    create: {
      businessName: input.contactName ?? `Merchant ${input.phone.slice(-4)}`,
      phone: input.phone,
      state: 'Lagos',
      preferredLanguage: 'en',
    },
  });

  return handleIncomingMessage(
    {
      prisma,
      sender: mockWhatsAppSender,
      llm: tier2Llm,
      enqueue: async ({ transactionIds, threadId }) => {
        for (const transactionId of transactionIds) {
          await enqueueInvoiceSubmission(transactionId, { threadId });
        }
      },
    },
    {
      merchantId: merchant.id,
      whatsappThreadId: input.phone,
      text: input.text,
      preferredLanguage: merchant.preferredLanguage,
    },
  );
}
