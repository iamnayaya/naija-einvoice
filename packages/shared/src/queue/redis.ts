/**
 * Build the IORedis connection config BullMQ requires.
 * `maxRetriesPerRequest: null` is mandatory for BullMQ so the queue's own
 * retry/backoff logic (not the Redis client's) governs job retries.
 * (Returned structurally so `shared` doesn't need ioredis as a dependency.)
 */
export function createRedisConnection(url: string): { url: string; maxRetriesPerRequest: null } {
  return {
    url,
    maxRetriesPerRequest: null,
  };
}
