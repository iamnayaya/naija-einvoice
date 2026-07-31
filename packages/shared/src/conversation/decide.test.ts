import { describe, expect, it } from 'vitest';
import type { ParseResult, ParseStatus } from '../parser/types';
import { decideTurn, type TurnInput } from './decide';
import { emptyContext, type ConversationContext, type PendingSale } from './types';

function parsed(
  status: ParseStatus,
  fields: ParseResult['fields'] = {},
  extra: Partial<ParseResult> = {},
): ParseResult {
  return {
    status,
    tier: 'tier1',
    language: 'en',
    fields,
    missingFields: [],
    confidence: status === 'clarify' ? 0.4 : 0.92,
    raw: 'fixture',
    ...extra,
  };
}

function turn(
  state: TurnInput['state'],
  context: ConversationContext,
  p: ParseResult,
  language: TurnInput['language'] = 'en',
): TurnInput {
  return { state, context, parsed: p, language };
}

describe('decideTurn — awaiting_details', () => {
  it('a complete sale moves to awaiting_confirmation with a confirm_sale prompt', () => {
    const d = decideTurn(
      turn('awaiting_details', emptyContext(), parsed('parsed', { itemDescription: 'shoe', amount: '5000.00' })),
    );
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.replyParams).toMatchObject({ item: 'shoe', amount: '5000.00' });
    expect(d.action).toBeUndefined();
  });

  it('several sales in one message prompt a multi-item confirmation', () => {
    const d = decideTurn(
      turn(
        'awaiting_details',
        emptyContext(),
        parsed('parsed', { itemDescription: 'shoe', amount: '5000.00' }, {
          sales: [
            { itemDescription: 'shoe', amount: '5000.00' },
            { itemDescription: 'bag', amount: '8000.00' },
          ],
        }),
      ),
    );
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_multi');
    expect(d.replyParams).toMatchObject({ n: '2' });
  });

  it('asks for the missing amount when only an item arrives', () => {
    const d = decideTurn(turn('awaiting_details', emptyContext(), parsed('clarify', { itemDescription: 'garri' })));
    expect(d.nextState).toBe('awaiting_details');
    expect(d.replyKey).toBe('ask_amount');
    expect(d.nextContext).toMatchObject({
      pendingSales: [{ itemDescription: 'garri', quantity: 1 }],
      askFor: 'amount',
    });
  });

  it('merges a follow-up amount into the pending item and confirms', () => {
    const context: ConversationContext = { pendingSales: [{ itemDescription: 'garri', quantity: 1 }], askFor: 'amount' };
    const d = decideTurn(turn('awaiting_details', context, parsed('clarify', { amount: '5000.00' })));
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.nextContext.pendingSales).toEqual([
      { itemDescription: 'garri', amount: '5000.00', customerName: undefined, quantity: 1 },
    ]);
  });

  it('applies a correction to the last pending sale', () => {
    const context: ConversationContext = {
      pendingSales: [{ itemDescription: 'shoe', amount: '5000.00', quantity: 1 }],
    };
    const d = decideTurn(turn('awaiting_details', context, parsed('correction', { amount: '6000.00' })));
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.nextContext.pendingSales[0]).toMatchObject({ amount: '6000.00' });
  });

  it('asks for the full sale when a correction has nothing to fix', () => {
    const d = decideTurn(turn('awaiting_details', emptyContext(), parsed('correction', { amount: '6000.00' })));
    expect(d.replyKey).toBe('ask_full');
  });

  it('steers an unprompted YES/NO back to recording a sale', () => {
    for (const status of ['affirmation', 'negation'] as const) {
      const d = decideTurn(turn('awaiting_details', emptyContext(), parsed(status)));
      expect(d.nextState).toBe('awaiting_details');
      expect(d.replyKey).toBe('ask_new_sale');
    }
  });

  it('replies with the unparseable template on garbage', () => {
    const d = decideTurn(turn('awaiting_details', emptyContext(), parsed('unparseable')));
    expect(d.replyKey).toBe('unparseable');
  });
});

describe('decideTurn — awaiting_confirmation', () => {
  const pending: PendingSale[] = [{ itemDescription: 'shoe', amount: '5000.00', quantity: 1 }];
  const context: ConversationContext = { pendingSales: pending };

  it('YES enqueues every complete pending sale', () => {
    const d = decideTurn(turn('awaiting_confirmation', context, parsed('affirmation')));
    expect(d.nextState).toBe('processing');
    expect(d.action).toBe('enqueue');
    expect(d.salesToEnqueue).toEqual(pending);
    expect(d.replyKey).toBe('processing_started');
  });

  it('YES with nothing to confirm asks for the full sale again', () => {
    const d = decideTurn(turn('awaiting_confirmation', emptyContext(), parsed('affirmation')));
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('ask_full');
    expect(d.action).toBeUndefined();
  });

  it('NO cancels the pending sale and returns to recording', () => {
    const d = decideTurn(turn('awaiting_confirmation', context, parsed('negation')));
    expect(d.nextState).toBe('awaiting_details');
    expect(d.replyKey).toBe('cancelled');
    expect(d.nextContext).toEqual(emptyContext());
  });

  it('fresh details replace the pending confirmation', () => {
    const d = decideTurn(
      turn('awaiting_confirmation', context, parsed('parsed', { itemDescription: 'bag', amount: '8000.00' })),
    );
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.nextContext.pendingSales[0]).toMatchObject({ itemDescription: 'bag', amount: '8000.00' });
  });

  it('a correction while waiting restates the summary with the new amount', () => {
    const d = decideTurn(turn('awaiting_confirmation', context, parsed('correction', { amount: '6500.00' })));
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.nextContext.pendingSales[0]).toMatchObject({ amount: '6500.00' });
  });

  it('an unparseable reply restates the pending summary instead of losing it', () => {
    const d = decideTurn(turn('awaiting_confirmation', context, parsed('unparseable')));
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
    expect(d.nextContext.pendingSales).toEqual(pending);
  });
});

describe('decideTurn — processing / completed', () => {
  it('once submitted, further edits are rejected', () => {
    const d = decideTurn(
      turn('processing', emptyContext(), parsed('parsed', { itemDescription: 'shoe', amount: '5000.00' })),
    );
    expect(d.nextState).toBe('processing');
    expect(d.replyKey).toBe('already_submitted');
  });

  it('a fresh message after a completed sale starts a brand-new sale', () => {
    const d = decideTurn(
      turn('completed', emptyContext(), parsed('parsed', { itemDescription: 'shoe', amount: '5000.00' })),
    );
    expect(d.nextState).toBe('awaiting_confirmation');
    expect(d.replyKey).toBe('confirm_sale');
  });
});

describe('decideTurn — upgrade intent (Phase 2 billing)', () => {
  it('asks for the upgrade link in ANY state without losing the conversation', () => {
    for (const state of ['awaiting_details', 'awaiting_confirmation', 'processing'] as const) {
      const d = decideTurn(turn(state, emptyContext(), parsed('intent_upgrade')));
      expect(d.action).toBe('upgrade');
      expect(d.nextState).toBe(state);
    }
  });

  it('keeps an in-progress confirmation intact when the merchant asks to upgrade', () => {
    const context: ConversationContext = {
      pendingSales: [{ itemDescription: 'shoe', amount: '5000.00', quantity: 1 }],
    };
    const d = decideTurn(turn('awaiting_confirmation', context, parsed('intent_upgrade')));
    expect(d.action).toBe('upgrade');
    expect(d.nextContext.pendingSales).toEqual(context.pendingSales);
  });
});
