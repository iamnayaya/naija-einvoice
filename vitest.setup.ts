import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Make the root .env (DATABASE_URL, REDIS_URL, MOCK_NRS_*) available to every
// test, mirroring how the apps load it themselves.
loadEnv({ path: resolve(import.meta.dirname, '.env') });
