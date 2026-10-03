import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

/**
 * Firebase Cloud Messaging via the HTTP v1 API using a service account
 * (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY). No-op when not configured.
 */

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isPushConfigured(): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const privateKey = env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const assertion = jwt.sign(
    {
      iss: env.FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' },
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM auth failed with HTTP ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export interface PushResult {
  delivered: number;
  /** Tokens FCM reported as no longer registered — safe to delete. */
  invalidTokens: string[];
}

export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<PushResult> {
  const result: PushResult = { delivered: 0, invalidTokens: [] };
  if (!isPushConfigured() || tokens.length === 0) return result;

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    logger.error({ err }, 'Could not obtain FCM access token');
    return result;
  }

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data,
              android: { priority: 'high', notification: { color: '#FF7A00' } },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          result.delivered++;
        } else if (res.status === 404 || res.status === 400) {
          const text = await res.text();
          if (text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) result.invalidTokens.push(token);
        }
      } catch (err) {
        logger.warn({ err }, 'FCM send error');
      }
    }),
  );
  return result;
}
