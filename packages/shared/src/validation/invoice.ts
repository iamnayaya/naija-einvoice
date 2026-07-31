import { z } from 'zod';
import { PREFERRED_LANGUAGES, SUBSCRIPTION_TIERS, TRANSACTION_SOURCES } from '../domain/enums';

export const preferredLanguageSchema = z.enum(PREFERRED_LANGUAGES);
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);
export const transactionSourceSchema = z.enum(TRANSACTION_SOURCES);

export const invoiceDraftSchema = z.object({
  transactionId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  merchant: z.object({
    businessName: z.string().min(1),
    phone: z.string().min(1),
    tin: z.string().nullable(),
    state: z.string().min(1),
    preferredLanguage: preferredLanguageSchema,
  }),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'amount must be a decimal string with at most 2dp'),
  customerRef: z.string().optional(),
  source: transactionSourceSchema,
});

export const submissionResultSchema = z.object({
  ok: z.boolean(),
  irn: z.string().optional(),
  csid: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  error: z.string().optional(),
});

export type InvoiceDraftZod = z.infer<typeof invoiceDraftSchema>;
