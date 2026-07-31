import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

/**
 * CLI test harness for the WhatsApp webhook — no WhatsApp credentials needed.
 *
 * Builds a realistic WhatsApp Business Cloud API payload and POSTs it to the
 * local webhook. Run the API first (`pnpm dev:api`), then:
 *
 *   pnpm simulate:whatsapp                                  # default message
 *   pnpm simulate:whatsapp --text "₦5000" --from 2348012345678
 *   pnpm simulate:whatsapp --name "Amina Bello" --sample    # print payload, no POST
 */

interface Args {
  to: string;
  from: string;
  name: string | undefined;
  text: string;
  sample: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    to: 'http://localhost:3000/webhooks/whatsapp',
    from: '2348012345678',
    name: undefined,
    text: '5000',
    sample: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--to':
        if (value) args.to = value;
        i++;
        break;
      case '--from':
        if (value) args.from = value;
        i++;
        break;
      case '--name':
        if (value) args.name = value;
        i++;
        break;
      case '--text':
        if (value) args.text = value;
        i++;
        break;
      case '--sample':
        args.sample = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function buildPayload(args: Args) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const contacts = [{ profile: { name: args.name ?? 'Amina Bello' }, wa_id: args.from }];
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
              contacts,
              messages: [
                {
                  from: args.from,
                  id: `wamid.${Date.now().toString(36)}`,
                  timestamp,
                  type: 'text',
                  text: { body: args.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildPayload(args);

  console.log('Payload:', JSON.stringify(payload, null, 2));

  if (args.sample) {
    console.log('(--sample: not POSTing)');
    return;
  }

  const res = await fetch(args.to, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`HTTP ${res.status}`);
  console.log(await res.text());
}

main().catch((err) => {
  console.error('simulate-whatsapp failed:', err);
  process.exitCode = 1;
});
