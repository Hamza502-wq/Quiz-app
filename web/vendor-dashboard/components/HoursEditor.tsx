'use client';

import { useState } from 'react';
import { Button, Card, DAY_NAMES, InlineError, Input, Toggle, api, useToast, type OpeningHour, type VendorProfile } from '@doorstep/web-shared';

interface DayState {
  open: boolean;
  opensAt: string;
  closesAt: string;
}

/** Weekly opening hours (Africa/Harare). A closing time earlier than opening means past midnight. */
export function HoursEditor({ hours, onSaved }: { hours: OpeningHour[]; onSaved: (v: VendorProfile) => void }) {
  const toast = useToast();
  const [days, setDays] = useState<DayState[]>(() =>
    DAY_NAMES.map((_, d) => {
      const h = hours.find((x) => x.dayOfWeek === d);
      return { open: Boolean(h), opensAt: h?.opensAt ?? '08:00', closesAt: h?.closesAt ?? '20:00' };
    }),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (d: number, patch: Partial<DayState>) => setDays((prev) => prev.map((x, i) => (i === d ? { ...x, ...patch } : x)));

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const vendor = await api<VendorProfile>('/vendor/me/hours', {
        method: 'PUT',
        body: {
          hours: days
            .map((x, dayOfWeek) => ({ dayOfWeek, opensAt: x.opensAt, closesAt: x.closesAt, open: x.open }))
            .filter((x) => x.open)
            .map(({ dayOfWeek, opensAt, closesAt }) => ({ dayOfWeek, opensAt, closesAt })),
        },
      });
      onSaved(vendor);
      toast('Opening hours saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save hours');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Opening hours</h2>
        <p className="text-sm text-muted">Harare time. Same opening and closing time = open 24 hours.</p>
      </div>
      <div className="divide-y divide-line">
        {days.map((day, d) => (
          <div key={DAY_NAMES[d]} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="w-28 text-sm font-semibold">{DAY_NAMES[d]}</span>
            <Toggle checked={day.open} onChange={(open) => update(d, { open })} label={day.open ? 'Open' : 'Closed'} />
            {day.open ? (
              <div className="flex items-center gap-2">
                <Input type="time" className="w-32" value={day.opensAt} onChange={(e) => update(d, { opensAt: e.target.value })} aria-label={`${DAY_NAMES[d]} opens`} />
                <span className="text-muted">to</span>
                <Input type="time" className="w-32" value={day.closesAt} onChange={(e) => update(d, { closesAt: e.target.value })} aria-label={`${DAY_NAMES[d]} closes`} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <InlineError message={error} />
      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={pending}>
          Save hours
        </Button>
      </div>
    </Card>
  );
}
