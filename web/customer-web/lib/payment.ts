import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import type { PaymentMethod } from '@doorstep/web-shared';

export const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint: string; icon: typeof Smartphone }> = [
  { value: 'ECOCASH', label: 'EcoCash', hint: 'Approve the prompt on your phone', icon: Smartphone },
  { value: 'ONEMONEY', label: 'OneMoney', hint: 'Approve the prompt on your phone', icon: Smartphone },
  { value: 'CARD', label: 'Card', hint: 'Visa or Mastercard via Paynow', icon: CreditCard },
  { value: 'CASH', label: 'Cash on delivery', hint: 'Pay the rider when your order arrives', icon: Banknote },
];

/** Online methods, for paying an order that is awaiting payment or tipping a rider. */
export const ONLINE_PAYMENT_OPTIONS = PAYMENT_OPTIONS.filter((o) => o.value !== 'CASH') as Array<
  (typeof PAYMENT_OPTIONS)[number] & { value: 'ECOCASH' | 'ONEMONEY' | 'CARD' }
>;
