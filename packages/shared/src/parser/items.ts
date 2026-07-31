import type { PreferredLanguage } from '../domain/enums';
import type { AmountSpan } from './types';

/**
 * Item-description extraction + customer-name detection.
 *
 * Both are conservative heuristics: we strip sales verbs and filler words in
 * the five supported languages, remove amount spans and the buyer phrase, and
 * treat whatever noun phrase remains as the item — kept in the merchant's own
 * words. If nothing survives, Tier 1 asks for clarification.
 *
 * The input text is expected to be accent-normalized (see `normalize` in
 * ./language) so that Igbo/Yoruba diacritics do not defeat verb matching.
 */

const LEADING_FILLERS: Record<PreferredLanguage, string[]> = {
  en: ['wat i mean', 'i mean', 'well', 'okay', 'ok', 'so', 'abi', 'please', 'just', 'see', 'then', 'wait', 'is', 'that', 'my', 'the', 'a', 'an', 'i', 'for', 'to'],
  pcm: ['na', 'e dey', 'abi', 'abeg', 'oya', 'make i', 'i dey', 'see', 'e be like', 'so'],
  ha: ['na', 'eh', 'to', 'wani', 'wata', 'a', 'guda'],
  yo: ['mo', 'ni', 'se', 'wa', 'a', 'kan'],
  ig: ['na', 'eh', 'o', 'a', 'm'],
};

const LEADING_VERBS: Record<PreferredLanguage, string[]> = {
  en: ['i just sold', 'i just bought', 'i dey sell', 'i am selling', 'i sold', 'i sell', 'i bought', 'i paid', 'just sold', 'just bought', 'am selling', 'sold', 'bought', 'selling', 'sell', 'paid', 'dey', 'i have sold', 'have sold'],
  pcm: ['na sell', 'i dey sell', 'i just sell', 'i sell', 'just sell', 'e sell', 'i don sell', 'i don dey sell', 'na me sell', 'sell', 'dey', 'don'],
  ha: ['na siyar da', 'ina siyar da', 'ina sayar da', 'mun sayar da', 'an sayar da', 'na sayar da', 'siyar da', 'sayar da', 'ina siyar', 'siyar', 'sayar', 'muna sayar da', 'na'],
  yo: ['mo ti ta', 'mo ta', 'mo ti ra', 'mo ra', 'ta', 'ra', 'mo'],
  ig: ['m rere', 'm na ere', 'm na', 'm zutara', 'm zuta', 'm ere', 'zutara', 'zuta', 'ere', 'rere', 'a rere'],
};

const TRAILING_FILLERS: Record<PreferredLanguage, string[]> = {
  en: ['to', 'for', 'and', 'o', 'na', 'please', 'sir', 'madam', 'abi', 'in', 'the', 'of', 'a', 'an', 'from', 'not', 'is', 'my', 'me', 'you', 'us', 'we'],
  pcm: ['o', 'na', 'dey', 'am', 'so', 'nau', 'wey', 'e be', 'i sell am', 'i sell', 'e don', 'for', 'to'],
  ha: ['da', 'ga', 'o', 'y', 'nan', 'wannan', 'kuma', 'a'],
  yo: ['fun', 'ni', 'o', 'si', 'ati', 'kan', 'mo'],
  ig: ['nke', 'na', 'o', 'm', 'gi', 'rere', 'ere'],
};

/**
 * Sales verbs that appear verbatim across languages in mixed messages
 * ("sold dress fun 2k" — English verb, Yoruba connector). Applied on top of
 * the per-language verb lists so code-switching still cleans up.
 */
const UNIVERSAL_VERBS = ['i just sold', 'i just bought', 'i dey sell', 'i sold', 'i bought', 'i paid', 'just sold', 'just bought', 'am selling', 'sold', 'bought', 'selling', 'sell', 'paid', 'dey'];

const QUANTITY_LEAD = 'x?\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|a|an';

export function cleanItem(raw: string, amounts: AmountSpan[], lang: PreferredLanguage): string | undefined {
  let text = stripCustomer(raw).text;

  for (const span of [...amounts].sort((a, b) => a.start - b.start)) {
    text = text.slice(0, span.start) + ' ' + text.slice(span.end);
  }
  text = text.replace(/[&,]|\.{3,}/g, ' ');

  text = stripLeading(text, [...LEADING_FILLERS[lang], ...LEADING_VERBS[lang], ...UNIVERSAL_VERBS]);
  text = text.replace(new RegExp(`^(${QUANTITY_LEAD})\\s+`, 'i'), ' ');
  text = stripTrailing(text, TRAILING_FILLERS[lang]);

  text = text.replace(/\s{2,}/g, ' ').trim();
  text = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!text) return undefined;

  // Gibberish guard: a real item word contains a vowel, or is a short code
  // that includes a digit ("PS5"). Pure consonant strings ("gjrhtkdl") are
  // treated as no item so the bot asks the merchant to resend.
  const hasVowel = /[aeiou]/i.test(text);
  const hasDigit = /\d/.test(text);
  if (!hasVowel && !(hasDigit && text.length >= 2)) return undefined;

  const words = text.split(/\s+/);
  return words.slice(0, 6).join(' ').slice(0, 60);
}

function stripLeading(text: string, phrases: string[]): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    out = out.replace(/^[^\p{L}\p{N}]+/u, '');
    for (const phrase of phrases) {
      if (new RegExp(`^${escapeRegExp(phrase)}\\b`, 'i').test(out)) {
        out = out.slice(phrase.length).replace(/^[^\p{L}\p{N}]+/u, '');
        changed = true;
        break;
      }
    }
  }
  return out.trim();
}

function stripTrailing(text: string, phrases: string[]): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    out = out.replace(/[^\p{L}\p{N}]+$/u, '');
    for (const phrase of phrases) {
      if (new RegExp(`\\b${escapeRegExp(phrase)}$`, 'i').test(out)) {
        out = out.slice(0, out.length - phrase.length).replace(/[^\p{L}\p{N}]+$/u, '');
        changed = true;
        break;
      }
    }
  }
  return out.trim();
}

/**
 * Buyer-name detection.
 *
 * "to/for/buyer/customer/fun/ga/zuwa" + a name. Strong markers (to, buyer,
 * customer, ga, zuwa) also accept lowercase names ("to amina"); weak markers
 * (for, fun) only accept capitalized ones so "for recharge card" is never
 * mistaken for a buyer. A trailing capitalized word is a last resort.
 * Returns undefined when no name is present.
 */
const TITLE = '(?:Mrs?|Ms|Dr|Alhaji|Alhaja|Hajiya|Malam|Mallam|Oga|Baba|Mama|Chief|Pastor|Engineer|Comrade)';
const STRONG_MARKERS = '(?:to|customer|buyer|ga|zuwa)';
const ANY_MARKERS = '(?:to|for|customer|buyer|fun|ga|zuwa)';

const PLACE_NAMES = new Set(['lagos', 'kano', 'abuja', 'ibadan', 'enugu', 'onitsha', 'kaduna', 'port', 'harcourt', 'owerri', 'jos', 'maiduguri', 'ilorin', 'aba', 'uyo', 'akure', 'benin', 'warri', 'sokoto', 'zaria', 'bauchi', 'yola']);
const NON_NAMES = new Set(['me', 'you', 'us', 'them', 'him', 'her', 'it', 'we', 'the', 'a', 'an', 'o', 'na', 'am', 'to', 'for', 'sir', 'madam', 'ma', 'boss', 'oga', 'please', 'yes', 'no', 'today', 'tomorrow', 'now', 'then']);

export function extractCustomerName(raw: string): string | undefined {
  return stripCustomer(raw).name;
}

/** Removes any detected buyer phrase from `raw` and returns the name too, so
 *  item extraction never inherits "to Amina". */
function stripCustomer(raw: string): { name?: string; text: string } {
  let text = raw;
  let name: string | undefined;

  const take = (start: number, end: number, value: string) => {
    if (name === undefined) name = value;
    text = text.slice(0, start) + ' ' + text.slice(end);
  };

  const capitalAfterAny = new RegExp(`${ANY_MARKERS}\\s+(?:${TITLE}\\s+)?([A-Z][a-zA-Z'’\\-]+)`, 'g');
  let m: RegExpExecArray | null;
  const capitalMatches: Array<{ index: number; end: number; name: string }> = [];
  while ((m = capitalAfterAny.exec(raw))) {
    const nameValue = m[1]!;
    if (!NON_NAMES.has(nameValue.toLowerCase())) {
      capitalMatches.push({ index: m.index, end: m.index + m[0].length, name: nameValue });
    }
  }
  for (const match of capitalMatches) take(match.index, match.end, match.name);

  const lowerAfterStrong = new RegExp(`${STRONG_MARKERS}\\s+(?:${TITLE}\\s+)?([a-z][a-z'’\\-]+)`, 'gi');
  lowerAfterStrong.lastIndex = 0;
  while ((m = lowerAfterStrong.exec(text))) {
    const candidate = m[1]!;
    if (!NON_NAMES.has(candidate.toLowerCase())) {
      take(m.index, m.index + m[0].length, titleCase(candidate));
      break;
    }
  }

  if (name === undefined) {
    const trailing = /\s([A-Z][a-z]+)\s*$/.exec(text);
    if (trailing) {
      const candidate = trailing[1]!;
      if (!PLACE_NAMES.has(candidate.toLowerCase()) && !NON_NAMES.has(candidate.toLowerCase())) {
        take(trailing.index, trailing.index + trailing[0].length, candidate);
      }
    }
  }

  return { name, text };
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
