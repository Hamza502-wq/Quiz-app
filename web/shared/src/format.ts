import type { Currency, OrderStatus } from './types';

export function formatMoney(cents: number, currency: Currency = 'USD'): string {
  const value = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'USD' ? `US$${value}` : `ZiG ${value}`;
}

/** "US$5.50 · ZiG 147.40" using an exchange rate (ZWG per USD). */
export function formatUsdZig(usdCents: number, zigPerUsd: number): string {
  return `${formatMoney(usdCents, 'USD')} · ${formatMoney(Math.round(usdCents * zigPerUsd), 'ZWG')}`;
}

/** Parses "12.50" into cents; returns null when invalid. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

const TZ = 'Africa/Harare';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
}

/** Local YYYY-MM-DD for date inputs. */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'New',
  ACCEPTED: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  PICKED_UP: 'Picked up',
  ON_THE_WAY: 'On the way',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  ECOCASH: 'EcoCash',
  ONEMONEY: 'OneMoney',
  CARD: 'Card',
  CASH: 'Cash on delivery',
  BANK: 'Bank transfer',
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function bpsToPercent(bps: number | null | undefined): string {
  return bps === null || bps === undefined ? '' : (bps / 100).toString();
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const csv = rows
    .map((r) => r.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
