import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Make the root .env (DATABASE_URL, REDIS_URL, MOCK_NRS_*) available to every
// test, mirroring how the apps load it themselves.
loadEnv({ path: resolve(import.meta.dirname, '.env') });

// Test-only Paystack secret so webhook signature-verification tests can build
// valid HMACs. dotenv never overrides an already-set value, so a real secret
// in the environment wins.
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? 'sk_test_vitest_secret';
