import type { MessageCatalog } from './types';

/** Igbo templates. */
export const ig: MessageCatalog = {
  ask_amount: 'Ego ole alahịa kwụrụ?',
  ask_item: 'Gịnị ka rere?',
  ask_full: 'Gịnị ka rere? Ziga ihe na ego, dịka: "m rere akpa 8k".',
  confirm_sale:
    'I rere: {item}, \u20A6{amount}{customer}. Zaa YES iji kwado ma ọ bụ gwa m ihe ịchọrọ idozi.',
  confirm_multi:
    'I rere ihe {n}:\n{list}\n\nZaa YES iji kwado ma ọ bụ gwa m ihe ịchọrọ idozi.',
  to_customer: 'nye {name}',
  processing_started:
    'Daalụ! A na-ahazi akwụkwọ ịnye {item} \u2014 \u20A6{amount}. M ga-eziga nchekwa n\'oge na-adịghị anya.',
  already_submitted:
    'Ezipụla akwụkwọ ahụ, ya mere enweghị m ike ịgbanwe ya. Kredit nọọtị ga-abịa na Phase 2.',
  unparseable:
    'Biko, aghọtaghị m. Ziga ihe na ego, dịka: "m rere akpa 8k".',
  ask_new_sale: 'Gịnị ịchọrọ ire? Ziga ihe na ego, dịka: "m rere akpa 8k".',
  cancelled: 'Ọ dị mma, akagbuola m ya. Ziga ihe na ego mgbe ọ bụla ị dịla njikere.',
  receipt_text: 'Nchekwa\n{item}\nEgo: \u20A6{amount}\nIRN: {irn}\nNyochaa: {url}',
  error: 'Ihe mere. Biko gbalịa ọzọ.',
};
