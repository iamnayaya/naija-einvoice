import type { PreferredLanguage } from '../domain/enums';
import { en } from './en';
import { pcm } from './pcm';
import { ha } from './ha';
import { yo } from './yo';
import { ig } from './ig';
import type { MessageCatalog, MessageKey } from './types';

export type { MessageKey };

/**
 * Bot-facing message templates, one catalog per supported language.
 *
 * Adding a new language = create one catalog file (matching the keys in
 * types.ts) and register it in the map below. No conversation logic changes.
 */
export const CATALOGS: Record<PreferredLanguage, MessageCatalog> = {
  en,
  pcm,
  ha,
  yo,
  ig,
};

export function getMessages(language: PreferredLanguage): MessageCatalog {
  return CATALOGS[language] ?? en;
}

/** Render a template: t('ha', 'confirm_sale', { item, amount, customer }). */
export function t(
  language: PreferredLanguage,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = getMessages(language)[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}
