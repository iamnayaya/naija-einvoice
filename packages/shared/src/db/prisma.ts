import { PrismaClient } from '@prisma/client';

/**
 * Shared PrismaClient singleton. Imported by @naija/api and @naija/worker.
 * Connects lazily on first query; DATABASE_URL comes from the app's env.
 */
export const prisma = new PrismaClient();
