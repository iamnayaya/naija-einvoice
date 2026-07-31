import { prisma, buildReceipt, t, MockWhatsAppSender, type QuotaCheck } from '@naija/shared';

/**
 * After a transaction's invoice is validated by the NRS provider, build the
 * localized receipt (text + QR code PNG) for that transaction and send it back
 * to the WhatsApp conversation that produced it, then mark the conversation
 * completed so the next message starts a fresh cycle.
 *
 * Runs on the worker (outbound side); uses the same MockWhatsAppSender as the
 * API so swapping in the real Cloud API send endpoint is a one-line change.
 */
export async function notifyConversationReceipt(
  invoiceId: string,
  threadId: string,
  deps: { prisma?: typeof prisma; sender?: MockWhatsAppSender } = {},
): Promise<void> {
  const db = deps.prisma ?? prisma;
  const sender = deps.sender ?? new MockWhatsAppSender();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { transaction: { include: { merchant: true } } },
  });
  if (!invoice?.irn) {
    throw new Error(`[conversation:receipt] invoice ${invoiceId} not validated, cannot build receipt`);
  }

  const raw = (invoice.transaction.rawPayload ?? {}) as { itemDescription?: string };
  const receipt = await buildReceipt({
    invoice: { invoiceNumber: invoice.invoiceNumber, irn: invoice.irn },
    merchant: { preferredLanguage: invoice.transaction.merchant.preferredLanguage },
    itemDescription: raw.itemDescription,
    amount: invoice.transaction.amount.toFixed(2),
  });

  await sender.sendImage(threadId, {
    caption: receipt.text,
    mimeType: receipt.qrMimeType,
    base64: receipt.qrDataUrl,
  });

  await db.conversationState.update({
    where: { whatsappThreadId: threadId },
    data: { state: 'completed' },
  });

  console.log(
    `[conversation:receipt] ${JSON.stringify({ invoiceId, threadId, irn: invoice.irn, at: new Date() })}`,
  );
}

/**
 * When the free-tier monthly cap blocks a WhatsApp-originated sale, send the
 * friendly localized upgrade prompt instead of a receipt. POS-originated sales
 * carry no thread id and surface the cap in the merchant dashboard instead.
 */
export async function notifyQuotaReached(
  invoiceId: string,
  threadId: string,
  quota: QuotaCheck,
  deps: { prisma?: typeof prisma; sender?: MockWhatsAppSender } = {},
): Promise<void> {
  const db = deps.prisma ?? prisma;
  const sender = deps.sender ?? new MockWhatsAppSender();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { transaction: { include: { merchant: true } } },
  });
  if (!invoice) {
    throw new Error(`[conversation:quota] invoice ${invoiceId} not found`);
  }

  const text = t(invoice.transaction.merchant.preferredLanguage, 'free_limit_reached', {
    limit: String(quota.limit),
  });
  await sender.sendText(threadId, text);

  console.log(`[conversation:quota] ${JSON.stringify({ invoiceId, threadId, used: quota.used, at: new Date() })}`);
}
