import type { MessageCatalog } from './types';

/** English templates. {param} placeholders are interpolated by `t()`. */
export const en: MessageCatalog = {
  ask_amount: 'How much did the customer pay?',
  ask_item: 'What did you sell?',
  ask_full: 'What did you sell? Send the item and amount, e.g. "sold shoes 5k".',
  confirm_sale:
    'You sold: {item}, \u20A6{amount}{customer}. Reply YES to confirm or tell me what to fix.',
  confirm_multi:
    'You sold {n} items:\n{list}\n\nReply YES to confirm or tell me what to fix.',
  to_customer: 'to {name}',
  processing_started:
    "Thanks! Your invoice for {item} \u2014 \u20A6{amount} \u2014 is being processed. I'll send the receipt shortly.",
  already_submitted:
    'That invoice is already submitted, so I can\u2019t change it now. Credit-note corrections are coming in Phase 2.',
  unparseable:
    'Sorry, I didn\u2019t get that. Please resend with the item and amount, e.g. "sold shoes 5k".',
  ask_new_sale: 'What would you like to sell? Send the item and amount, e.g. "sold shoes 5k".',
  cancelled: 'Okay, cancelled. Send the item and amount whenever you\u2019re ready.',
  receipt_text: 'Receipt\n{item}\nAmount: \u20A6{amount}\nIRN: {irn}\nVerify: {url}',
  error: 'Something went wrong. Please try again.',
  free_limit_reached:
    'You have used all {limit} free invoices for this month. Reply UPGRADE to keep invoicing without limits.',
  upgrade_link: 'Great choice! Tap here to upgrade: {url}',
  upgrade_unavailable: 'Upgrade is not available right now \u2014 please contact support.',
};
