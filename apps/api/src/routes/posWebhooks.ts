import { raw, Router } from 'express';
import { isKnownPosProvider, prisma } from '@naija/shared';
import { env } from '../config';
import { ingestPosWebhook } from '../services/pos.service';
import { enqueueInvoiceSubmission } from '../queue/invoice';

/**
 * POST /webhooks/pos/:provider — provider webhooks for POS sales.
 *
 * Uses `express.raw()` so the HMAC signature is verified against the EXACT
 * bytes the provider sent (parsing first would break verification), and this
 * router must be mounted BEFORE the app-level `express.json()` (see app.ts).
 *
 * Security: signature verification is mandatory for every provider and fails
 * closed (no secret configured => 401). Paystack additionally supports an
 * opt-in IP allowlist. Non-sale events and unknown terminals are acknowledged
 * with 200 (providers retry everything non-2xx for hours), but loudly logged.
 */
export const posWebhooksRouter = Router();

posWebhooksRouter.post(
  '/webhooks/pos/:provider',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const provider = req.params.provider;
    if (!isKnownPosProvider(provider)) {
      res.status(404).json({ error: 'unknown provider' });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ error: 'empty body' });
      return;
    }

    const result = await ingestPosWebhook(
      {
        prisma,
        enqueue: (transactionId) => enqueueInvoiceSubmission(transactionId),
      },
      {
        provider,
        rawBody,
        headers: req.headers,
        ip: req.ip,
        secrets: {
          paystack: env.PAYSTACK_SECRET_KEY,
          moniepoint: env.POS_MONIEPOINT_SECRET,
          opay: env.POS_OPAY_SECRET,
        },
        requirePaystackIp: env.PAYSTACK_REQUIRE_KNOWN_IP,
      },
    );

    switch (result.outcome) {
      case 'rejected':
        res
          .status(result.reason === 'signature' ? 401 : 400)
          .json({ error: result.reason === 'signature' ? 'invalid signature' : 'malformed payload' });
        return;
      case 'created':
        res.status(200).json({ status: 'received', transactionId: result.transactionId });
        return;
      case 'verified_ignored':
      case 'no_terminal':
      case 'duplicate':
        res.status(200).json({ status: 'received', outcome: result.outcome });
        return;
    }
  },
);
