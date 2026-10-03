import type { Currency } from '@prisma/client';

/** Converts USD cents to the target currency's minor units using `rate` (ZWG per USD). */
export function convertFromUsd(usdCents: number, currency: Currency, rate: number): number {
  return currency === 'USD' ? usdCents : Math.round(usdCents * rate);
}

/** Converts minor units of `currency` back to USD cents. */
export function convertToUsd(amountCents: number, currency: Currency, rate: number): number {
  return currency === 'USD' ? amountCents : Math.round(amountCents / rate);
}

export function formatMoney(cents: number, currency: Currency): string {
  const symbol = currency === 'USD' ? 'US$' : 'ZiG ';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/** Applies a basis-point rate (1500 = 15%) and rounds to the nearest cent. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}
