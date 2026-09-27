import pino from 'pino';
import { env } from '../config/env';

/** Pretty logs in development when pino-pretty (a dev dependency) is installed. */
function prettyTransport() {
  if (env.NODE_ENV !== 'development') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.body.code', 'req.body.password', 'req.body.refreshToken'],
    censor: '[redacted]',
  },
  transport: prettyTransport(),
});
