import { Prisma, PrismaClient } from '@prisma/client';

// One client per process, even if this module is evaluated again (serverless
// runtimes and dev servers can re-load function code), so connection pools
// aren't multiplied.
const globalForPrisma = globalThis as unknown as { doorstepPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.doorstepPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
globalForPrisma.doorstepPrisma = prisma;

/** Either the root client or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;
