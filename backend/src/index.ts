import http from 'node:http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { initSocket } from './realtime/socket';
import { startJobs, stopJobs } from './jobs/scheduler';

async function main(): Promise<void> {
  await prisma.$connect();
  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);
  if (env.ENABLE_JOBS) startJobs();

  server.listen(env.PORT, () => {
    logger.info(`🚀 DoorStep API listening on :${env.PORT} — docs at ${env.PUBLIC_BASE_URL}/api/docs`);
    if (env.PAYMENTS_MOCK) logger.warn('PAYMENTS_MOCK is enabled — online payments are simulated');
    if (env.OTP_DEV_ECHO) logger.warn('OTP_DEV_ECHO is enabled — OTP codes are returned in API responses');
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    io.close();
    server.close(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
