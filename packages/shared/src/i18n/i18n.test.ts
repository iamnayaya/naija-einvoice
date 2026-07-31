import { describe, expect, it } from 'vitest';
import { CATALOGS, t } from './index';
import type { MessageKey } from './types';

const EN = CATALOGS.en;
const KEYS = Object.keys(EN) as MessageKey[];

describe('i18n catalogs', () => {
  it.each(Object.keys(CATALOGS))('%s has exactly the same key set as English', (lang) => {
    const catalog = CATALOGS[lang as keyof typeof CATALOGS];
    expect(Object.keys(catalog).sort()).toEqual(KEYS.sort());
  });

  it('every catalog translates the core keys (not raw key names)', () => {
    for (const lang of Object.keys(CATALOGS)) {
      const catalog = CATALOGS[lang as keyof typeof CATALOGS];
      for (const key of ['ask_amount', 'ask_item', 'confirm_sale', 'receipt_text'] as const) {
        expect(catalog[key]).toBeTruthy();
        expect(catalog[key]).not.toBe(key);
      }
    }
  });

  it('the catalogs are actually different languages for the greeting-style copy', () => {
    expect(CATALOGS.ha.ask_amount).not.toBe(CATALOGS.en.ask_amount);
    expect(CATALOGS.pcm.ask_amount).not.toBe(CATALOGS.en.ask_amount);
  });

  it('interpolates template params', () => {
    const reply = t('en', 'confirm_sale', { item: 'shoe', amount: '5000.00', customer: '' });
    expect(reply).toContain('shoe');
    expect(reply).toContain('5000.00');
  });

  it('leaves unknown keys untouched for forward-compat', () => {
    expect(t('en', 'not_a_real_key' as MessageKey)).toBe('not_a_real_key');
  });

  it('receipt_text exists in every language for the receipt builder', () => {
    for (const lang of Object.keys(CATALOGS)) {
      const catalog = CATALOGS[lang as keyof typeof CATALOGS];
      expect(catalog.receipt_text).toContain('{irn}');
      expect(catalog.receipt_text).toContain('{url}');
    }
  });
});
