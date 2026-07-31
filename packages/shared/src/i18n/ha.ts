import type { MessageCatalog } from './types';

/** Hausa templates. */
export const ha: MessageCatalog = {
  ask_amount: 'Nawa abokin cinikin ya biya?',
  ask_item: 'Me kika siyar?',
  ask_full: 'Me kika siyar? Aiko abu da kudi, misali: "na siyar da takalmi 5k".',
  confirm_sale:
    'Ka siyar: {item}, \u20A6{amount}{customer}. Rubuta YES don tabbatarwa ko gaya mini abin gyara.',
  confirm_multi:
    'Ka siyar abubuwa {n}:\n{list}\n\nRubuta YES don tabbatarwa ko gaya mini abin gyara.',
  to_customer: 'ga {name}',
  processing_started:
    'Na gode! Ana sarrafa lissafin {item} \u2014 \u20A6{amount}. Zan aiko rasit nan ba da jimawa ba.',
  already_submitted:
    'An riga an aiko wannan lissafin, don haka ba zan iya canza shi ba. Wasi\u1EC7ar gyara za ta zo a Phase 2.',
  unparseable:
    'Yi ha\u1E6Furi, ban fahimta ba. Da fatan za ka sake aiko da abu da kudi, misali: "na siyar da takalmi 5k".',
  ask_new_sale: 'Me kake son siyarwa? Aiko abu da kudi, misali: "na siyar da takalmi 5k".',
  cancelled: 'To, na soke shi. Aiko abu da kudi duk lokacin da kake shirye.',
  receipt_text: 'Rasit\n{item}\nKudi: \u20A6{amount}\nIRN: {irn}\nDuba: {url}',
  error: 'An sami matsala. Da fatan za ka sake gwadawa.',
  free_limit_reached:
    'Ka yi amfani da duk {limit} lissafin kyauta na wannan wata. Rubuta UPGRADE don ci gaba da lissafin ba tare da iyaka ba.',
  upgrade_link: 'Zabi mai kyau! Danna nan don ha\u0257awa: {url}',
  upgrade_unavailable: 'Ha\u0257awa ba ta nan yanzu \u2014 da fatan za ka tuntu\u0253i tallafi.',
};
