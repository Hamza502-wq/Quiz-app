import { Prisma } from '@prisma/client';

export const TIMEZONE = 'Africa/Harare';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

interface LocalParts {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
}

/** Wall-clock parts of `date` in Africa/Harare. */
export function localParts(date: Date = new Date()): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export interface OpeningHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

/**
 * Whether a vendor is open at `date` (Harare time). Handles windows that run past
 * midnight (closesAt earlier than opensAt) by checking the previous day's window.
 * opensAt === closesAt means open 24 hours.
 */
export function isOpenAt(hours: OpeningHour[], date: Date = new Date()): boolean {
  const { weekday, minutes } = localParts(date);
  const today = hours.find((h) => h.dayOfWeek === weekday);
  if (today) {
    const open = hhmmToMinutes(today.opensAt);
    const close = hhmmToMinutes(today.closesAt);
    if (open === close) return true;
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  const yesterday = hours.find((h) => h.dayOfWeek === (weekday + 6) % 7);
  if (yesterday) {
    const open = hhmmToMinutes(yesterday.opensAt);
    const close = hhmmToMinutes(yesterday.closesAt);
    if (close < open && minutes < close) return true;
  }
  return false;
}

/** "2026-09-27" in Harare time. */
export function dayKey(date: Date = new Date()): string {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** ISO-8601 week key, e.g. "2026-W39", in Harare time. */
export function isoWeekKey(date: Date = new Date()): string {
  const p = localParts(date);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Harare offset is a fixed UTC+2 (no daylight saving). */
const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;

/** UTC instant of local midnight (Harare) for the day containing `date`. */
export function startOfLocalDay(date: Date = new Date()): Date {
  const p = localParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - HARARE_OFFSET_MS);
}

/** UTC instant of local Monday 00:00 (Harare) for the ISO week containing `date`. */
export function startOfLocalWeek(date: Date = new Date()): Date {
  const p = localParts(date);
  const mondayOffset = (p.weekday + 6) % 7;
  return new Date(Date.UTC(p.year, p.month - 1, p.day - mondayOffset) - HARARE_OFFSET_MS);
}

/**
 * SQL fragment for a JS Date compared against Prisma DateTime columns
 * (timestamp without time zone, stored in UTC) — independent of the database
 * session time zone.
 */
export function sqlUtc(date: Date) {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}
