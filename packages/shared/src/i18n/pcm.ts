import type { MessageCatalog } from './types';

/** Nigerian Pidgin templates. */
export const pcm: MessageCatalog = {
  ask_amount: 'How much di customer pay?',
  ask_item: 'Wetin you sell?',
  ask_full: 'Wetin you sell? Send di item and amount, e.g. "I sell shoe 5k".',
  confirm_sale:
    'You sell: {item}, \u20A6{amount}{customer}. Reply YES to confirm or tell me wetin to change.',
  confirm_multi:
    'You sell {n} items:\n{list}\n\nReply YES to confirm or tell me wetin to change.',
  to_customer: 'to {name}',
  processing_started:
    'Tank you! Your invoice for {item} \u2014 \u20A6{amount} \u2014 dey process. I go send receipt soon.',
  already_submitted:
    'Dat invoice don submit, so I no fit change am. Correction note go come for Phase 2.',
  unparseable:
    'Sorry, I no hear you well. Abeg resend with di item and amount, e.g. "I sell shoe 5k".',
  ask_new_sale: 'Wetin you want sell? Send di item and amount, e.g. "I sell shoe 5k".',
  cancelled: 'Okay, I cancel am. Send di item and amount anytime you ready.',
  receipt_text: 'Receipt\n{item}\nAmount: \u20A6{amount}\nIRN: {irn}\nVerify: {url}',
  error: 'Sabi get wahala. Abeg try again.',
  free_limit_reached:
    'You don use all {limit} free invoice for dis month. Reply UPGRADE to continue invoicing without limit.',
  upgrade_link: 'Good choice! Tap here to upgrade: {url}',
  upgrade_unavailable: 'Upgrade no dey available now \u2014 abeg contact support.',
};
