import { Check } from 'lucide-react';
import { cn, formatTime, type OrderStatus } from '@doorstep/web-shared';
import type { CustomerOrder } from '@/lib/types';

const STEPS: Array<{ status: OrderStatus; label: string; parcelLabel?: string; time: keyof CustomerOrder['timestamps'] }> = [
  { status: 'PLACED', label: 'Order placed', parcelLabel: 'Request placed', time: 'placedAt' },
  { status: 'ACCEPTED', label: 'Preparing', time: 'acceptedAt' },
  { status: 'READY_FOR_PICKUP', label: 'Ready for pickup', time: 'readyAt' },
  { status: 'PICKED_UP', label: 'Picked up', time: 'pickedUpAt' },
  { status: 'ON_THE_WAY', label: 'On the way', time: 'onTheWayAt' },
  { status: 'DELIVERED', label: 'Delivered', time: 'deliveredAt' },
];

const ORDER: OrderStatus[] = STEPS.map((s) => s.status);

/** Horizontal (desktop) / vertical (mobile) progress through the delivery. */
export function OrderProgress({ order }: { order: CustomerOrder }) {
  // Parcels skip the store steps.
  const steps = order.type === 'PARCEL' ? STEPS.filter((s) => s.status !== 'ACCEPTED' && s.status !== 'READY_FOR_PICKUP') : STEPS;
  const currentIndex = ORDER.indexOf(order.status);

  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((step, i) => {
        const stepIndex = ORDER.indexOf(step.status);
        const done = currentIndex >= stepIndex;
        const current = order.status === step.status;
        const time = order.timestamps[step.time];
        return (
          <li key={step.status} className="flex items-center gap-3 sm:flex-1 sm:flex-col sm:gap-2 sm:text-center">
            <div className="flex items-center sm:w-full">
              <span className={cn('hidden h-0.5 flex-1 sm:block', i === 0 ? 'invisible' : done ? 'bg-brand' : 'bg-line')} />
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                  done ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted',
                  current && 'ring-4 ring-brand/20',
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn('hidden h-0.5 flex-1 sm:block', i === steps.length - 1 ? 'invisible' : currentIndex > stepIndex ? 'bg-brand' : 'bg-line')} />
            </div>
            <div>
              <p className={cn('text-sm font-semibold', !done && 'text-muted')}>{order.type === 'PARCEL' && step.parcelLabel ? step.parcelLabel : step.label}</p>
              {time ? <p className="text-xs text-muted">{formatTime(time)}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
