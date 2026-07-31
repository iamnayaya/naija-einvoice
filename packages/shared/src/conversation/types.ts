import type { MissingField } from '../parser/types';

/**
 * A single sale being built up (or awaiting confirmation) inside a
 * conversation. Mirrors the parser's `SaleFields` but always carries a
 * concrete `quantity` so the stored JSON context stays well-typed.
 */
export interface PendingSale {
  itemDescription?: string;
  amount?: string;
  customerName?: string;
  quantity: number;
}

/** The JSON blob persisted on ConversationState.context. */
export interface ConversationContext {
  /** Sales awaiting confirmation, or the partial sale being clarified. */
  pendingSales: PendingSale[];
  /** Which field the bot last asked for (while awaiting_details). */
  askFor?: MissingField;
}

export function emptyContext(): ConversationContext {
  return { pendingSales: [] };
}
