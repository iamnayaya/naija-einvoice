import type { PosProvider } from '../../domain/enums';
import {
  isRecord,
  minorToNaira,
  PosWebhookError,
  type NormalizedPosSale,
  type PosWebhookAdapter,
} from '../types';

/**
 * Moniepoint POS webhook adapter (MOCKED — payload shape from Moniepoint's
 * public webhook guide; no live credentials yet).
 *
 * Envelope:
 *   headers: moniepoint-webhook-id / -timestamp / -signature
 *   body:    { eventId, eventType, createdAt, subject, data: {
 *              amount (kobo int), terminalSerial, transactionType,
 *              transactionReference, transactionStatus, responseCode, ... } }
 *
 * We only turn APPROVED purchase transactions into invoices:
 *   eventType === 'V1_POS_PURCHASE_TRANSACTION' && data.responseCode === '00'
 * Everything else (airtime, withdrawals, transfers, pending/failed) is an
 * "ignored" event we acknowledge without processing.
 */

const APPROVED_RESPONSE_CODE = '00';
const PURCHASE_EVENT = 'V1_POS_PURCHASE_TRANSACTION';

export const moniepointAdapter: PosWebhookAdapter = {
  normalize(rawPayload: unknown, provider: PosProvider): NormalizedPosSale {
    if (provider !== 'moniepoint') {
      throw new PosWebhookError(`moniepoint adapter called with provider: ${provider}`);
    }
    if (!isRecord(rawPayload)) throw new PosWebhookError('payload must be a JSON object');

    const eventType = typeof rawPayload.eventType === 'string' ? rawPayload.eventType : undefined;
    if (eventType !== PURCHASE_EVENT) {
      throw new PosWebhookError(`not a POS purchase event: ${eventType ?? 'unknown'}`, true);
    }
    if (!isRecord(rawPayload.data)) throw new PosWebhookError('purchase event is missing data');

    const data = rawPayload.data;
    if (data.responseCode !== APPROVED_RESPONSE_CODE) {
      throw new PosWebhookError(`POS sale not approved: ${String(data.responseCode)}`, true);
    }

    const transactionReference =
      typeof data.transactionReference === 'string' ? data.transactionReference : undefined;
    if (!transactionReference) throw new PosWebhookError('purchase missing transactionReference');

    const terminalSerial = typeof data.terminalSerial === 'string' ? data.terminalSerial : undefined;
    if (!terminalSerial) throw new PosWebhookError('purchase missing terminalSerial');

    const amount = typeof data.amount === 'number' || typeof data.amount === 'string' ? data.amount : undefined;
    if (amount === undefined) throw new PosWebhookError('purchase missing amount');

    const transactionTime = typeof data.transactionTime === 'string' ? data.transactionTime : new Date().toISOString();

    return {
      provider: 'moniepoint',
      providerEventId: typeof rawPayload.eventId === 'string' ? rawPayload.eventId : transactionReference,
      providerTransactionId: transactionReference,
      terminalRef: terminalSerial,
      amount: minorToNaira(amount),
      currency: 'NGN',
      occurredAt: transactionTime,
      raw: rawPayload,
    };
  },
};
