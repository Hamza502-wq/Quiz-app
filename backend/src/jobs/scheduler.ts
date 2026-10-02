import { logger } from '../lib/logger';
import { runDispatchSweep } from '../modules/dispatch/dispatch.service';
import { expireUnpaidOrders } from '../modules/orders/order.service';
import { pollPendingPayments } from '../modules/payments/payment.service';
import { runWeeklyRiderPayouts } from '../modules/riders/rider.service';

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: 'dispatch-sweep', everyMs: 10_000, run: runDispatchSweep },
  { name: 'poll-payments', everyMs: 30_000, run: pollPendingPayments },
  { name: 'expire-unpaid-orders', everyMs: 60_000, run: expireUnpaidOrders },
  { name: 'weekly-rider-payouts', everyMs: 60 * 60_000, run: () => runWeeklyRiderPayouts(false) },
];

const timers: NodeJS.Timeout[] = [];

/**
 * In-process scheduler. Each job never overlaps with itself. When running more
 * than one API instance, enable jobs on a single instance only (ENABLE_JOBS).
 */
export function startJobs(): void {
  for (const job of JOBS) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        logger.error({ err, job: job.name }, 'Background job failed');
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(tick, job.everyMs));
  }
  logger.info(`Background jobs started: ${JOBS.map((j) => j.name).join(', ')}`);
}

/**
 * One pass of every job, for hosts that run them from a cron trigger instead of
 * in-process timers (e.g. a Netlify scheduled function every minute). Rider
 * payouts are checked once an hour; the job itself skips weeks already paid.
 */
export async function runScheduledJobs(now = new Date()): Promise<void> {
  for (const job of JOBS) {
    if (job.everyMs >= 60 * 60_000 && now.getUTCMinutes() !== 0) continue;
    try {
      await job.run();
    } catch (err) {
      logger.error({ err, job: job.name }, 'Background job failed');
    }
  }
}

export function stopJobs(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
