import { tier1Parse } from './tier1';
import { tier2Parse, type Tier2Llm } from './tier2';
import type { MissingField, ParseResult, ParseStatus } from './types';

export type { Tier2Llm };

/**
 * Message parser entry point — see packages/shared/src/parser for the full
 * Tier 1 / Tier 2 design.
 *
 *   parseMessage(raw)                 -> Tier 1 only (deterministic, offline)
 *   parseMessage(raw, { llm })        -> escalates to the LLM when Tier 1 is
 *                                        not confident or fields are missing
 *
 * Every Tier 2 escalation is logged (default: structured JSON to stdout) so
 * the message patterns Tier 1 fails on can be mined and taught later.
 */

export const LOW_CONFIDENCE = 0.7;

export interface Tier2FallbackInfo {
  raw: string;
  tier1Status: ParseStatus;
  missingFields: MissingField[];
  language: string;
}

export type Tier2FallbackLogger = (info: Tier2FallbackInfo) => void;

export interface ParseOptions {
  /** LLM used only when Tier 1 is insufficient. Omit to stay offline. */
  llm?: Tier2Llm;
  /** Test/observability hook; defaults to structured JSON on stdout. */
  logFallback?: Tier2FallbackLogger;
}

const defaultFallbackLogger: Tier2FallbackLogger = (info) => {
  console.log(`[parser:tier2-fallback] ${JSON.stringify(info)}`);
};

export async function parseMessage(raw: string, options?: ParseOptions): Promise<ParseResult> {
  const tier1 = tier1Parse(raw);

  const needsLlm =
    tier1.status === 'clarify' ||
    tier1.status === 'unparseable' ||
    (tier1.status === 'parsed' && tier1.confidence < LOW_CONFIDENCE);

  if (!needsLlm || !options?.llm) {
    return { ...toParseResultFields(tier1), tier: 'tier1', raw };
  }

  const logger = options.logFallback ?? defaultFallbackLogger;
  logger({
    raw,
    tier1Status: tier1.status,
    missingFields: tier1.missingFields,
    language: tier1.language,
  });

  const tier2 = await tier2Parse(raw, options.llm);
  return { ...tier2, tier: 'tier2', raw };
}

function toParseResultFields(tier1: ReturnType<typeof tier1Parse>): Omit<ParseResult, 'tier' | 'raw'> {
  return {
    status: tier1.status,
    language: tier1.language,
    fields: tier1.fields,
    sales: tier1.sales,
    missingFields: tier1.missingFields,
    askFor: tier1.askFor,
    confidence: tier1.confidence,
  };
}
