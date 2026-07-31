import { PREFERRED_LANGUAGES, type PreferredLanguage } from '../domain/enums';
import { detectLanguage } from './language';
import type { MissingField, ParseResult, ParseStatus, SaleFields } from './types';

/**
 * Tier 2 — LLM fallback.
 *
 * Only reached when Tier 1's confidence is low or fields are missing. The
 * Anthropic SDK (claude-sonnet-4-6) is loaded lazily so a missing API key or
 * unavailable package never breaks the rest of the pipeline. Every fallback
 * call is logged by the caller (see `parseMessage`) so we can mine which
 * message patterns Tier 1 needs to learn.
 *
 * The client is deliberately pluggable (the `Tier2Llm` interface) so tests
 * can inject a deterministic fake and so a different provider can be swapped
 * in later without touching the parse flow.
 */

export type LlmReplyType = 'sale' | 'correction' | 'affirmation' | 'negation' | 'other';

export interface LlmExtraction {
  language?: string;
  replyType?: LlmReplyType;
  askFor?: MissingField;
  sales?: SaleFields[];
}

export interface Tier2Llm {
  readonly name: string;
  extract(raw: string): Promise<LlmExtraction>;
}

export interface Tier2Options {
  model?: string;
  apiKey?: string;
  maxRetries?: number;
}

export const DEFAULT_TIER2_MODEL = 'claude-sonnet-4-6';

/**
 * Real Anthropic-backed fallback. Constructed lazily and only when actually
 * used; `extract()` returns `{ replyType: 'other' }` when no API key is
 * configured rather than throwing, so the pipeline degrades gracefully.
 */
export class AnthropicTier2 implements Tier2Llm {
  readonly name = 'anthropic';
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly maxRetries: number;

  constructor(opts?: Tier2Options) {
    this.model = opts?.model ?? process.env.TIER2_MODEL ?? DEFAULT_TIER2_MODEL;
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.maxRetries = opts?.maxRetries ?? 2;
  }

  async extract(raw: string): Promise<LlmExtraction> {
    if (!this.apiKey) {
      return { replyType: 'other' };
    }

    const { Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      tools: [
        {
          name: 'extract_invoice_fields',
          description: 'Extract invoice fields from a merchant WhatsApp message.',
          input_schema: {
            type: 'object',
            properties: {
              language: {
                type: 'string',
                enum: [...PREFERRED_LANGUAGES],
                description: 'Best-guess language of the message (en, pcm, ha, yo, ig).',
              },
              replyType: {
                type: 'string',
                enum: ['sale', 'correction', 'affirmation', 'negation', 'other'],
                description:
                  "How to interpret the message: a sale, a correction of a previous amount, a YES/NO reply to a confirmation prompt, or something else.",
              },
              askFor: {
                type: 'string',
                enum: ['itemDescription', 'amount'],
                description: 'When replyType is other/not a complete sale: which single field to ask the merchant for.',
              },
              sales: {
                type: 'array',
                description: 'One entry per sale described in the message (usually exactly one).',
                items: {
                  type: 'object',
                  properties: {
                    itemDescription: { type: 'string', description: 'What was sold, in the merchant\'s own words.' },
                    amount: { type: 'string', description: 'Naira amount as a decimal string, e.g. "5000.00".' },
                    customerName: { type: 'string', description: 'Buyer name, if mentioned.' },
                    quantity: { type: 'integer', description: 'Number of units sold; default 1.' },
                  },
                  required: ['itemDescription', 'amount'],
                },
              },
            },
            required: ['replyType', 'sales'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_invoice_fields' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Parse this WhatsApp message from a Nigerian micro-merchant into structured invoice fields. ' +
                'It may be in English, Nigerian Pidgin, Hausa, Yoruba, or Igbo, and may contain typos or no punctuation. ' +
                'If it is a sale, extract item, amount, quantity, and buyer. If it is a correction of a previous amount, ' +
                'replyType=correction with the corrected amount. If it is a short YES/NO answer to a confirmation prompt, ' +
                'replyType=affirmation/negation. If it is not a sale and not a reply, replyType=other and set askFor to the ' +
                'single field the bot should ask for next.\n\n' +
                raw,
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> =>
        block.type === 'tool_use' && block.name === 'extract_invoice_fields',
    );

    if (!toolUse) return { replyType: 'other' };
    return toolUse.input as LlmExtraction;
  }
}

/** Maps a raw LLM extraction to a normalized ParseResult. Never throws — on
 *  LLM/parse failure it degrades to `unparseable` so the conversation can
 *  recover with a polite fallback instead of crashing. */
export async function tier2Parse(raw: string, llm: Tier2Llm): Promise<ParseResult> {
  let extraction: LlmExtraction;
  try {
    extraction = await llm.extract(raw);
  } catch {
    return {
      status: 'unparseable',
      tier: 'tier2',
      language: detectLanguage(raw),
      fields: {},
      missingFields: [],
      confidence: 0,
      raw,
    };
  }

  const language: PreferredLanguage = isLanguage(extraction.language) ? extraction.language : detectLanguage(raw);
  const sales = (extraction.sales ?? []).map(normalizeSale);
  const replyType = extraction.replyType ?? 'other';

  const status: ParseStatus =
    replyType === 'sale'
      ? sales.length > 0
        ? 'parsed'
        : 'clarify'
      : replyType === 'correction'
        ? 'correction'
        : replyType === 'affirmation'
          ? 'affirmation'
          : replyType === 'negation'
            ? 'negation'
            : sales.length > 0
              ? 'parsed'
              : 'unparseable';

  const missingFields: MissingField[] = sales[0]
    ? (['itemDescription', 'amount'] as MissingField[]).filter((f) => sales[0]![f] === undefined)
    : status === 'clarify'
      ? [extraction.askFor ?? 'amount']
      : [];

  return {
    status,
    tier: 'tier2',
    language,
    fields: sales[0] ?? {},
    sales: sales.length > 1 ? sales : undefined,
    missingFields,
    askFor: status === 'clarify' ? extraction.askFor ?? 'amount' : undefined,
    confidence: status === 'parsed' || status === 'correction' ? 0.99 : 0.6,
    raw,
  };
}

function normalizeSale(sale: SaleFields): SaleFields {
  const out: SaleFields = {};
  if (typeof sale.itemDescription === 'string') out.itemDescription = sale.itemDescription.trim();
  if (typeof sale.amount === 'string') {
    const value = Number(sale.amount.replace(/[₦,]/g, ''));
    if (Number.isFinite(value) && value > 0) out.amount = value.toFixed(2);
  }
  if (typeof sale.customerName === 'string') out.customerName = sale.customerName.trim();
  if (typeof sale.quantity === 'number' && Number.isInteger(sale.quantity) && sale.quantity > 0) {
    out.quantity = sale.quantity;
  } else {
    out.quantity = 1;
  }
  return out;
}

function isLanguage(value: string | undefined): value is PreferredLanguage {
  return value !== undefined && (PREFERRED_LANGUAGES as readonly string[]).includes(value);
}
