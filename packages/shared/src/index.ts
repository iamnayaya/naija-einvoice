// Public surface of @naija/shared.

// Prisma: re-export explicitly (a wildcard re-export would collide with the
// domain enums below, e.g. InvoiceStatus/PreferredLanguage/...).
export { PrismaClient } from '@prisma/client';
export type { Prisma } from '@prisma/client';
export type { Merchant, Agent, Transaction, Invoice, ConversationState } from '@prisma/client';

export { prisma } from './db/prisma';

export * from './domain/enums';
export type { InvoiceDraft, SubmissionResult } from './domain/invoice';
export { NRS_MANDATORY_FIELD_GROUPS, UBL_NAMESPACES } from './domain/nrs';

export {
  invoiceDraftSchema,
  submissionResultSchema,
  preferredLanguageSchema,
  subscriptionTierSchema,
  transactionSourceSchema,
} from './validation/invoice';
export {
  whatsappWebhookSchema,
  type WhatsAppWebhookPayload,
  type WhatsAppMessage,
  type WhatsAppValue,
} from './validation/whatsapp';

export {
  INVOICE_SUBMISSION_QUEUE,
  INVOICE_SUBMISSION_JOB,
  type InvoiceSubmissionJobData,
} from './queue/names';
export { createRedisConnection } from './queue/redis';
export { envString, envNumber, envFloat } from './utils/env';

export { parseMessage, LOW_CONFIDENCE } from './parser';
export { detectLanguage, detectReply, normalize } from './parser/language';
export { extractAmounts, extractQuantity } from './parser/amounts';
export { AnthropicTier2, DEFAULT_TIER2_MODEL, type Tier2Llm, type LlmExtraction } from './parser/tier2';
export type { ParseResult, ParseStatus, ParseTier, SaleFields, MissingField, AmountSpan } from './parser/types';

export { t, getMessages, CATALOGS } from './i18n';
export type { MessageKey, MessageCatalog } from './i18n/types';

export { decideTurn } from './conversation/decide';
export { handleIncomingMessage } from './conversation/stateMachine';
export type { ConversationDeps, IncomingMessage, HandleResult, TransitionEvent, TransitionLogger } from './conversation/stateMachine';
export { MockWhatsAppSender } from './conversation/sender';
export type { WhatsAppSender, WhatsAppImagePayload } from './conversation/sender';
export { buildReceipt, verificationUrlFor, RECEIPT_VERIFY_BASE_URL } from './conversation/receipt';
export type { Receipt, ReceiptInput } from './conversation/receipt';
export { emptyContext } from './conversation/types';
export type { PendingSale, ConversationContext } from './conversation/types';
