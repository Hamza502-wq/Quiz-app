'use client';

import { FlaskConical, RotateCcw } from 'lucide-react';
import { tokenStore } from '@doorstep/web-shared';
import { resetDemoData } from '@/lib/demo/server';

/** Makes it obvious that the standalone site runs on sample data. */
export function DemoBanner() {
  const reset = () => {
    resetDemoData();
    tokenStore.clear();
    try {
      window.localStorage.removeItem('ds_web_cart');
      window.localStorage.removeItem('ds_web_deliver_to');
    } catch {
      // ignore
    }
    window.location.assign('/');
  };
  return (
    <div className="bg-ink px-4 py-2 text-center text-xs text-white sm:text-sm">
      <FlaskConical className="mr-1.5 inline h-4 w-4 text-brand" aria-hidden />
      <strong>Demo:</strong> sample stores and simulated deliveries — no real orders or payments. Sign in with any Zimbabwe mobile number; the code is{' '}
      <strong>123456</strong>.{' '}
      <button type="button" onClick={reset} className="ml-1 inline-flex items-center gap-1 font-semibold text-brand hover:underline">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset demo
      </button>
    </div>
  );
}
