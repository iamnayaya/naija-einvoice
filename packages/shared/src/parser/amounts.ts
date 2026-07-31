import type { AmountSpan } from './types';

/**
 * Naira amount extraction — the heart of Tier 1.
 *
 * We scan a message for every plausible amount spelling and return all of
 * them with their text spans, so the caller can decide single- vs multi-sale
 * and can remove the spans to recover the item description. Supported forms:
 *
 *   - ₦5000, ₦5,000, ₦5000.50            (naira symbol)
 *   - N5000, NGN 5,000                    (prefix codes)
 *   - 5k, 5.5k, 12,500k                   (shorthand — multiplied by 1000)
 *   - 5000 naira, 5000 naija              (word suffix)
 *   - 5,000 / 5000 / 15000 / 250000       (plain digits, 3-7 digits)
 *   - "five thousand naira", "twenty five thousand"  (English word numbers)
 *
 * Anything ambiguous (e.g. "10" as a price, split-amount phrases) is left to
 * Tier 2. Positions are 0-indexed into the original string so callers can
 * splice amounts out without disturbing other tokens.
 */

const NGN_SYMBOL = /₦\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
const NGN_CODE = /\bNGN\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b/gi;
const N_PREFIX = /(?<![A-Za-z])N\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b/g;
const K_SHORTHAND = /\b(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?)k\b/gi;
const NGN_SUFFIX = /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:naira|naija)\b/gi;
const GROUPED = /\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g;
const PLAIN = /\b(\d{3,7})(?:\.(\d{1,2}))?\b/g;

const UNIT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE_WORDS: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 };
const CURRENCY_WORDS = new Set(['naira', 'naija']);

const WORD_TOKENS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and|naira|naija';
const WORD_RE = new RegExp(`\\b(?:${WORD_TOKENS})\\b`, 'gi');

const COUNT_UNITS = '(?:cups?|pcs|pieces?|units?|packs?|wraps?|pairs?|bags?|bottles?|cartons?)';
const QUANTITY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function extractAmounts(text: string): AmountSpan[] {
  const spans: AmountSpan[] = [];
  const push = (start: number, end: number, value: number, raw: string) => {
    if (!Number.isFinite(value) || value <= 0) return;
    spans.push({ start, end, value: value.toFixed(2), raw });
  };

  const scan = (re: RegExp, parse: (m: RegExpExecArray) => number | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const value = parse(m);
      if (value !== null) push(m.index, m.index + m[0].length, value, m[0]);
    }
  };

  scan(NGN_SYMBOL, (m) => toNumber(m[1]));
  scan(NGN_CODE, (m) => toNumber(m[1]));
  scan(N_PREFIX, (m) => toNumber(m[1]));
  scan(K_SHORTHAND, (m) => (toNumber(m[1]) ?? 0) * 1000);
  scan(NGN_SUFFIX, (m) => toNumber(m[1]));
  scan(GROUPED, (m) => toNumber(m[0]));
  scanWordAmounts(text, push);
  scan(PLAIN, (m) => toNumber(m[0]));

  return mergeOverlapping(spans);
}

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function scanWordAmounts(text: string, push: (start: number, end: number, value: number, raw: string) => void): void {
  const matches: Array<{ word: string; index: number; end: number }> = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    matches.push({ word: m[0].toLowerCase(), index: m.index, end: m.index + m[0].length });
  }

  let i = 0;
  while (i < matches.length) {
    const first = matches[i];
    if (!first || !isNumberWord(first.word) || !WORD_VALUES[first.word]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < matches.length - 1) {
      const next = matches[j + 1];
      if (!next) break;
      const gap = text.slice(matches[j]!.end, next.index);
      if (gap.trim() !== '' || (!isNumberWord(next.word) && !CURRENCY_WORDS.has(next.word))) break;
      j += 1;
    }
    const run = matches.slice(i, j + 1);
    const value = parseWordRun(run.map((r) => r.word));
    const hasScaleOrCurrency = run.some((r) => SCALE_WORDS[r.word] !== undefined || CURRENCY_WORDS.has(r.word));
    if (value > 0 && hasScaleOrCurrency && run.length >= 2) {
      const firstToken = run[0];
      const lastToken = run[run.length - 1];
      if (firstToken && lastToken) push(firstToken.index, lastToken.end, value, text.slice(firstToken.index, lastToken.end));
    }
    i = j + 1;
  }
}

const WORD_VALUES: Record<string, number> = { ...UNIT_WORDS, ...TENS_WORDS, ...SCALE_WORDS };

function isNumberWord(word: string): boolean {
  return WORD_VALUES[word] !== undefined;
}

function parseWordRun(words: string[]): number {
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (CURRENCY_WORDS.has(word)) continue;
    const unit = UNIT_WORDS[word];
    const tens = TENS_WORDS[word];
    const scale = SCALE_WORDS[word];
    if (unit !== undefined) current += unit;
    else if (tens !== undefined) current += tens;
    else if (scale !== undefined) {
      if (current === 0) current = 1;
      current *= scale;
      if (scale >= 1000) {
        total += current;
        current = 0;
      }
    }
  }
  return total + current;
}

function mergeOverlapping(spans: AmountSpan[]): AmountSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: AmountSpan[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.start < last.end) continue;
    out.push(span);
  }
  return out;
}

/**
 * Extract a sale quantity from the text surrounding an amount. Returns 1 when
 * no explicit count is present (the invoice default). Handles "x2", "2 cups
 * of garri", "two phones", "3 pcs". Scale/currency words (hundred, thousand,
 * naira) are excluded so "five thousand" is never read as a quantity.
 */
export function extractQuantity(context: string): number {
  const normalized = context.toLowerCase();

  let m = /x(\d{1,2})\b/i.exec(normalized);
  if (m) return parseInt(m[1]!, 10);

  m = new RegExp(`(\\d{1,2})\\s+${COUNT_UNITS}\\b`, 'i').exec(normalized);
  if (m) return parseInt(m[1]!, 10);

  m = new RegExp(`(one|two|three|four|five|six|seven|eight|nine|ten)\\s+${COUNT_UNITS}\\b`, 'i').exec(normalized);
  if (m) return QUANTITY_WORDS[m[1]!] ?? 1;

  m = /\b(\d{1,2})\b\s+[a-z]{2,}/i.exec(normalized);
  if (m) return parseInt(m[1]!, 10);

  m = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b\s+(?!hundred|thousand|million|naira|naija)[a-z]{2,}/i.exec(normalized);
  if (m) return QUANTITY_WORDS[m[1]!] ?? 1;

  return 1;
}
