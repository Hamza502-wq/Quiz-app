'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LoadingBlock, PageHeader, useApi } from '@doorstep/web-shared';
import { useCart } from '@/lib/cart';
import { useDeliverTo } from '@/lib/location';
import { storeHref } from '@/lib/routes';
import type { VendorMenu } from '@/lib/types';
import { CartPanel } from '@/components/CartPanel';

export default function CartPage() {
  const cart = useCart();
  const { deliverTo, ready } = useDeliverTo();
  // Re-check the store's minimum order and opening status for the current cart.
  const store = useApi<VendorMenu>(cart.ready && ready && cart.vendorId ? `/vendors/${cart.vendorId}` : null, {
    lat: deliverTo?.lat,
    lng: deliverTo?.lng,
  });
  const vendor = store.data?.vendor;
  const notDeliverable = store.data?.delivery ? !store.data.delivery.deliverable : false;
  const blockedReason = !vendor
    ? undefined
    : notDeliverable
      ? 'This store does not deliver to your location.'
      : !vendor.isOpen
        ? "This store is closed right now, so it can't take your order."
        : undefined;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href={cart.vendorSlug ? storeHref(cart.vendorSlug) : '/'} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {cart.vendorSlug ? 'Back to the store' : 'Browse stores'}
      </Link>
      <PageHeader title="Your cart" />
      {!cart.ready ? <LoadingBlock /> : <CartPanel minOrderCents={vendor?.minOrderCents} blockedReason={blockedReason} />}
    </div>
  );
}
