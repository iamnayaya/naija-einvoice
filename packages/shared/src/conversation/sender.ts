/**
 * WhatsApp outbound-messaging abstraction.
 *
 * The whole app talks to this interface — never to the Cloud API directly —
 * so swapping the real API in later is a one-line config change (construct a
 * different sender). `MockWhatsAppSender` logs payloads shaped exactly like
 * the WhatsApp Business Cloud API message-send requests, so a future
 * `RealWhatsAppSender` is a mechanical translation of the same JSON.
 */

export interface WhatsAppImagePayload {
  caption: string;
  mimeType: string;
  base64: string;
}

export interface WhatsAppSender {
  sendText(to: string, body: string): Promise<void>;
  sendImage(to: string, image: WhatsAppImagePayload): Promise<void>;
}

/** Logs Cloud-API-shaped payloads. Phase 0/1 harness — no real WhatsApp. */
export class MockWhatsAppSender implements WhatsAppSender {
  constructor(
    private readonly log: (payload: unknown) => void = (payload) =>
      console.log(`[whatsapp:send] ${JSON.stringify(payload)}`),
  ) {}

  async sendText(to: string, body: string): Promise<void> {
    this.log({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
      status: 'sent',
      via: 'mock',
    });
  }

  async sendImage(to: string, image: WhatsAppImagePayload): Promise<void> {
    // `_mockMedia` is not part of the Cloud API envelope — it carries the
    // QR image bytes so the local harness can assert on them. The real API
    // uploads media first, then references it via `image.link` / `image.id`.
    this.log({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { caption: image.caption },
      _mockMedia: {
        mimeType: image.mimeType,
        base64: image.base64,
        note: 'uploaded via /messages endpoint in the real API',
      },
      status: 'sent',
      via: 'mock',
    });
  }
}
