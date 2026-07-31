import { describe, expect, it } from 'vitest';
import { invoiceDraftSchema } from './invoice';

const validDraft = {
  transactionId: 'tx_123',
  invoiceNumber: 'INV-2026-ABC123',
  merchant: {
    businessName: 'Okafor Electronics',
    phone: '2348023456789',
    tin: '01123456-0001',
    state: 'Lagos',
    preferredLanguage: 'en',
  },
  amount: '1000.00',
  source: 'whatsapp',
};

describe('invoiceDraftSchema', () => {
  it('accepts a valid draft', () => {
    expect(invoiceDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it('accepts a merchant with a null TIN', () => {
    const draft = { ...validDraft, merchant: { ...validDraft.merchant, tin: null } };
    expect(invoiceDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects a non-numeric amount', () => {
    expect(invoiceDraftSchema.safeParse({ ...validDraft, amount: 'abc' }).success).toBe(false);
  });

  it('rejects an amount with more than 2 decimal places', () => {
    expect(invoiceDraftSchema.safeParse({ ...validDraft, amount: '1.234' }).success).toBe(false);
  });

  it('rejects an unknown preferredLanguage', () => {
    const draft = { ...validDraft, merchant: { ...validDraft.merchant, preferredLanguage: 'fr' } };
    expect(invoiceDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rejects a missing invoiceNumber', () => {
    const draft = {
      transactionId: validDraft.transactionId,
      merchant: validDraft.merchant,
      amount: validDraft.amount,
      source: validDraft.source,
    };
    expect(invoiceDraftSchema.safeParse(draft).success).toBe(false);
  });
});
