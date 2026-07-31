import type { PreferredLanguage } from '../domain/enums';

/**
 * The structured invoice fields the parser extracts from a free-text
 * merchant message.
 *
 * Phase 1 NOTE: `amount` is always a naira decimal string (2dp), never a
 * float. `itemDescription` is kept in the merchant's own words — we do not
 * normalize vocabulary yet (that's a Phase 2 concern once we know the item
 * catalog).
 */
export interface SaleFields {
  /** What was sold, in the merchant's own words. */
  itemDescription?: string;
  /** Naira amount as a 2dp decimal string. */
  amount?: string;
  /** Buyer, if mentioned in the message. */
  customerName?: string;
  /** Defaults to 1 when the merchant does not mention a count. */
  quantity?: number;
}

export type MissingField = 'itemDescription' | 'amount';

export type ParseStatus =
  | 'parsed'
  | 'clarify'
  | 'correction'
  | 'affirmation'
  | 'negation'
  | 'unparseable';

export type ParseTier = 'tier1' | 'tier2';

/**
 * The single result of parsing one inbound WhatsApp message.
 *
 * - `parsed`        -> enough to draft an invoice. If `sales` is present the
 *                      merchant described more than one sale in one message.
 * - `clarify`       -> fields are missing; `askFor` says which single field
 *                      the bot should ask about first.
 * - `correction`    -> the merchant is fixing a previously-sent value;
 *                      `fields.amount` holds the corrected figure.
 * - `affirmation`   -> a "YES"-equivalent reply to a confirmation prompt.
 * - `negation`      -> a "NO"-equivalent reply.
 * - `unparseable`   -> nothing useful could be extracted.
 */
export interface ParseResult {
  status: ParseStatus;
  /** Which extraction tier produced this result (for observability). */
  tier: ParseTier;
  /** Best-guess language of the message, used to pick bot copy. */
  language: PreferredLanguage;
  /** Fields for the first sale. Present for parsed/correction/clarify. */
  fields: SaleFields;
  /** When one message describes several sales ("shoe 5k and bag 8k"). */
  sales?: SaleFields[];
  missingFields: MissingField[];
  /** Which field to ask about first when status is 'clarify'. */
  askFor?: MissingField;
  /** 0..1 heuristic confidence from Tier 1. */
  confidence: number;
  /** The exact inbound message, for logging/reconstruction. */
  raw: string;
}

/** One amount found in free text, with its position for span removal. */
export interface AmountSpan {
  /** Naira value as a 2dp decimal string. */
  value: string;
  start: number;
  end: number;
  raw: string;
}
