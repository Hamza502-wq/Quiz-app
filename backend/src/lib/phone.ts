import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalises a phone number to E.164. Local Zimbabwean formats such as
 * "0771234567" or "263771234567" are accepted. Returns null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.replace(/[\s()-]/g, '');
  const candidate = /^263\d{9}$/.test(trimmed) ? `+${trimmed}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, 'ZW');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** "+263771234567" → "0771234567" — the format EcoCash/OneMoney expect. */
export function toLocalZwMsisdn(e164: string): string {
  return e164.startsWith('+263') ? `0${e164.slice(4)}` : e164.replace(/^\+/, '');
}

/** Masks all but the last 3 digits, for logs and third-party display. */
export function maskPhone(e164: string): string {
  return e164.length <= 4 ? '***' : `${e164.slice(0, 4)}****${e164.slice(-3)}`;
}
