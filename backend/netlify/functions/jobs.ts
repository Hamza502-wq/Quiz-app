import '../../src/netlify-env';

/** Rider dispatch, payment checks, unpaid-order expiry and weekly payouts, once a minute. */
export default async (): Promise<Response> => {
  // Nothing to do until the site is connected to its database.
  if (!process.env.DATABASE_URL) return new Response(null, { status: 204 });

  const [{ runScheduledJobs }, { drainBackgroundTasks }] = await Promise.all([
    import('../../src/jobs/scheduler'),
    import('../../src/lib/background'),
  ]);
  await runScheduledJobs();
  await drainBackgroundTasks();
  return new Response(null, { status: 204 });
};

export const config = {
  schedule: '* * * * *',
};
