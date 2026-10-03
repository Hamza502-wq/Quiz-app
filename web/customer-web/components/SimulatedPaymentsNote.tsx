'use client';

import { FlaskConical } from 'lucide-react';
import { useMeta } from '@/lib/meta';

/** Tells customers when online payments are simulated (no money is taken). */
export function SimulatedPaymentsNote() {
  const meta = useMeta();
  if (!meta?.paymentsSimulated) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warning-light px-3 py-2 text-xs text-ink-soft">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <span>
        <strong>Test mode:</strong> EcoCash, OneMoney and card payments are simulated while DoorStep sets up its payment provider. No money is
        taken.
      </span>
    </p>
  );
}
