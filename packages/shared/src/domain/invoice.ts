import type { TransactionSource } from './enums';

/**
 * The document handed to an InvoiceSubmissionProvider.
 *
 * Phase 1 NOTE: this is deliberately NOT the final NRS payload. When we plug
 * in the real NRS MBS / Peppol BIS 3.0 integration, `toInvoiceDraft` will map
 * this draft into the 55-mandatory-field UBL 2.1 XML document (see
 * `domain/nrs.ts` and `apps/whatsapp-worker/src/providers/realNrsProvider.ts`).
 * The draft stays as the app's canonical, provider-agnostic shape.
 */
export interface InvoiceDraft {
  transactionId: string;
  /** Human-readable seller invoice number, e.g. "INV-AB12CD34-2026-0001". */
  invoiceNumber: string;
  merchant: {
    businessName: string;
    /** Merchant phone in E.164-ish form, e.g. "2348012345678". */
    phone: string;
    /** Null until the merchant completes NRS registration (Phase 1). */
    tin: string | null;
    state: string;
    preferredLanguage: string;
  };
  /** Money as a decimal string (naira, 2dp) — never a float. */
  amount: string;
  customerRef?: string;
  source: TransactionSource;
}

export interface SubmissionResult {
  ok: boolean;
  /** NRS Invoice Registration Number. */
  irn?: string;
  /** NRS Communication Session ID. */
  csid?: string;
  qrCodeUrl?: string;
  /** Populated when ok === false. */
  error?: string;
}
