'use client';

import { PageHeader, api, useToast, type VendorProfile } from '@doorstep/web-shared';
import { StoreForm } from '@/components/StoreForm';
import { HoursEditor } from '@/components/HoursEditor';
import { useVendor } from '@/components/VendorContext';

export default function StorePage() {
  const { vendor, setVendor } = useVendor();
  const toast = useToast();

  return (
    <div className="space-y-6">
      <PageHeader title="Store profile" subtitle="Details, location, opening hours and payout account customers and riders rely on." />
      <HoursEditor hours={vendor.openingHours} onSaved={setVendor} />
      <StoreForm
        key={vendor.id}
        initial={vendor}
        submitLabel="Save changes"
        onSubmit={async (values) => {
          setVendor(await api<VendorProfile>('/vendor/me', { method: 'PATCH', body: values }));
          toast('Store profile saved');
        }}
      />
    </div>
  );
}
