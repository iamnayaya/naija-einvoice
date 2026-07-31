import type { InvoiceDraft } from '@naija/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockNRSProvider } from './mockNrsProvider';

const draft: InvoiceDraft = {
  transactionId: 'tx_test_123',
  invoiceNumber: 'INV-TEST',
  merchant: {
    businessName: 'Test Shop',
    phone: '2348000000000',
    tin: null,
    state: 'Lagos',
    preferredLanguage: 'en',
  },
  amount: '1000.00',
  source: 'whatsapp',
};

describe('MockNRSProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a successful result after a delay within the configured window', async () => {
    vi.useFakeTimers();
    const provider = new MockNRSProvider({
      failRate: 0,
      minDelayMs: 2000,
      maxDelayMs: 4000,
      rng: () => 0.5,
    });

    let settled = false;
    const promise = provider.submit(draft);
    void promise.then(() => {
      settled = true;
    });

    // Not resolved before the minimum delay elapses.
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.irn).toMatch(/^NRS-/);
    expect(result.csid).toBeDefined();
    expect(result.qrCodeUrl).toBeDefined();
  });

  it('fails when the injected rng lands below the fail rate', async () => {
    vi.useFakeTimers();
    const provider = new MockNRSProvider({
      failRate: 0.5,
      minDelayMs: 1,
      maxDelayMs: 1,
      rng: () => 0.0,
    });

    const promise = provider.submit(draft);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/simulated upstream failure/);
  });

  it('succeeds when the injected rng lands above the fail rate', async () => {
    vi.useFakeTimers();
    const provider = new MockNRSProvider({
      failRate: 0.5,
      minDelayMs: 1,
      maxDelayMs: 1,
      rng: () => 0.99,
    });

    const promise = provider.submit(draft);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result.ok).toBe(true);
  });
});
