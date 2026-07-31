import type { InvoiceDraft, SubmissionResult } from '@naija/shared';
import type { InvoiceSubmissionProvider } from './invoiceSubmission';

/**
 * REAL NRS MBS integration — NOT IMPLEMENTED (Phase 1).
 *
 * Selecting this provider (NRS_PROVIDER=real) throws on submit because we do
 * not yet hold NRS accreditation. Everything below documents what must change.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT TO BUILD HERE (Phase 1)
 * ────────────────────────────────────────────────────────────────────────────
 *  1. UBL 2.1 XML generation. Map InvoiceDraft → a Peppol BIS 3.0-conformant
 *     UBL 2.1 Invoice with all 55 NRS mandatory fields. The grouped field
 *     reference lives in packages/shared/src/domain/nrs.ts, and the intended
 *     namespace constants (cbc/cac) are exported there too.
 *
 *  2. Signing. Per the NRS spec the invoice XML must be hashed/signed with the
 *     Solution Provider's key material issued during accreditation. The exact
 *     algorithm (currently a HMAC-SHA-256 of the canonicalized XML) must be
 *     confirmed against the onboarding pack — do not guess.
 *
 *  3. MBS session/auth. The NRS Multi-Business Service requires a session /
 *     CSID handshake before submission. Cache the CSID (it is already a column
 *     on Invoice) and refresh on expiry.
 *
 *  4. Submission + response mapping:
 *       - POST the UBL XML to the accredited MBS endpoint.
 *       - Map the response to SubmissionResult exactly:
 *           ok          -> validated response received
 *           irn         -> NRS Invoice Registration Number
 *           csid        -> Communication Session ID
 *           qrCodeUrl   -> hosted QR verification URL (else render locally)
 *           error       -> any NRS rejection reason (JSON or SOAP fault text)
 *
 *  5. Sensitive config (endpoints, credentials, certs) goes in env/secrets —
 *     NEVER committed.
 *
 * Payload-shape requirements are covered in packages/shared/src/domain/nrs.ts
 * (55 mandatory fields, UBL section mapping). Read that file before touching
 * this one.
 * ────────────────────────────────────────────────────────────────────────────
 */
export class RealNRSProvider implements InvoiceSubmissionProvider {
  async submit(_invoice: InvoiceDraft): Promise<SubmissionResult> {
    throw new Error(
      'RealNRSProvider is not implemented. Phase 1 requires NRS MBS accreditation. ' +
        'Set NRS_PROVIDER=mock until then.',
    );
  }
}
