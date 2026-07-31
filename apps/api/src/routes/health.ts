import { Router } from 'express';
import { prisma } from '@naija/shared';
import { redis } from '../queue/connection';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let db = 'error';
  let redisStatus = 'error';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'ok';
  } catch {
    db = 'error';
  }
  try {
    const pong = await redis.ping();
    redisStatus = pong === 'PONG' ? 'ok' : 'error';
  } catch {
    redisStatus = 'error';
  }
  const healthy = db === 'ok' && redisStatus === 'ok';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'naija-api',
    checks: { database: db, redis: redisStatus },
  });
});
