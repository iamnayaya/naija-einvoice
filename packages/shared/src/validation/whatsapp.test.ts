import { describe, expect, it } from 'vitest';
import { whatsappWebhookSchema } from './whatsapp';

// `any` is intentional: the tests mutate the fixture to exercise the schema,
// and the inferred literal type is too strict for those mutations.
function validPayload(): any {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '2348000000000',
                phone_number_id: 'PHONE_NUMBER_ID',
              },
              contacts: [{ profile: { name: 'Amina Bello' }, wa_id: '2348012345678' }],
              messages: [
                {
                  from: '2348012345678',
                  id: 'wamid.abc123',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: '5000' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('whatsappWebhookSchema', () => {
  it('accepts a realistic Cloud API payload', () => {
    const result = whatsappWebhookSchema.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it('accepts non-text message types (validated but ignored downstream)', () => {
    const payload = validPayload();
    payload.entry[0].changes[0].value.messages = [
      { from: '2348012345678', id: 'wamid.1', timestamp: '1700000000', type: 'image' },
    ];
    const result = whatsappWebhookSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts status-only webhooks (delivery reports)', () => {
    const payload = validPayload();
    payload.entry[0].changes[0].value.messages = undefined;
    payload.entry[0].changes[0].value.statuses = [
      { id: 'wamid.1', status: 'delivered', timestamp: '1700000000' },
    ];
    const result = whatsappWebhookSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing the object marker', () => {
    const payload = validPayload();
    payload.object = 'not-whatsapp';
    const result = whatsappWebhookSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a message missing metadata', () => {
    const payload = validPayload();
    delete payload.entry[0].changes[0].value.metadata;
    const result = whatsappWebhookSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
