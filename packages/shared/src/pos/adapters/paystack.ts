import type { PosProvider } from '../../domain/enums';
import {
  isRecord,
  minorToNaira,
  PosWebhookError,
  type NormalizedPosSale,
  type PosWebhookAdapter,
} from '../types';

/**
 * Paystack Terminal / Virtual Terminal adapter.
 *
 * Paystack reports POS sales through the standard `charge.success` event —
 * the same envelope online card payments use — distinguished by the presence
 * of terminal identifiers in the payload:
 *
 *   - `data.pos_transaction_data`  (hardware terminal payloads)
 *   - `data.source.type === 'offline'` with `source.source === 'virtual_terminal'`
 *   - `data.channel === 'terminal'`
 *
 * Reference: https://paystack.com/docs/terminal/virtual-terminal/ ("Handle
 * notifications" section shows the exact charge.success payload). Amounts are
 * in kobo (smallest NGN unit); currency may be non-NGN (KES example in docs) —
 * we preserve the currency and let the service skip non-NGN sales.
 */

function terminalRefFrom(data: Record<string, unknown>): string | undefined {
  const source = data.source;
  if (isRecord(source)) {
    const identifier = source.identifier;
    if (typeof identifier === 'string' && identifier) return identifier;
  }
  const metadata = data.metadata;
  if (isRecord(metadata)) {
    const vt = metadata.virtual_terminal;
    if (isRecord(vt) && typeof vt.code === 'string' && vt.code) return vt.code;
    if (typeof metadata.terminal_id === 'string' && metadata.terminal_id) return metadata.terminal_id;
  }
  return undefined;
}

export const paystackAdapter: PosWebhookAdapter = {
  normalize(rawPayload: unknown, provider: PosProvider): NormalizedPosSale {
    if (provider !== 'paystack') {
      throw new PosWebhookError(`paystack adapter called with provider: ${provider}`);
    }
    if (!isRecord(rawPayload)) throw new PosWebhookError('payload must be a JSON object');

    if (rawPayload.event !== 'charge.success') {
      throw new PosWebhookError(`unhandled Paystack event: ${String(rawPayload.event)}`, true);
    }
    if (!isRecord(rawPayload.data)) throw new PosWebhookError('charge.success is missing data');

    const data = rawPayload.data;
    const isTerminalSale =
      data.pos_transaction_data !== undefined &&
      data.pos_transaction_data !== null &&
      data.pos_transaction_data !== '';
    const isVirtualTerminal = isRecord(data.source) && data.source.type === 'offline';
    const isTerminalChannel = data.channel === 'terminal';

    if (!isTerminalSale && !isVirtualTerminal && !isTerminalChannel) {
      throw new PosWebhookError('not a terminal/POS charge', true);
    }

    const reference = typeof data.reference === 'string' ? data.reference : undefined;
    if (!reference) throw new PosWebhookError('charge.success missing reference');

    const amount = typeof data.amount === 'number' || typeof data.amount === 'string' ? data.amount : undefined;
    if (amount === undefined) throw new PosWebhookError('charge.success missing amount');

    const terminalRef = terminalRefFrom(data);
    if (!terminalRef) throw new PosWebhookError('terminal sale missing terminal identifier');

    const paidAt = typeof data.paid_at === 'string' ? data.paid_at : new Date().toISOString();

    return {
      provider: 'paystack',
      providerEventId: String(data.id ?? reference),
      providerTransactionId: reference,
      terminalRef,
      amount: minorToNaira(amount),
      currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : 'NGN',
      occurredAt: paidAt,
      raw: rawPayload,
    };
  },
};
