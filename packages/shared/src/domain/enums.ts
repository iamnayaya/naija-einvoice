export const PREFERRED_LANGUAGES = ['ha', 'yo', 'ig', 'pcm', 'en'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

export const SUBSCRIPTION_TIERS = ['free', 'starter', 'growth'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TRANSACTION_SOURCES = ['whatsapp', 'pos'] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const INVOICE_STATUSES = ['draft', 'pending_submission', 'submitted', 'validated', 'failed'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CONVERSATION_PHASES = ['awaiting_details', 'awaiting_confirmation', 'processing', 'completed'] as const;
export type ConversationPhase = (typeof CONVERSATION_PHASES)[number];

// NOTE: These mirror the Prisma enums in schema.prisma. The Prisma schema is
// the source of truth for persistence; these exist so runtime validation
// (zod) and domain code never need to import the generated client.
