import { createRedisConnection } from '@naija/shared';
import { env } from '../config';

export const redisConnection = createRedisConnection(env.REDIS_URL);
