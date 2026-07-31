import type { PreferredLanguage } from '../domain/enums';
import type { ParseStatus } from './types';

/**
 * The parser regression corpus — 20+ realistic merchant messages across the
 * five supported languages, including messy ones (typos, no punctuation,
 * mixed languages, bare replies). Each case asserts what Tier 1 should
 * extract, or that the message must be flagged for clarification.
 *
 * `lang` is asserted only where language detection is unambiguous; mixed /
 * messy messages omit it.
 */
export interface CorpusCase {
  id: string;
  raw: string;
  lang?: PreferredLanguage;
  status: ParseStatus;
  item?: RegExp | string;
  amount?: string;
  customer?: string;
  quantity?: number;
  sales?: Array<{ item?: RegExp | string; amount?: string }>;
}

export const PARSER_CORPUS: CorpusCase[] = [
  // --- English ---
  { id: 'en-01', raw: 'I sold shoes for 5k to Amina', lang: 'en', status: 'parsed', item: /shoes/, amount: '5000.00', customer: 'Amina' },
  { id: 'en-02', raw: 'Just sold rice ₦5,000', lang: 'en', status: 'parsed', item: /rice/, amount: '5000.00' },
  { id: 'en-03', raw: 'sold handbag 15000', lang: 'en', status: 'parsed', item: /handbag/, amount: '15000.00' },
  { id: 'en-04', raw: 'Paid 3k for recharge card', lang: 'en', status: 'parsed', item: /recharge card/, amount: '3000.00' },
  { id: 'en-05', raw: 'sold shoes 5k and bag 8k', lang: 'en', status: 'parsed', item: /shoes/, amount: '5000.00', sales: [{ item: /shoes/, amount: '5000.00' }, { item: /bag/, amount: '8000.00' }] },
  { id: 'en-06', raw: 'sold two phones for ₦12,500', lang: 'en', status: 'parsed', item: /phones/, amount: '12500.00', quantity: 2 },
  { id: 'en-07', raw: 'five thousand naira for a phone', lang: 'en', status: 'parsed', item: /phone/, amount: '5000.00' },
  { id: 'en-08', raw: 'bought 2 phones for 15k', lang: 'en', status: 'parsed', item: /phones/, amount: '15000.00', quantity: 2 },
  { id: 'en-09', raw: 'i sold 5000 naira recharge card', lang: 'en', status: 'parsed', item: /recharge card/, amount: '5000.00' },

  // --- Pidgin ---
  { id: 'pcm-01', raw: 'na sell phone I sell am 20k', lang: 'pcm', status: 'parsed', item: /phone/, amount: '20000.00' },
  { id: 'pcm-02', raw: 'I dey sell phone for 25k o', lang: 'pcm', status: 'parsed', item: /phone/, amount: '25000.00' },
  { id: 'pcm-03', raw: 'sold 2 cups of garri for ₦1,000', lang: 'en', status: 'parsed', item: /garri/, amount: '1000.00', quantity: 2 },
  { id: 'pcm-04', raw: 'na sell shoe 5k and belt 2k', lang: 'pcm', status: 'parsed', item: /shoe/, amount: '5000.00', sales: [{ item: /shoe/, amount: '5000.00' }, { item: /belt/, amount: '2000.00' }] },

  // --- Hausa ---
  { id: 'ha-01', raw: 'na siyar da takalmi 5k', lang: 'ha', status: 'parsed', item: /takalmi/, amount: '5000.00' },
  { id: 'ha-02', raw: 'ina sayar da shinkafa 15000', lang: 'ha', status: 'parsed', item: /shinkafa/, amount: '15000.00' },
  { id: 'ha-03', raw: 'mun sayar da littafi ₦5000', lang: 'ha', status: 'parsed', item: /littafi/, amount: '5000.00' },

  // --- Yoruba ---
  { id: 'yo-01', raw: 'mo ta bata 5k', lang: 'yo', status: 'parsed', item: /bata/, amount: '5000.00' },
  { id: 'yo-02', raw: 'mo ta awo 1500', lang: 'yo', status: 'parsed', item: /awo/, amount: '1500.00' },
  { id: 'yo-03', raw: 'sold dress fun 2k', status: 'parsed', item: /dress/, amount: '2000.00' },

  // --- Igbo ---
  { id: 'ig-01', raw: 'm rere akpa ego 8k', lang: 'ig', status: 'parsed', item: /akpa/, amount: '8000.00' },
  { id: 'ig-02', raw: 'm zụtara ihe 5000', lang: 'ig', status: 'parsed', item: /ihe/, amount: '5000.00' },
  { id: 'ig-03', raw: 'akwa m rere 3k', lang: 'ig', status: 'parsed', item: /akwa/, amount: '3000.00' },

  // --- Messy / ambiguous / incomplete ---
  { id: 'ms-01', raw: '5000', status: 'clarify', amount: '5000.00' },
  { id: 'ms-02', raw: 'sold shoes', status: 'clarify', item: /shoes/ },
  { id: 'ms-03', raw: 'sold shoes 5k to amina', status: 'parsed', item: /shoes/, amount: '5000.00', customer: 'Amina' },
  { id: 'ms-04', raw: 'wat i mean is i sold shoes 5k', status: 'parsed', item: /shoes/, amount: '5000.00' },
  { id: 'ms-05', raw: 'i sold something 5000', status: 'parsed', item: /something/, amount: '5000.00' },
  { id: 'ms-06', raw: 'please sell my phone', status: 'clarify', item: /phone/ },
  { id: 'ms-07', raw: '5k', status: 'clarify', amount: '5000.00' },
  { id: 'ms-08', raw: 'wait I mean 6000 not 5000', status: 'correction', amount: '6000.00' },
  { id: 'ms-09', raw: 'gjrhtkdl', status: 'unparseable' },
  { id: 'ms-10', raw: 'sold shoe 5k and bag 8k o', status: 'parsed', item: /shoe/, amount: '5000.00', sales: [{ item: /shoe/, amount: '5000.00' }, { item: /bag/, amount: '8000.00' }] },

  // --- Bare affirmative / negative replies ---
  { id: 'rp-01', raw: 'yes', status: 'affirmation' },
  { id: 'rp-02', raw: 'yes o', status: 'affirmation' },
  { id: 'rp-03', raw: 'eh', status: 'affirmation' },
  { id: 'rp-04', raw: 'ehhen', status: 'affirmation' },
  { id: 'rp-05', raw: 'iya', status: 'affirmation' },
  { id: 'rp-06', raw: 'no', status: 'negation' },
  { id: 'rp-07', raw: 'haba', status: 'negation' },
  { id: 'rp-08', raw: 'haba o', status: 'negation' },
  { id: 'rp-09', raw: 'ko', status: 'negation' },
  { id: 'rp-10', raw: 'mba', status: 'negation' },
];
