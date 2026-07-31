import { describe, expect, it } from 'vitest';
import { parseAmountFromText } from './parse';

describe('parseAmountFromText', () => {
  it('parses plain naira amounts', () => {
    expect(parseAmountFromText('5000')).toBe('5000.00');
  });

  it('parses four-digit amounts correctly (no partial match)', () => {
    expect(parseAmountFromText('10000')).toBe('10000.00');
  });

  it('parses naira-sign amounts', () => {
    expect(parseAmountFromText('₦5000')).toBe('5000.00');
  });

  it('parses comma-grouped amounts', () => {
    expect(parseAmountFromText('N5,000')).toBe('5000.00');
    expect(parseAmountFromText('ngn 12,500.75')).toBe('12500.75');
  });

  it('parses decimals to 2dp', () => {
    expect(parseAmountFromText('1000.5')).toBe('1000.50');
  });

  it('rejects non-amount text', () => {
    expect(parseAmountFromText('hello')).toBeNull();
    expect(parseAmountFromText('send me my receipt')).toBeNull();
  });

  it('rejects empty text', () => {
    expect(parseAmountFromText('')).toBeNull();
  });

  it('rejects negative amounts', () => {
    expect(parseAmountFromText('-5000')).toBeNull();
  });
});
