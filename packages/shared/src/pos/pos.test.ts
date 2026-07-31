import { createHmac, type BinaryToTextEncoding } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { POS_ADAPTERS } from './index';
import { PosWebhookError } from './types';
import { verifyPosWebhookSignature } from './verification';

const PAYSTACK_SECRET = 'sk_test_abc123';
const MONIEPOINT_SECRET = 'whsec_moniepoint';
const OPAY_SECRET = 'whsec_opay';

function paystackCharge(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      id: 4677002219,
      domain: 'test',
      status: 'success',
      reference: 'T173424527684156',
      amount: 500000, // kobo -> ₦5,000.00
      paid_at: '2025-02-11T10:42:20.000Z',
      channel: 'card',
      currency: 'NGN',
      source: { type: 'offline', source: 'virtual_terminal', entry_point: 'request_inline', identifier: 'VT_68SBY77G' },
      metadata: { virtual_terminal: { code: 'VT_68SBY77G' } },
      ...overrides,
    },
  };
}

describe('paystack adapter (real path)', () => {
  it('normalizes a virtual-terminal charge.success into a sale', () => {
    const sale = POS_ADAPTERS.paystack.normalize(paystackCharge(), 'paystack');
    expect(sale).toMatchObject({
      provider: 'paystack',
      providerTransactionId: 'T173424527684156',
      terminalRef: 'VT_68SBY77G',
      amount: '5000.00',
      currency: 'NGN',
      occurredAt: '2025-02-11T10:42:20.000Z',
    });
    expect(sale.providerEventId).toBe('4677002219');
  });

  it('recognizes a hardware terminal sale via pos_transaction_data', () => {
    const sale = POS_ADAPTERS.paystack.normalize(
      paystackCharge({ pos_transaction_data: { terminal_id: 'TRM_1' }, source: undefined, metadata: { terminal_id: 'TRM_1' } }),
      'paystack',
    );
    expect(sale.terminalRef).toBe('TRM_1');
  });

  it('ignores (does not error) a non-terminal card charge', () => {
    const payload = paystackCharge({
      source: undefined,
      metadata: { referrer: 'https://paystack.shop/card' },
      channel: 'card',
    });
    expect(() => POS_ADAPTERS.paystack.normalize(payload, 'paystack')).toThrowError(
      expect.objectContaining({ ignored: true }),
    );
  });

  it('ignores non-charge events (subscription.create etc.)', () => {
    expect(() => POS_ADAPTERS.paystack.normalize({ event: 'subscription.create', data: {} }, 'paystack')).toThrowError(
      expect.objectContaining({ ignored: true }),
    );
  });

  it('preserves non-NGN currency for the service to skip', () => {
    const sale = POS_ADAPTERS.paystack.normalize(paystackCharge({ currency: 'KES', amount: 10000 }), 'paystack');
    expect(sale.currency).toBe('KES');
    expect(sale.amount).toBe('100.00');
  });

  it('rejects when called for the wrong provider', () => {
    expect(() => POS_ADAPTERS.paystack.normalize(paystackCharge(), 'opay')).toThrow(PosWebhookError);
  });
});

describe('moniepoint adapter (mocked provider)', () => {
  function moniepointPayload(overrides: Record<string, unknown> = {}) {
    return {
      eventId: '59630e16-34f0-40ee-b5c3-a3d66e71ca41',
      eventType: 'V1_POS_PURCHASE_TRANSACTION',
      createdAt: '2024-10-11T14:04:20.051330639',
      data: {
        amount: 25300, // kobo -> ₦253.00
        terminalSerial: 'P260678997653',
        transactionReference: 'PURCHASE|2MPT0073|183849658930533333120',
        responseCode: '00',
        transactionType: 'PURCHASE',
        transactionTime: '2024-10-10T09:32:57.916+0100',
        ...overrides,
      },
    };
  }

  it('normalizes an approved purchase', () => {
    const sale = POS_ADAPTERS.moniepoint.normalize(moniepointPayload(), 'moniepoint');
    expect(sale).toMatchObject({
      provider: 'moniepoint',
      providerTransactionId: 'PURCHASE|2MPT0073|183849658930533333120',
      terminalRef: 'P260678997653',
      amount: '253.00',
      currency: 'NGN',
    });
  });

  it('ignores non-purchase events (airtime, withdrawal, transfer)', () => {
    expect(() =>
      POS_ADAPTERS.moniepoint.normalize(
        { ...moniepointPayload(), eventType: 'V1_POS_AIRTIME_TRANSACTION' },
        'moniepoint',
      ),
    ).toThrowError(expect.objectContaining({ ignored: true }));
  });

  it('ignores approved-but-other transactions and pending sales', () => {
    expect(() =>
      POS_ADAPTERS.moniepoint.normalize(moniepointPayload({ responseCode: '09' }), 'moniepoint'),
    ).toThrowError(expect.objectContaining({ ignored: true }));
  });
});

describe('opay adapter (mocked provider)', () => {
  function opayPayload(overrides: Record<string, unknown> = {}) {
    return {
      clientAuthKey: 'b819c755d80b4c268f831f0cef69a22e',
      version: 'V1.0.1',
      bodyFormat: 'JSON',
      timestamp: '1692773950143',
      sign: 'deadbeef',
      data: {
        outOrderNo: '220617145660907314088',
        orderNo: '20220319702512368471543808',
        status: 'SUCCESS',
        currency: 'NGN',
        amount: '100.00',
        payType: 'POS',
        sn: 'SN-0001',
        senderName: 'Alice',
        transactionTime: '1692773950143',
        ...overrides,
      },
    };
  }

  it('normalizes a successful POS payment (naira string amount)', () => {
    const sale = POS_ADAPTERS.opay.normalize(opayPayload(), 'opay');
    expect(sale).toMatchObject({
      provider: 'opay',
      providerTransactionId: '220617145660907314088',
      terminalRef: 'SN-0001',
      amount: '100.00',
      currency: 'NGN',
      customerRef: 'Alice',
    });
    expect(sale.occurredAt).toBe('2023-08-23T06:59:10.143Z');
  });

  it('ignores non-POS payment types and non-success statuses', () => {
    expect(() => POS_ADAPTERS.opay.normalize(opayPayload({ payType: 'ONLINE' }), 'opay')).toThrowError(
      expect.objectContaining({ ignored: true }),
    );
    expect(() => POS_ADAPTERS.opay.normalize(opayPayload({ status: 'PENDING' }), 'opay')).toThrowError(
      expect.objectContaining({ ignored: true }),
    );
  });
});

describe('signature verification', () => {
  function sign(secret: string, body: Buffer, encoding: BinaryToTextEncoding = 'hex') {
    return createHmac('sha512', secret).update(body).digest(encoding);
  }

  describe('paystack (REAL)', () => {
    const body = Buffer.from(JSON.stringify(paystackCharge()));
    const signature = sign(PAYSTACK_SECRET, body);

    it('accepts a valid HMAC-SHA512 signature over the raw body', () => {
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: body,
          headers: { 'x-paystack-signature': signature },
          secret: PAYSTACK_SECRET,
        }),
      ).toBe(true);
    });

    it('rejects a tampered body', () => {
      const tampered = Buffer.from(JSON.stringify(paystackCharge({ amount: 99999999 })));
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: tampered,
          headers: { 'x-paystack-signature': signature },
          secret: PAYSTACK_SECRET,
        }),
      ).toBe(false);
    });

    it('rejects a signature made with the wrong secret', () => {
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: body,
          headers: { 'x-paystack-signature': sign('sk_test_wrong', body) },
          secret: PAYSTACK_SECRET,
        }),
      ).toBe(false);
    });

    it('fails closed when the secret or signature is missing', () => {
      expect(
        verifyPosWebhookSignature({ provider: 'paystack', rawBody: body, headers: {}, secret: PAYSTACK_SECRET }),
      ).toBe(false);
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: body,
          headers: { 'x-paystack-signature': signature },
          secret: undefined,
        }),
      ).toBe(false);
    });

    it('optionally enforces the Paystack IP allowlist', () => {
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: body,
          headers: { 'x-paystack-signature': signature },
          secret: PAYSTACK_SECRET,
          ip: '52.31.139.75',
          requireIp: true,
        }),
      ).toBe(true);
      expect(
        verifyPosWebhookSignature({
          provider: 'paystack',
          rawBody: body,
          headers: { 'x-paystack-signature': signature },
          secret: PAYSTACK_SECRET,
          ip: '203.0.113.9',
          requireIp: true,
        }),
      ).toBe(false);
    });
  });

  describe('moniepoint (mocked — schema from public docs)', () => {
    const body = Buffer.from('{"data":{}}');
    const id = 'b15ec58f-fa1f-4abb-8329-efaef8aa2bef';
    const timestamp = '1728651860073';
    const payload = `${id}__${timestamp}__${body.toString('utf8')}`;
    const signature = createHmac('sha256', MONIEPOINT_SECRET).update(payload).digest('base64');

    it('accepts a valid Base64 HMAC-SHA256 over id__timestamp__body', () => {
      expect(
        verifyPosWebhookSignature({
          provider: 'moniepoint',
          rawBody: body,
          headers: {
            'moniepoint-webhook-id': id,
            'moniepoint-webhook-timestamp': timestamp,
            'moniepoint-webhook-signature': signature,
          },
          secret: MONIEPOINT_SECRET,
        }),
      ).toBe(true);
    });

    it('rejects a tampered body', () => {
      expect(
        verifyPosWebhookSignature({
          provider: 'moniepoint',
          rawBody: Buffer.from('{"data":{"amount":999}}'),
          headers: {
            'moniepoint-webhook-id': id,
            'moniepoint-webhook-timestamp': timestamp,
            'moniepoint-webhook-signature': signature,
          },
          secret: MONIEPOINT_SECRET,
        }),
      ).toBe(false);
    });

    it('fails closed when any moniepoint header is absent', () => {
      expect(
        verifyPosWebhookSignature({ provider: 'moniepoint', rawBody: body, headers: {}, secret: MONIEPOINT_SECRET }),
      ).toBe(false);
    });
  });

  describe('opay (mocked — sign inside payload)', () => {
    const body = Buffer.from(JSON.stringify({ data: { status: 'SUCCESS' } }));
    const signature = createHmac('sha512', OPAY_SECRET).update(body).digest('base64');
    const signed = Buffer.from(JSON.stringify({ data: { status: 'SUCCESS' }, sign: signature }));

    it('accepts a valid HMAC-SHA512 sign over the raw body', () => {
      expect(
        verifyPosWebhookSignature({ provider: 'opay', rawBody: signed, secret: OPAY_SECRET }),
      ).toBe(true);
    });

    it('rejects a tampered body', () => {
      expect(
        verifyPosWebhookSignature({ provider: 'opay', rawBody: body, secret: OPAY_SECRET }),
      ).toBe(false);
    });
  });
});
