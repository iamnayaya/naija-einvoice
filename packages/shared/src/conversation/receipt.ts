import QRCode from 'qrcode';
import type { PreferredLanguage } from '../domain/enums';
import { t } from '../i18n';

/**
 * Receipt generation for a validated invoice: a plain-text summary plus a QR
 * code image encoding a mock verification URL that carries the NRS IRN.
 *
 * `RECEIPT_VERIFY_BASE_URL` points at a mock verification page in Phase 1;
 * once NRS provides a real verification portal this is a config change.
 */

export interface ReceiptInput {
  invoice: { invoiceNumber: string; irn: string };
  merchant: { preferredLanguage: PreferredLanguage };
  itemDescription?: string;
  amount: string;
}

export interface Receipt {
  text: string;
  verificationUrl: string;
  qrDataUrl: string;
  qrMimeType: string;
}

export const RECEIPT_VERIFY_BASE_URL =
  process.env.RECEIPT_VERIFY_BASE_URL ?? 'https://einvoice.ng/verify';

export function verificationUrlFor(irn: string): string {
  return `${RECEIPT_VERIFY_BASE_URL}/${encodeURIComponent(irn)}`;
}

export async function buildReceipt(input: ReceiptInput): Promise<Receipt> {
  const { invoice, merchant, itemDescription, amount } = input;
  const verificationUrl = verificationUrlFor(invoice.irn);
  const item = itemDescription ?? invoice.invoiceNumber;

  const text = t(merchant.preferredLanguage, 'receipt_text', {
    item,
    amount,
    irn: invoice.irn,
    url: verificationUrl,
  });

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    width: 256,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  return { text, verificationUrl, qrDataUrl, qrMimeType: 'image/png' };
}
