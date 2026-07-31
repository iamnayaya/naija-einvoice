import type { PosProvider } from '../domain/enums';
import { paystackAdapter } from './adapters/paystack';
import { moniepointAdapter } from './adapters/moniepoint';
import { opayAdapter } from './adapters/opay';
import type { PosWebhookAdapter } from './types';

/**
 * One adapter per provider. The webhook endpoint picks the adapter by the
 * `:provider` path segment, so a new gateway is just another entry here.
 */
export const POS_ADAPTERS: Record<PosProvider, PosWebhookAdapter> = {
  paystack: paystackAdapter,
  moniepoint: moniepointAdapter,
  opay: opayAdapter,
};

export function isKnownPosProvider(value: string): value is PosProvider {
  return value in POS_ADAPTERS;
}
