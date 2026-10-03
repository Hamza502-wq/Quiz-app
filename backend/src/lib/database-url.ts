/**
 * Many function instances can run at once, each with its own Prisma pool, so
 * each instance keeps a single connection unless the URL says otherwise.
 * Supabase's transaction pooler (port 6543) also needs Prisma's pgbouncer mode.
 */
export function serverlessDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
  if (url.port === '6543' && url.hostname.endsWith('.pooler.supabase.com') && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }
  return url.toString();
}
