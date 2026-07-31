import type { MessageCatalog } from './types';

/** Yoruba templates. */
export const yo: MessageCatalog = {
  ask_amount: 'Eló ni alabára sanwó?',
  ask_item: 'Kí lo tà?',
  ask_full: 'Kí lo tà? Fì ohun àti iye ránṣẹ́, fún àpẹẹrẹ: "mo ta bata 5k".',
  confirm_sale:
    'O ta: {item}, \u20A6{amount}{customer}. Dá YES lóhùn láti jẹ́wọ́ tàbí sọ ohun tí o fẹ́ ṣàtúnṣe.',
  confirm_multi:
    'O ta ohun {n}:\n{list}\n\nDá YES lóhùn láti jẹ́wọ́ tàbí sọ ohun tí o fẹ́ ṣàtúnṣe.',
  to_customer: 'fún {name}',
  processing_started:
    'Ẹ ṣé! Àwéjẹ́ fún {item} \u2014 \u20A6{amount} \u2014 ń lọ. Màá fi rìsítì ránṣẹ́ láìpẹ́.',
  already_submitted:
    'Àwéjẹ́ náà ti jẹ́ fífiṣẹ́, nítorí náà n kò lè yí i padà. Kírédítì nọ́tì yóò wá ní Phase 2.',
  unparseable:
    'Ẹ dárí, n kò lóye. Jọ̀wọ́ fì ohun àti iye ránṣẹ́, fún àpẹẹrẹ: "mo ta bata 5k".',
  ask_new_sale: 'Kí lo fẹ́ tà? Fì ohun àti iye ránṣẹ́, fún àpẹẹrẹ: "mo ta bata 5k".',
  cancelled: 'Ó dára, mo fagilé. Fì ohun àti iye ránṣẹ́ nígbàkigbà tí o bá ṣetán.',
  receipt_text: 'Rìsítì\n{item}\nIye: \u20A6{amount}\nIRN: {irn}\nṢàyẹ̀wò: {url}',
  error: 'Nǹkan kan ṣẹlẹ̀. Jọ̀wọ́ gbìyànjú lẹ́ẹ̀kansí.',
  free_limit_reached:
    'O ti lo gbogbo àwéjẹ́ {limit} ọ̀fẹ́ fún oṣù yìí. Dá UPGRADE lóhùn láti máa tẹ̀síwájú láìlópin.',
  upgrade_link: 'Àṣàyàn tó dára! Tẹ ibí láti ṣe upgrade: {url}',
  upgrade_unavailable: 'Upgrade kò sí níbẹ̀ báyìí \u2014 jọ̀wọ́ kàn sí ìtìlẹ́yìn.',
};
