'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate, Button, FlagStripe, Logo, api, useAuth, useToast, type VendorProfile } from '@doorstep/web-shared';
import { StoreForm } from '@/components/StoreForm';

export default function OnboardingPage() {
  return (
    <AuthGate role="VENDOR">
      <Onboarding />
    </AuthGate>
  );
}

function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { user, refreshProfile, logout } = useAuth();
  // Set once the store is submitted here, so the "already has a store" redirect doesn't race the one below.
  const submitted = useRef(false);

  useEffect(() => {
    if (user?.vendor && !submitted.current) router.replace('/');
  }, [user, router]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-8">
        <Logo className="w-32" />
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold">List your shop on DoorStep</h1>
        <p className="mt-2 text-muted">
          Restaurants, grocers, pharmacies, phone and clothing shops, hardware stores: any shop can sell on DoorStep. Tell us about your business. Our team reviews every store — you&apos;ll be notified here once you&apos;re approved and can
          start receiving orders.
        </p>
        <FlagStripe className="mb-8 mt-4" />
        <StoreForm
          submitLabel="Submit for approval"
          defaultPhone={user?.phone}
          onSubmit={async (values) => {
            const { logoUrl, coverUrl, ...rest } = values;
            submitted.current = true;
            await api<VendorProfile>('/vendor/onboarding', {
              body: { ...rest, logoUrl: logoUrl ?? undefined, coverUrl: coverUrl ?? undefined, ownerName: user?.name ?? undefined },
            });
            await refreshProfile();
            toast('Shop submitted! Add your products while we review it.');
            router.replace('/menu');
          }}
        />
      </main>
    </div>
  );
}
