import { describe, expect, it, vi } from 'vitest';
import { PARSER_CORPUS } from './corpus';
import { parseMessage } from './index';
import { detectReply } from './language';
import { AnthropicTier2, type LlmExtraction, type Tier2Llm } from './tier2';

describe('parser corpus (Tier 1)', () => {
  for (const c of PARSER_CORPUS) {
    it(`${c.id}: "${c.raw}" -> ${c.status}`, async () => {
      const result = await parseMessage(c.raw);

      expect(result.status).toBe(c.status);
      expect(result.tier).toBe('tier1');

      if (c.lang) expect(result.language).toBe(c.lang);
      if (c.item) expect(result.fields.itemDescription).toMatch(c.item);
      if (c.amount) expect(result.fields.amount).toBe(c.amount);
      if (c.customer) expect(result.fields.customerName).toBe(c.customer);
      if (c.quantity !== undefined) expect(result.fields.quantity).toBe(c.quantity);

      if (c.sales) {
        expect(result.sales).toHaveLength(c.sales.length);
        for (const [index, sale] of c.sales.entries()) {
          if (sale.item) expect(result.sales![index]!.itemDescription).toMatch(sale.item);
          if (sale.amount) expect(result.sales![index]!.amount).toBe(sale.amount);
        }
      }
    });
  }
});

describe('affirmation/negation detector', () => {
  const cases: Array<[string, 'yes' | 'no' | null]> = [
    ['yes', 'yes'],
    ['Yes O', 'yes'],
    ['eh', 'yes'],
    ['ehhen', 'yes'],
    ['iya', 'yes'],
    ['okay', 'yes'],
    ['no', 'no'],
    ['haba', 'no'],
    ['ko', 'no'],
    ['mba', 'no'],
    ['no o', 'no'],
    ['i sold shoes 5k', null],
    ['sold something', null],
    ['', null],
  ];

  for (const [text, expected] of cases) {
    it(`detectReply("${text}") === ${String(expected)}`, () => {
      expect(detectReply(text)).toBe(expected);
    });
  }
});

describe('upgrade intent detector', () => {
  const upgradeCases = [
    'upgrade',
    'I want to upgrade',
    'upgrade plan',
    'buy plan',
    'subscribe',
    'starter plan',
    'growth plan',
    'premium',
  ];

  for (const text of upgradeCases) {
    it(`"${text}" -> intent_upgrade`, async () => {
      const result = await parseMessage(text);
      expect(result.status).toBe('intent_upgrade');
    });
  }

  it('an amount in the message keeps it a sale, not an upgrade', async () => {
    const result = await parseMessage('sold upgrade phone 5k');
    expect(result.status).toBe('parsed');
    expect(result.fields.itemDescription).toBeTruthy();
    expect(result.fields.amount).toBe('5000.00');
  });

  it('plain sale messages are not upgrade intent', async () => {
    for (const text of ['sold shoes 5k', 'upgrade the system tomorrow']) {
      const result = await parseMessage(text);
      expect(result.status).not.toBe('intent_upgrade');
    }
  });
});

describe('Tier 2 fallback', () => {
  class FakeTier2 implements Tier2Llm {
    readonly name = 'fake';
    calls = 0;
    constructor(private readonly extraction: LlmExtraction) {}

    async extract(_raw: string): Promise<LlmExtraction> {
      this.calls += 1;
      return this.extraction;
    }
  }

  it('does not call the LLM when Tier 1 is confident', async () => {
    const fake = new FakeTier2({ replyType: 'sale', sales: [{ itemDescription: 'phone', amount: '5000.00' }] });
    const fallback = vi.fn();

    const result = await parseMessage('sold phone 5k', { llm: fake, logFallback: fallback });

    expect(result.tier).toBe('tier1');
    expect(fake.calls).toBe(0);
    expect(fallback).not.toHaveBeenCalled();
    expect(result.fields.itemDescription).toMatch(/phone/);
    expect(result.fields.amount).toBe('5000.00');
  });

  it('falls back to the LLM for a missing field and logs it', async () => {
    const fake = new FakeTier2({ replyType: 'sale', sales: [{ itemDescription: 'groundnut', amount: '3000.00' }] });
    const fallback = vi.fn();

    const result = await parseMessage('3000', { llm: fake, logFallback: fallback });

    expect(result.tier).toBe('tier2');
    expect(result.status).toBe('parsed');
    expect(fake.calls).toBe(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ raw: '3000', tier1Status: 'clarify', missingFields: ['itemDescription'] }),
    );
    expect(result.fields.itemDescription).toBe('groundnut');
    expect(result.fields.amount).toBe('3000.00');
  });

  it('falls back to the LLM for an unparseable message', async () => {
    const fake = new FakeTier2({ replyType: 'other' });
    const result = await parseMessage('gjrhtkdl', { llm: fake });

    expect(result.tier).toBe('tier2');
    expect(result.status).toBe('unparseable');
  });

  it('AnthropicTier2 degrades gracefully without an API key', async () => {
    const llm = new AnthropicTier2({ apiKey: undefined });
    const extraction = await llm.extract('anything');
    expect(extraction.replyType).toBe('other');
  });

  it('uses the structured extraction from the LLM, including multi-sale', async () => {
    const fake = new FakeTier2({
      replyType: 'sale',
      sales: [
        { itemDescription: 'shoe', amount: '5,000' },
        { itemDescription: 'bag', amount: '8000.00', quantity: 2 },
      ],
    });

    const result = await parseMessage('something unclear here', { llm: fake });

    expect(result.status).toBe('parsed');
    expect(result.tier).toBe('tier2');
    expect(result.sales).toHaveLength(2);
    expect(result.sales![0]).toEqual(expect.objectContaining({ itemDescription: 'shoe', amount: '5000.00', quantity: 1 }));
    expect(result.sales![1]).toEqual(expect.objectContaining({ itemDescription: 'bag', amount: '8000.00', quantity: 2 }));
  });
});
