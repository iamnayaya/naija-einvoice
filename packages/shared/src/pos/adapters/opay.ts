import type { PosProvider } from '../../domain/enums';
import {
  isRecord,
  nairaToNaira,
  PosWebhookError,
  type NormalizedPosSale,
  type PosWebhookAdapter,
} from '../types';

/**
 * OPay POS webhook adapter (MOCKED — payload shape from OPay's public docs;
 * no live credentials yet).
 *
 * Envelope (per https://documentation.opayweb.com/doc/offline/pos-api.html):
 *   headers: X-Opay-Tranid, merchantId
 *   body:    { clientAuthKey, version, bodyFormat, timestamp, sign, data: {
 *              outOrderNo, orderNo, status, currency, amount (NAIRA string),
 *              payType: "POS", sn, senderName, transactionTime, ... } }
 *
 * OPay reports amounts already in NAIRA (e.g. "100.00"), unlike Paystack/
 * Moniepoint which use kobo. We only process SUCCESS, POS payType events.
 */

const SUCCESS = 'SUCCESS';

export const opayAdapter: PosWebhookAdapter = {
  normalize(rawPayload: unknown, provider: PosProvider): NormalizedPosSale {
    if (provider !== 'opay') {
      throw new PosWebhookError(`opay adapter called with provider: ${provider}`);
    }
    if (!isRecord(rawPayload)) throw new PosWebhookError('payload must be a JSON object');
    if (!isRecord(rawPayload.data)) throw new PosWebhookError('payload is missing data');

    const data = rawPayload.data;
    if (data.status !== SUCCESS) {
      throw new PosWebhookError(`not a successful payment: ${String(data.status)}`, true);
    }
    if (data.payType !== 'POS') {
      throw new PosWebhookError(`not a POS payment: ${String(data.payType)}`, true);
    }

    const outOrderNo = typeof data.outOrderNo === 'string' ? data.outOrderNo : undefined;
    if (!outOrderNo) throw new PosWebhookError('payment missing outOrderNo');

    const sn = typeof data.sn === 'string' ? data.sn : undefined;
    if (!sn) throw new PosWebhookError('payment missing sn (terminal serial)');

    const amount = typeof data.amount === 'string' || typeof data.amount === 'number' ? data.amount : undefined;
    if (amount === undefined) throw new PosWebhookError('payment missing amount');

    const transactionTime =
      typeof data.transactionTime === 'string' ? data.transactionTime : new Date().toISOString();
    const ts = Number(transactionTime);
    const occurredAt = Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();

    return {
      provider: 'opay',
      providerEventId: typeof data.orderNo === 'string' ? data.orderNo : outOrderNo,
      providerTransactionId: outOrderNo,
      terminalRef: sn,
      amount: nairaToNaira(amount),
      currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : 'NGN',
      occurredAt,
      customerRef: typeof data.senderName === 'string' ? data.senderName : undefined,
      raw: rawPayload,
    };
  },
};
