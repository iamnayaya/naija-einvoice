import { describe, expect, it } from 'vitest';
import { buildReceipt, verificationUrlFor } from './receipt';

const BASE = 'https://einvoice.ng/verify';

describe('buildReceipt', () => {
  it('produces a localized text receipt and a QR code PNG', async () => {
    const receipt = await buildReceipt({
      invoice: { invoiceNumber: 'INV-2026-ABC123', irn: 'NRS-8f3a1c9d' },
      merchant: { preferredLanguage: 'en' },
      itemDescription: '2 cups of garri',
      amount: '1000.00',
    });

    expect(receipt.text).toContain('2 cups of garri');
    expect(receipt.text).toContain('1000.00');
    expect(receipt.text).toContain('NRS-8f3a1c9d');
    expect(receipt.text).toContain(BASE);
    expect(receipt.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(receipt.qrMimeType).toBe('image/png');
    expect(receipt.verificationUrl).toBe(`${BASE}/NRS-8f3a1c9d`);
  });

  it('localizes the receipt copy to the merchant language', async () => {
    const en = await buildReceipt({
      invoice: { invoiceNumber: 'INV-2026-ABC', irn: 'NRS-x' },
      merchant: { preferredLanguage: 'en' },
      itemDescription: 'shoe',
      amount: '5000.00',
    });
    const ha = await buildReceipt({
      invoice: { invoiceNumber: 'INV-2026-ABC', irn: 'NRS-x' },
      merchant: { preferredLanguage: 'ha' },
      itemDescription: 'shoe',
      amount: '5000.00',
    });
    expect(ha.text).toContain('shoe');
    expect(ha.text).not.toBe(en.text);
  });

  it('verificationUrlFor URL-encodes the IRN', () => {
    expect(verificationUrlFor('NRS with spaces/')).toContain(encodeURIComponent('NRS with spaces/'));
  });
});
