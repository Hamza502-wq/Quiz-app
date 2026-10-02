import '../../src/netlify-env';
import { runScheduledJobs } from '../../src/jobs/scheduler';
import { drainBackgroundTasks } from '../../src/lib/background';

/** Rider dispatch, payment checks, unpaid-order expiry and weekly payouts, once a minute. */
export default async (): Promise<Response> => {
  await runScheduledJobs();
  await drainBackgroundTasks();
  return new Response(null, { status: 204 });
};

export const config = {
  schedule: '* * * * *',
};
