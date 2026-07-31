import { PREFERRED_LANGUAGES, type PreferredLanguage } from '../domain/enums';

/**
 * Lightweight, pure-heuristic language detection. We count occurrences of
 * per-language function words and pick the highest scoring language, falling
 * back to English on ties/no matches.
 *
 * This is deliberately NOT a model — it only needs to be good enough to pick
 * the right template for a clarifying question. The merchant's
 * `preferredLanguage` (stored on the DB row) is the authoritative fallback
 * used by the state machine; this detection is for messages that arrive in a
 * language other than the stored preference.
 *
 * All tokens are stored accent-normalized (e.g. Yoruba "àti" -> "ati").
 */
const TOKENS: Record<PreferredLanguage, string[]> = {
  en: ['i', 'sold', 'sell', 'bought', 'buy', 'the', 'and', 'for', 'to', 'just', 'paid', 'please', 'my', 'you', 'we'],
  pcm: ['dey', 'sabi', 'abeg', 'wahala', 'dem', 'wey', 'get', 'money', 'person', 'am', 'na', 'o', 'nau', 'sell'],
  ha: ['ina', 'siyar', 'sayar', 'da', 'ga', 'wani', 'wata', 'nawa', 'sai', 'kuma', 'aka', 'zai', 'ya', 'matar', 'dubu', 'na', 'mun'],
  yo: ['mo', 'ta', 'ra', 'ni', 'owo', 'si', 'ati', 'ki', 'fun', 'melo', 'elo', 'bata', 'awo', 'o'],
  ig: ['m', 'rere', 'ego', 'nke', 'zuta', 'zutara', 'gi', 'akpa', 'ere', 'iri', 'azu', 'na'],
};

/** Strip accents (NFD + remove combining marks) so matching is accent-insensitive. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function wordRegex(token: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');
}

export function detectLanguage(text: string): PreferredLanguage {
  const normalized = normalize(text.toLowerCase());
  let best: PreferredLanguage = 'en';
  let bestScore = 0;

  for (const lang of PREFERRED_LANGUAGES) {
    const score = TOKENS[lang].reduce((acc, token) => acc + (wordRegex(token).test(normalized) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }

  return best;
}

/** YES/NO equivalents across the supported languages. Neutral particles are
 *  allowed alongside them ("yes o", "no o", "haba"). */
const YES_WORDS = new Set(['yes', 'yea', 'yeah', 'yep', 'ok', 'okay', 'eh', 'ehen', 'ehhen', 'ehh', 'iya', 'iyah', 'i', 'toa', 'eeyo', 'gaskiya', 'kawai']);
const NO_WORDS = new Set(['no', 'haba', 'ko', 'isha', 'mba', 'aah', 'ah', 'nau', 'da', 'ba', 'kwarai']);
const NEUTRAL_WORDS = new Set(['o', 'na', 'a', 'ehn', 'hmm', 'haa', 'e', 'ma', 'sir']);

/**
 * Detect a short affirmative/negative reply ("yes", "eh", "haba", "yes o",
 * "no o", ...). Only messages that are essentially just the reply (<= 4
 * tokens) are classified; anything longer is a real message and returns null.
 */
export function detectReply(raw: string): 'yes' | 'no' | null {
  const normalized = normalize(raw.toLowerCase()).trim();
  if (!normalized) return null;

  const tokens = normalized.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 4) return null;

  let sawYes = false;
  let sawNo = false;

  for (const token of tokens) {
    const word = token.replace(/[^\p{L}\p{N}]/gu, '');
    if (!word) continue;
    if (YES_WORDS.has(word)) sawYes = true;
    else if (NO_WORDS.has(word)) sawNo = true;
    else if (!NEUTRAL_WORDS.has(word)) return null;
  }

  if (sawYes && !sawNo) return 'yes';
  if (sawNo && !sawYes) return 'no';
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
