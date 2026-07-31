import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

const app = createApp();

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
