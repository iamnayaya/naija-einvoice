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
  free_limit_reached:
    'I meela {limit} akwụkwọ n\'efu niile n\'ọnwa a. Zaa UPGRADE ka ị gaa n\'ihu na-ede akwụkwọ na-enweghị oke.',
  upgrade_link: 'Nhọrọ dị mma! Pịa ebe a iji bulite: {url}',
  upgrade_unavailable: 'Ịkwalite adịghị ugbu a \u2014 biko kpọtụrụ nkwado.',
};
