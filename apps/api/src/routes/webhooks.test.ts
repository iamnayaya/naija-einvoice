import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

const app = createApp();

function paystackCharge(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      id: 4677002219,
      domain: 'test',
      status: 'success',
      reference: 'T173424527684156',
      amount: 500000,
      paid_at: '2025-02-11T10:42:20.000Z',
      channel: 'card',
      currency: 'NGN',
      source: { type: 'offline', source: 'virtual_terminal', entry_point: 'request_inline', identifier: 'VT_68SBY77G' },
      ...overrides,
    },
  };
}

function signed(secret: string, body: unknown) {
  const raw = JSON.stringify(body);
  return { raw, signature: createHmac('sha512', secret).update(raw).digest('hex') };
}

describe('GET /webhooks/whatsapp (verification handshake)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const res = await request(app).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'change-me-local-verify-token',
      'hub.challenge': '1234567890',
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1234567890');
  });

  it('rejects a bad verify token', async () => {
    const res = await request(app).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': '1234567890',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/pos/:provider (signature-verified)', () => {
  const SECRET = 'sk_test_vitest_secret';

  it('rejects a webhook with a bad signature (401)', async () => {
    const { raw } = signed(SECRET, paystackCharge());
    const res = await request(app)
      .post('/webhooks/pos/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'tampered')
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('rejects a webhook when no secret is configured (fails closed)', async () => {
    const { raw, signature } = signed('sk_test_some_other_key', paystackCharge());
    const res = await request(app)
      .post('/webhooks/pos/moniepoint')
      .set('Content-Type', 'application/json')
      .set('moniepoint-webhook-signature', signature)
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('acknowledges (200) a validly-signed but non-sale Paystack event', async () => {
    const body = { event: 'transfer.success', data: { reference: 'TRF_1' } };
    const { raw, signature } = signed(SECRET, body);
    const res = await request(app)
      .post('/webhooks/pos/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('verified_ignored');
  });

  it('acknowledges a validly-signed non-NGN terminal sale (200, skipped)', async () => {
    const body = paystackCharge({ currency: 'KES', amount: 10000 });
    const { raw, signature } = signed(SECRET, body);
    const res = await request(app)
      .post('/webhooks/pos/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('verified_ignored');
  });

  it('rejects an unknown provider (404)', async () => {
    const res = await request(app)
      .post('/webhooks/pos/interswitch')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(404);
  });

  it('rejects an empty body (400)', async () => {
    const res = await request(app)
      .post('/webhooks/pos/paystack')
      .set('Content-Type', 'application/json')
      .send('');
    expect(res.status).toBe(400);
  });
});
