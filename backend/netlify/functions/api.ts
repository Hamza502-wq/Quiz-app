import '../../src/netlify-env';
import { env } from '../../src/config/env';
import { handleRequest } from '../../src/serverless';

interface NetlifyContext {
  ip?: string;
  site?: { url?: string };
}

/** The DoorStep REST API (Express) on Netlify Functions. */
export default async (request: Request, context: NetlifyContext): Promise<Response> => {
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
