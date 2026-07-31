/** Keys for every bot-facing string. Add a key here, then provide it in every
 *  language catalog below — the i18n test enforces that they stay in sync. */
export const MESSAGE_KEYS = [
  'ask_amount',
  'ask_item',
  'ask_full',
  'confirm_sale',
  'confirm_multi',
  'to_customer',
  'processing_started',
  'already_submitted',
  'unparseable',
  'ask_new_sale',
  'cancelled',
  'receipt_text',
  'error',
  // Phase 2 billing
  'free_limit_reached',
  'upgrade_link',
  'upgrade_unavailable',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export type MessageCatalog = Record<MessageKey, string>;
