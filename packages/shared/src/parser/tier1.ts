import type { PreferredLanguage } from '../domain/enums';
import { extractAmounts, extractQuantity } from './amounts';
import { cleanItem, extractCustomerName } from './items';
import { detectLanguage, detectReply, normalize } from './language';
import type { AmountSpan, MissingField, SaleFields } from './types';

/**
 * Tier 1 — fast, rule-based extraction.
 *
 * Handles the majority of real merchant messages cheaply with zero network
 * calls: amount extraction (₦/k/words), item description recovery, customer
 * name detection, multi-sale splitting, correction spotting and YES/NO reply
 * detection. When it cannot reach a confident `parsed` result it returns
 * `clarify` / `unparseable` and the caller decides whether to escalate to
 * Tier 2 (the LLM fallback).
 */

export interface Tier1Result {
  status: 'parsed' | 'clarify' | 'correction' | 'affirmation' | 'negation' | 'unparseable';
  language: PreferredLanguage;
  fields: SaleFields;
  sales?: SaleFields[];
  missingFields: MissingField[];
  askFor?: MissingField;
  confidence: number;
}

const CORRECTION_SIGNAL = /(^|\s)(wait|correction|rectify|oops|change it|correct this)(\s|$|!)/i;
const MEAN_AND_NOT = /\bi mean\b/i;

export function tier1Parse(raw: string): Tier1Result {
  // Normalize accents up front so amount/item extraction and verb stripping
  // match consistently (e.g. Igbo "zụtara" -> "zutara"). The original text is
  // preserved on the ParseResult for logging/reconstruction.
  const trimmed = normalize(raw.trim());
  const language = detectLanguage(trimmed);

  const reply = detectReply(trimmed);
  if (reply) {
    return {
      status: reply === 'yes' ? 'affirmation' : 'negation',
      language,
      fields: {},
      missingFields: [],
      confidence: 0.99,
    };
  }

  const amounts = extractAmounts(trimmed);
  const isCorrection = detectCorrection(trimmed);

  if (isCorrection && amounts.length > 0) {
    const corrected = pickCorrectedAmount(trimmed, amounts);
    return {
      status: 'correction',
      language,
      fields: { amount: corrected.value },
      missingFields: [],
      confidence: 0.9,
    };
  }

  if (amounts.length === 0) {
    const item = cleanItem(trimmed, [], language);
    if (item) {
      return clarify(trimmed, language, { itemDescription: item }, ['amount'], 'amount');
    }
    return { status: 'unparseable', language, fields: {}, missingFields: [], confidence: 0 };
  }

  if (amounts.length === 1) {
    const amount = amounts[0]!;
    const context = surroundingContext(trimmed, amount, amounts);
    const customerName = extractCustomerName(trimmed);
    const quantity = extractQuantity(context);
    const item = cleanItem(trimmed, amounts, language);

    if (!item) {
      return clarify(
        trimmed,
        language,
        { amount: amount.value, customerName, quantity },
        ['itemDescription'],
        'itemDescription',
      );
    }

    return {
      status: 'parsed',
      language,
      fields: { itemDescription: item, amount: amount.value, customerName, quantity },
      missingFields: [],
      confidence: 0.92,
    };
  }

  return parseMultipleSales(trimmed, amounts, language);
}

function parseMultipleSales(raw: string, amounts: AmountSpan[], language: PreferredLanguage): Tier1Result {
  const sales: SaleFields[] = amounts.map((amount, index): SaleFields => {
    const prevEnd = index === 0 ? 0 : amounts[index - 1]!.end;
    const nextStart = index === amounts.length - 1 ? raw.length : amounts[index + 1]!.start;
    let candidate = cleanSegment(raw.slice(prevEnd, amount.start), language);

    if (!candidate) {
      candidate = cleanSegment(raw.slice(amount.end, nextStart), language, 'trailing');
    }

    const context = surroundingContext(raw, amount, amounts);
    return {
      itemDescription: candidate,
      amount: amount.value,
      quantity: extractQuantity(context),
    };
  });

  const complete = sales.every((sale) => sale.itemDescription && sale.amount);
  if (!complete) {
    const firstMissing = sales.findIndex((sale) => !sale.itemDescription || !sale.amount);
    const fields = sales[firstMissing] ?? {};
    return clarify(raw, language, fields, ['itemDescription'], 'itemDescription');
  }

  const customerName = extractCustomerName(raw);
  if (customerName) sales[0]!.customerName = customerName;

  return {
    status: 'parsed',
    language,
    fields: sales[0]!,
    sales,
    missingFields: [],
    confidence: 0.88,
  };
}

function clarify(
  raw: string,
  language: PreferredLanguage,
  fields: SaleFields,
  missingFields: MissingField[],
  askFor: MissingField,
): Tier1Result {
  return { status: 'clarify', language, fields, missingFields, askFor, confidence: 0.4 };
}

function detectCorrection(raw: string): boolean {
  if (CORRECTION_SIGNAL.test(raw)) return true;
  return MEAN_AND_NOT.test(raw) && /\bnot\b/i.test(raw);
}

/** For corrections ("wait I mean 6000 not 5000"), pick the amount the merchant
 *  is correcting TOWARDS — the one after the "wait/mean/actually" marker, or
 *  the last amount when no marker is present. */
function pickCorrectedAmount(raw: string, amounts: AmountSpan[]): AmountSpan {
  const marker = /(wait|mean|actually|rectify|oops)/i.exec(raw);
  if (marker) {
    const after = amounts.find((span) => span.start >= marker.index + marker[0].length);
    if (after) return after;
  }
  return amounts[amounts.length - 1]!;
}

function surroundingContext(raw: string, amount: AmountSpan, amounts: AmountSpan[]): string {
  const index = amounts.indexOf(amount);
  const prevEnd = index <= 0 ? 0 : amounts[index - 1]!.end;
  const nextStart = index >= amounts.length - 1 ? raw.length : amounts[index + 1]!.start;
  return raw.slice(prevEnd, nextStart);
}

const SEGMENT_CONNECTORS = ['and', 'to', 'for', 'then', 'plus', 'o', 'na', '&', ','];

function cleanSegment(raw: string, language: PreferredLanguage, side: 'leading' | 'trailing' = 'leading'): string | undefined {
  let text = raw.trim();
  if (side === 'leading') {
    text = stripAny(text, SEGMENT_CONNECTORS, 'leading');
  } else {
    text = stripAny(text, SEGMENT_CONNECTORS, 'trailing');
  }
  const cleaned = cleanItem(text, [], language);
  return cleaned;
}

function stripAny(text: string, phrases: string[], side: 'leading' | 'trailing'): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of phrases) {
      const re = side === 'leading' ? new RegExp(`^${escapeRegExp(phrase)}\\b`, 'i') : new RegExp(`\\b${escapeRegExp(phrase)}$`, 'i');
      if (re.test(out)) {
        out = (side === 'leading' ? out.slice(phrase.length) : out.slice(0, out.length - phrase.length)).trim();
        changed = true;
        break;
      }
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
