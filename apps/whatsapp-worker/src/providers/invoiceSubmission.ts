import type { InvoiceDraft, SubmissionResult } from '@naija/shared';

/**
 * The seam between the invoice pipeline and whatever authority validates and
 * registers an e-invoice.
 *
 * Phase 0 ships a single implementation: MockNRSProvider. It exists so that
 * the full async pipeline (draft → submit → validate) can be built, tested,
 * and operated against realistic latency (2-4s) and failure (5%) conditions
 * long before we hold NRS accreditation.
 *
 * When accreditation lands (Phase 1), implement this interface against the
 * real NRS MBS (Multi-Business Service) and switch NRS_PROVIDER=real. See
 * realNrsProvider.ts for the exact integration notes and the 55 mandatory
 * fields of the Peppol BIS 3.0 UBL payload.
 */
export interface InvoiceSubmissionProvider {
  submit(invoice: InvoiceDraft): Promise<SubmissionResult>;
}

import { env } from '../config';
import { MockNRSProvider } from './mockNrsProvider';

export type NrsProviderKind = 'mock' | 'real';

export function getInvoiceSubmissionProvider(kind: NrsProviderKind = env.NRS_PROVIDER): InvoiceSubmissionProvider {
  switch (kind) {
    case 'mock':
      return new MockNRSProvider({
        failRate: env.MOCK_NRS_FAIL_RATE,
        minDelayMs: env.MOCK_NRS_DELAY_MS_MIN,
        maxDelayMs: env.MOCK_NRS_DELAY_MS_MAX,
      });
    case 'real':
      return new RealNRSProvider();
  }
}

// Imported lazily below to keep the factory import-order clean.
import { RealNRSProvider } from './realNrsProvider';
