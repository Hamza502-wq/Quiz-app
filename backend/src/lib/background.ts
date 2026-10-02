import { logger } from './logger';

/**
 * Work that should not delay the HTTP response (notifications, dispatch).
 * On a normal server it simply runs; serverless hosts freeze the process once
 * the response is returned, so their handler awaits `drainBackgroundTasks()`.
 */
const pending = new Set<Promise<void>>();

export function runInBackground(task: Promise<unknown>, label: string): void {
  const tracked: Promise<void> = task
    .then(() => undefined)
    .catch((err: unknown) => logger.error({ err, task: label }, 'Background task failed'))
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Waits for background work, including work started by other background tasks. */
export async function drainBackgroundTasks(timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (pending.size > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      logger.warn({ pending: pending.size }, 'Background tasks still running after the time limit');
      return;
    }
    await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, remaining))]);
  }
}
