// Public surface of @naija/shared.

// Prisma: re-export explicitly (a wildcard re-export would collide with the
// domain enums below, e.g. InvoiceStatus/PreferredLanguage/...).
export { PrismaClient } from '@prisma/client';
export type { Prisma } from '@prisma/client';
export type { Merchant, Agent, Transaction, Invoice } from '@prisma/client';

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
