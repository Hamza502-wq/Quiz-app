import { formatMoney, type Currency } from '@doorstep/web-shared';
import type { Address } from './types';

/** Shows a US-dollar-cents amount in the order's currency (ZiG uses the order's exchange rate). */
export function formatIn(usdCents: number, currency: Currency, exchangeRate: number): string {
  return currency === 'USD' ? formatMoney(usdCents, 'USD') : formatMoney(Math.round(usdCents * exchangeRate), 'ZWG');
}

/** Loose Zimbabwe mobile number check before sending to the API (which validates properly). */
export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 13;
}

export function addressSummary(a: Pick<Address, 'street' | 'suburb' | 'city'>): string {
  return [a.street, a.suburb, a.city].filter((s): s is string => Boolean(s && s.trim())).join(', ');
}

export function etaLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function distanceLabel(km: number | null | undefined): string {
  if (km === null || km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
