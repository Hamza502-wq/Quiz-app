import { DAY_NAMES, type OpeningHour } from '@doorstep/web-shared';

/** Day of week (0 = Sunday) in Harare, where stores keep their hours. */
export function harareWeekday(date: Date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Harare', weekday: 'long' }).format(date);
  const index = DAY_NAMES.indexOf(name);
  return index === -1 ? date.getDay() : index;
}

export function hoursLabel(h: OpeningHour | undefined): string {
  if (!h) return 'Closed';
  if (h.opensAt === h.closesAt) return 'Open 24 hours';
  return `${h.opensAt} – ${h.closesAt}`;
}

export function todaysHours(hours: OpeningHour[]): string {
  return hoursLabel(hours.find((h) => h.dayOfWeek === harareWeekday()));
}
