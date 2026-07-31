import IORedis from 'ioredis';
import { env } from '../config';

/**
 * Shared Redis client (used for health pings). BullMQ creates its own
 * connection per Queue/Worker from the same options object below.
 */
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

export const redisConnection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
