import { raw, Router } from 'express';
import { prisma } from '@naija/shared';
import { env } from '../config';
import { ingestSubscriptionWebhook } from '../services/paystack.service';

/**
 * POST /webhooks/paystack/subscriptions — Paystack billing webhooks.
 *
 * Same security posture as the POS endpoints: `express.raw()` captures the
 * exact bytes and the HMAC-SHA512 signature is verified against the secret
 * BEFORE any parsing. Mounted before `express.json()` in app.ts.
 *
 * Non-subscription events are acknowledged with 200 (Paystack retries every
 * non-2xx). Unknown merchants are acked but loudly logged — a subscription can
 * only exist after the merchant clicked a payment link carrying their id, so
 * this indicates an external purchase we cannot attribute.
 */
export const subscriptionWebhooksRouter = Router();

subscriptionWebhooksRouter.post(
  '/webhooks/paystack/subscriptions',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }

    const result = await ingestSubscriptionWebhook(prisma, {
      rawBody,
      headers: req.headers,
      secret: env.PAYSTACK_SECRET_KEY,
      ip: req.ip,
      requireIp: env.PAYSTACK_REQUIRE_KNOWN_IP,
      planTier: 'starter',
    });

    switch (result.outcome) {
      case 'rejected':
        res
          .status(result.reason === 'signature' ? 401 : 400)
          .json({ error: result.reason === 'signature' ? 'invalid signature' : 'malformed payload' });
        return;
      case 'no_merchant':
        console.warn(`[paystack:subscription] ${JSON.stringify({ noMerchant: true, at: new Date().toISOString() })}`);
        res.status(200).json({ status: 'received', outcome: result.outcome });
        return;
      default:
        res.status(200).json({ status: 'received', outcome: result.outcome });
        return;
    }
  },
);
