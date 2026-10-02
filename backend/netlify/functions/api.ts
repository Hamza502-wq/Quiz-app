import '../../src/netlify-env';
import { notConfiguredResponse } from '../../src/lib/not-configured';

interface NetlifyContext {
  ip?: string;
  site?: { url?: string };
}

/** The DoorStep REST API (Express) on Netlify Functions. */
export default async (request: Request, context: NetlifyContext): Promise<Response> => {
  // Without a database the app's configuration check would end the process (a bare 502).
  if (!process.env.DATABASE_URL) return notConfiguredResponse();

  // Loaded on first use so the check above runs before the app reads its configuration.
  const [{ env }, { handleRequest }] = await Promise.all([import('../../src/config/env'), import('../../src/serverless')]);

  // Links to uploaded images use the site's address when it wasn't configured explicitly.
  if (!process.env.PUBLIC_BASE_URL) {
    const origin = context.site?.url || new URL(request.url).origin;
    process.env.PUBLIC_BASE_URL = origin;
    env.PUBLIC_BASE_URL = origin;
    if (!env.corsOrigins.includes(origin)) env.corsOrigins.push(origin);
  }
  return handleRequest(request, context.ip);
};

export const config = {
  path: ['/api/*', '/uploads/*', '/health'],
};
