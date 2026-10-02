/**
 * Answer for every API request while the deployment has no DATABASE_URL, so
 * the apps show what is wrong instead of a generic gateway error. Safe to
 * import before the app's configuration is loaded.
 */
export function notConfiguredResponse(): Response {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is not set: add it in the site settings (Netlify: Site configuration → Environment variables) and redeploy.');
  return Response.json(
    {
      error: {
        code: 'NOT_CONFIGURED',
        message: 'DoorStep is not connected to its database yet. The site owner needs to add DATABASE_URL in Netlify and redeploy.',
      },
    },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
