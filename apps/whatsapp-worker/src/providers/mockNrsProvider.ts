import type { InvoiceDraft, SubmissionResult } from '@naija/shared';
import type { InvoiceSubmissionProvider } from './invoiceSubmission';

export interface MockNRSProviderOptions {
  /** Probability of failure per submit, 0..1. Defaults to env MOCK_NRS_FAIL_RATE. */
  failRate?: number;
  /** Simulated latency floor in ms. Defaults to env MOCK_NRS_DELAY_MS_MIN (2000). */
  minDelayMs?: number;
  /** Simulated latency ceiling in ms. Defaults to env MOCK_NRS_DELAY_MS_MAX (4000). */
  maxDelayMs?: number;
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

const DEFAULT_MIN_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 4000;
const DEFAULT_FAIL_RATE = 0.05;

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Simulated NRS MBS submission provider.
 *
 * Mimics the real behaviour of the NRS e-invoice service well enough to build
 * production-grade retry/error handling against it:
 *  - a realistic 2-4 second network latency window;
 *  - a configurable random failure rate (default 5%);
 *  - on success returns a fake IRN / CSID / QR code that flow through the
 *    Invoice row exactly like the real service's response.
 *
 * The `rng` option is only used by tests to force success/failure deterministically.
 */
export class MockNRSProvider implements InvoiceSubmissionProvider {
  private readonly failRate: number;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly rng: () => number;

  constructor(options: MockNRSProviderOptions = {}) {
    this.failRate = options.failRate ?? readEnvNumber('MOCK_NRS_FAIL_RATE', DEFAULT_FAIL_RATE);
    this.minDelayMs = options.minDelayMs ?? readEnvNumber('MOCK_NRS_DELAY_MS_MIN', DEFAULT_MIN_DELAY_MS);
    this.maxDelayMs = options.maxDelayMs ?? readEnvNumber('MOCK_NRS_DELAY_MS_MAX', DEFAULT_MAX_DELAY_MS);
    this.rng = options.rng ?? Math.random;
  }

  async submit(invoice: InvoiceDraft): Promise<SubmissionResult> {
    await sleep(randomInt(this.minDelayMs, this.maxDelayMs));

    if (this.rng() < this.failRate) {
      return {
        ok: false,
        error: `MOCK_NRS: simulated upstream failure for transaction ${invoice.transactionId} (HTTP 500)`,
      };
    }

    const suffix = invoice.transactionId.slice(-8).toUpperCase();
    return {
      ok: true,
      irn: `NRS-2026-${suffix}`,
      csid: `CSID-${Date.now()}-${suffix}`,
      qrCodeUrl: `https://qr.mock.nrs.local/${invoice.transactionId}`,
    };
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
