import crypto from 'node:crypto';
import type { Currency } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

/**
 * Minimal Paynow Zimbabwe client implementing the documented HTTP protocol:
 *  - initiate web (card / Paynow checkout) and mobile express (EcoCash, OneMoney)
 *    transactions,
 *  - verify SHA512 message hashes,
 *  - poll transaction status and parse result-URL status updates.
 *
 * Hash = UPPERCASE(SHA512(concatenation of all field values in message order,
 * excluding "hash", followed by the integration key)).
 */

export const PAYNOW_INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
export const PAYNOW_MOBILE_URL = 'https://www.paynow.co.zw/interface/remotetransaction';

export type Fields = Array<[string, string]>;

export interface PaynowCredentials {
  integrationId: string;
  integrationKey: string;
}

export function credentialsFor(currency: Currency): PaynowCredentials | null {
  const id = currency === 'USD' ? env.PAYNOW_USD_INTEGRATION_ID : env.PAYNOW_ZWG_INTEGRATION_ID;
  const key = currency === 'USD' ? env.PAYNOW_USD_INTEGRATION_KEY : env.PAYNOW_ZWG_INTEGRATION_KEY;
  return id && key ? { integrationId: id, integrationKey: key } : null;
}

export function generateHash(fields: Fields, integrationKey: string): string {
  const concatenated = fields
    .filter(([k]) => k.toLowerCase() !== 'hash')
    .map(([, v]) => v)
    .join('');
  return crypto.createHash('sha512').update(concatenated + integrationKey, 'utf8').digest('hex').toUpperCase();
}

export function verifyHash(fields: Fields, integrationKey: string): boolean {
  const received = fields.find(([k]) => k.toLowerCase() === 'hash')?.[1];
  if (!received) return false;
  const expected = generateHash(fields, integrationKey);
  const a = Buffer.from(received.toUpperCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Parses an x-www-form-urlencoded body preserving field order. */
export function parseFields(body: string): Fields {
  return [...new URLSearchParams(body.trim()).entries()];
}

export function fieldsToObject(fields: Fields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fields) out[k.toLowerCase()] = v;
  return out;
}

export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type MappedStatus = 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'PENDING';

/** Maps Paynow's textual status to our payment status. */
export function mapPaynowStatus(status: string): MappedStatus {
  switch (status.trim().toLowerCase()) {
    case 'paid':
    case 'awaiting delivery':
    case 'delivered':
      return 'PAID';
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PENDING'; // created, sent, disputed …
  }
}

async function postForm(url: string, fields: Fields): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Paynow responded with HTTP ${res.status}`);
  return res.text();
}

export interface InitiateParams {
  currency: Currency;
  reference: string;
  amountCents: number;
  additionalInfo: string;
  authEmail: string;
  resultUrl: string;
  returnUrl: string;
  /** Mobile express checkout; omit for a web (card) checkout. */
  mobile?: { method: 'ecocash' | 'onemoney'; phone: string };
}

export interface InitiateResult {
  ok: boolean;
  error?: string;
  pollUrl?: string;
  redirectUrl?: string;
  instructions?: string;
  paynowReference?: string;
}

export async function initiateTransaction(params: InitiateParams): Promise<InitiateResult> {
  const creds = credentialsFor(params.currency);
  if (!creds) return { ok: false, error: `Online payments in ${params.currency} are not configured` };

  const fields: Fields = [
    ['id', creds.integrationId],
    ['reference', params.reference],
    ['amount', formatAmount(params.amountCents)],
    ['additionalinfo', params.additionalInfo],
    ['returnurl', params.returnUrl],
    ['resulturl', params.resultUrl],
    ['authemail', params.authEmail],
  ];
  if (params.mobile) {
    fields.push(['phone', params.mobile.phone], ['method', params.mobile.method]);
  }
  fields.push(['status', 'Message']);
  fields.push(['hash', generateHash(fields, creds.integrationKey)]);

  let body: string;
  try {
    body = await postForm(params.mobile ? PAYNOW_MOBILE_URL : PAYNOW_INITIATE_URL, fields);
  } catch (err) {
    logger.error({ err, reference: params.reference }, 'Paynow initiate request failed');
    return { ok: false, error: 'Could not reach Paynow. Please try again.' };
  }

  const response = parseFields(body);
  const data = fieldsToObject(response);
  if ((data.status ?? '').toLowerCase() !== 'ok') {
    return { ok: false, error: data.error || 'Paynow rejected the payment request' };
  }
  if (!verifyHash(response, creds.integrationKey)) {
    logger.error({ reference: params.reference }, 'Paynow initiate response hash mismatch');
    return { ok: false, error: 'Payment provider response could not be verified' };
  }
  return {
    ok: true,
    pollUrl: data.pollurl,
    redirectUrl: data.browserurl,
    instructions: data.instructions,
    paynowReference: data.paynowreference,
  };
}

export interface StatusResult {
  reference: string;
  paynowReference?: string;
  amount?: string;
  status: string;
  mapped: MappedStatus;
}

/** Parses and authenticates a status message (poll response or result-URL POST). */
export function parseStatusMessage(body: string, currency: Currency): StatusResult {
  const creds = credentialsFor(currency);
  if (!creds) throw new Error(`Paynow ${currency} credentials are not configured`);
  const fields = parseFields(body);
  const data = fieldsToObject(fields);
  if ((data.status ?? '').toLowerCase() === 'error') {
    throw new Error(`Paynow error: ${data.error ?? 'unknown'}`);
  }
  if (!verifyHash(fields, creds.integrationKey)) throw new Error('Paynow status hash mismatch');
  return {
    reference: data.reference,
    paynowReference: data.paynowreference,
    amount: data.amount,
    status: data.status,
    mapped: mapPaynowStatus(data.status ?? ''),
  };
}

export async function pollTransaction(pollUrl: string, currency: Currency): Promise<StatusResult> {
  if (!/^https:\/\/([a-z0-9-]+\.)*paynow\.co\.zw\//i.test(pollUrl)) throw new Error('Refusing to poll a non-Paynow URL');
  const body = await postForm(pollUrl, []);
  return parseStatusMessage(body, currency);
}
