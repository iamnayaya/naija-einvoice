import type { ConversationPhase, PreferredLanguage } from '../domain/enums';
import { t, type MessageKey } from '../i18n';
import type { ParseResult, SaleFields } from '../parser/types';
import { emptyContext, type ConversationContext, type PendingSale } from './types';

/**
 * Pure conversation state transition logic — no I/O. Given the current
 * conversation state + the parsed message, decide the next state, the bot
 * reply (as a localized template key + params), and any side action
 * (`enqueue`: create Transactions and push them into the BullMQ pipeline).
 *
 * Keeping this pure makes the whole dialogue testable without a database and
 * easy to reason about; the orchestrator (stateMachine.ts) applies the DB
 * writes and sends the rendered reply.
 */

export interface TurnInput {
  state: ConversationPhase;
  context: ConversationContext;
  parsed: ParseResult;
  language: PreferredLanguage;
}

export interface TurnDecision {
  nextState: ConversationPhase;
  nextContext: ConversationContext;
  replyKey: MessageKey;
  replyParams?: Record<string, string>;
  /** When set, the orchestrator must create Transactions + enqueue jobs. */
  action?: 'enqueue';
  salesToEnqueue?: PendingSale[];
}

export function decideTurn(input: TurnInput): TurnDecision {
  switch (input.state) {
    case 'awaiting_details':
      return decideAwaitingDetails(input);
    case 'awaiting_confirmation':
      return decideAwaitingConfirmation(input);
    case 'processing':
      // Already submitted — merchant can no longer edit. Credit notes (Phase 2).
      return { nextState: 'processing', nextContext: input.context, replyKey: 'already_submitted' };
    case 'completed':
      // A fresh message after a completed sale starts a brand-new sale.
      return decideAwaitingDetails({ ...input, state: 'awaiting_details', context: emptyContext() });
  }
}

function decideAwaitingDetails(input: TurnInput): TurnDecision {
  const { context, parsed, language } = input;

  switch (parsed.status) {
    case 'affirmation':
    case 'negation':
      // An unprompted yes/no — steer back to recording a sale.
      return { nextState: 'awaiting_details', nextContext: context, replyKey: 'ask_new_sale' };

    case 'unparseable':
      return { nextState: 'awaiting_details', nextContext: context, replyKey: 'unparseable' };

    case 'clarify': {
      // Merge whatever the merchant just answered into the partial sale.
      const merged = mergeFields(context.pendingSales[0] ?? fromFields(parsed.fields), fromFields(parsed.fields));
      const pendingSales = [merged];
      if (isComplete(merged)) return summaryReply(language, pendingSales);
      const askFor = parsed.askFor ?? 'amount';
      return {
        nextState: 'awaiting_details',
        nextContext: { pendingSales, askFor },
        replyKey: askFor === 'amount' ? 'ask_amount' : 'ask_item',
      };
    }

    case 'correction': {
      const current = context.pendingSales;
      if (current.length === 0) {
        return { nextState: 'awaiting_details', nextContext: context, replyKey: 'ask_full' };
      }
      const corrected = applyCorrection(current, parsed);
      return summaryReply(language, corrected);
    }

    case 'parsed':
      return summaryReply(language, salesFromParsed(parsed));
  }
}

function decideAwaitingConfirmation(input: TurnInput): TurnDecision {
  const { context, parsed, language } = input;

  switch (parsed.status) {
    case 'affirmation': {
      const pendingSales = context.pendingSales.filter(isComplete);
      if (pendingSales.length === 0) {
        return { nextState: 'awaiting_confirmation', nextContext: context, replyKey: 'ask_full' };
      }
      const first = pendingSales[0]!;
      return {
        nextState: 'processing',
        nextContext: emptyContext(),
        action: 'enqueue',
        salesToEnqueue: pendingSales,
        replyKey: 'processing_started',
        replyParams: { item: first.itemDescription ?? '', amount: first.amount ?? '' },
      };
    }

    case 'negation':
      return { nextState: 'awaiting_details', nextContext: emptyContext(), replyKey: 'cancelled' };

    case 'correction': {
      const corrected = applyCorrection(context.pendingSales, parsed);
      return summaryReply(language, corrected);
    }

    case 'parsed': {
      // New details instead of a YES — replace the pending confirmation.
      return summaryReply(language, salesFromParsed(parsed));
    }

    case 'clarify':
    case 'unparseable':
      // Don't lose the pending confirmation — restate it.
      return summaryReply(language, context.pendingSales);
  }
}

function fromFields(fields: SaleFields): PendingSale {
  return {
    itemDescription: fields.itemDescription,
    amount: fields.amount,
    customerName: fields.customerName,
    quantity: fields.quantity ?? 1,
  };
}

function salesFromParsed(parsed: ParseResult): PendingSale[] {
  const sales = parsed.sales && parsed.sales.length > 0 ? parsed.sales : [parsed.fields];
  return sales.map(fromFields).filter((sale) => sale.itemDescription || sale.amount);
}

function mergeFields(target: PendingSale, source: PendingSale): PendingSale {
  return {
    itemDescription: target.itemDescription ?? source.itemDescription,
    amount: target.amount ?? source.amount,
    customerName: target.customerName ?? source.customerName,
    quantity: source.quantity ?? target.quantity ?? 1,
  };
}

function applyCorrection(sales: PendingSale[], parsed: ParseResult): PendingSale[] {
  const corrected = sales.map((sale) => ({ ...sale }));
  const last = corrected[corrected.length - 1];
  if (last) {
    last.amount = parsed.fields.amount ?? last.amount;
    if (parsed.fields.itemDescription) last.itemDescription = parsed.fields.itemDescription;
  }
  return corrected;
}

function isComplete(sale: PendingSale): boolean {
  return Boolean(sale.itemDescription && sale.amount);
}

function summaryReply(language: PreferredLanguage, sales: PendingSale[]): TurnDecision {
  const complete = sales.filter(isComplete);

  if (complete.length === 0) {
    return { nextState: 'awaiting_details', nextContext: { pendingSales: sales }, replyKey: 'ask_full' };
  }

  if (complete.length === 1) {
    const sale = complete[0]!;
    return {
      nextState: 'awaiting_confirmation',
      nextContext: { pendingSales: complete },
      replyKey: 'confirm_sale',
      replyParams: {
        item: sale.itemDescription ?? '',
        amount: sale.amount ?? '',
        customer: customerSuffix(language, sale),
      },
    };
  }

  const list = complete
    .map((sale) => `\u2022 ${sale.itemDescription} \u2014 \u20A6${sale.amount}`)
    .join('\n');
  return {
    nextState: 'awaiting_confirmation',
    nextContext: { pendingSales: complete },
    replyKey: 'confirm_multi',
    replyParams: { n: String(complete.length), list },
  };
}

function customerSuffix(language: PreferredLanguage, sale: PendingSale): string {
  return sale.customerName ? `, ${t(language, 'to_customer', { name: sale.customerName })}` : '';
}
