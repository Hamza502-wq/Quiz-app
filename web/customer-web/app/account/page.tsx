'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home, LogOut, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Spinner,
  api,
  useApi,
  useAuth,
  useToast,
  type Currency,
  type Profile,
} from '@doorstep/web-shared';
import { useDeliverTo } from '@/lib/location';
import { addressSummary } from '@/lib/format';
import type { Address } from '@/lib/types';
import { RequireCustomer } from '@/components/RequireCustomer';
import { AddressFormModal } from '@/components/AddressFormModal';

export default function AccountPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<LoadingBlock />}>
        <Account />
      </Suspense>
    </RequireCustomer>
  );
}

/** Only allow same-site relative redirects. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

function Account() {
  const { user, logout, refreshProfile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const next = safeNext(params.get('next'));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title={welcome ? 'Welcome to DoorStep!' : 'Your account'}
        subtitle={welcome ? 'Tell us your name so stores and riders know who the order is for.' : user?.phone}
        actions={
          welcome ? undefined : (
            <Button
              variant="secondary"
              icon={<LogOut className="h-4 w-4" />}
              onClick={async () => {
                await logout();
                router.replace('/');
              }}
            >
              Sign out
            </Button>
          )
        }
      />
      <div className="space-y-6">
        <ProfileForm
          user={user!}
          welcome={welcome}
          onSaved={async () => {
            await refreshProfile();
            if (welcome) router.replace(next ?? '/');
          }}
        />
        {welcome ? null : <Addresses />}
      </div>
    </div>
  );
}

function ProfileForm({ user, welcome, onSaved }: { user: Profile; welcome: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [currency, setCurrency] = useState<Currency>(user.preferredCurrency);
  const [channel, setChannel] = useState<'SMS' | 'WHATSAPP'>(user.notificationChannel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Enter your name (at least 2 characters).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          ...(welcome ? {} : { email: email.trim() ? email.trim() : null, preferredCurrency: currency, notificationChannel: channel }),
        },
      });
      toast(welcome ? 'All set — happy ordering!' : 'Profile saved');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        {!welcome ? <h2 className="text-lg font-bold">Profile</h2> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <Input value={name} maxLength={80} autoFocus={welcome} required onChange={(e) => setName(e.target.value)} />
          </Field>
          {!welcome ? (
            <Field label="Email (optional)">
              <Input type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          ) : null}
          {!welcome ? (
            <Field label="Show prices in" hint="Your default at checkout; you can switch per order.">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                <option value="USD">US dollars</option>
                <option value="ZWG">ZiG</option>
              </Select>
            </Field>
          ) : null}
          {!welcome ? (
            <Field label="Order updates by" hint="How we message you about your orders.">
              <Select value={channel} onChange={(e) => setChannel(e.target.value as 'SMS' | 'WHATSAPP')}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
              </Select>
            </Field>
          ) : null}
        </div>
        <InlineError message={error} />
        <Button type="submit" loading={saving}>
          {welcome ? 'Continue' : 'Save profile'}
        </Button>
      </form>
    </Card>
  );
}

function Addresses() {
  const toast = useToast();
  const { deliverTo, setDeliverTo } = useDeliverTo();
  const addresses = useApi<Address[]>('/customer/addresses');
  const [editing, setEditing] = useState<Address | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Keep the header's "Deliver to" in step with edits and deletions.
  useEffect(() => {
    if (!addresses.data || !deliverTo?.addressId) return;
    const match = addresses.data.find((a) => a.id === deliverTo.addressId);
    if (!match) setDeliverTo({ ...deliverTo, addressId: null });
    else if (match.lat !== deliverTo.lat || match.lng !== deliverTo.lng || match.label !== deliverTo.label) {
      setDeliverTo({ lat: match.lat, lng: match.lng, label: match.label, addressId: match.id });
    }
  }, [addresses.data, deliverTo, setDeliverTo]);

  const makeDefault = async (a: Address) => {
    setBusy(a.id);
    try {
      await api(`/customer/addresses/${a.id}`, {
        method: 'PATCH',
        body: { label: a.label, lat: a.lat, lng: a.lng, street: a.street ?? undefined, suburb: a.suburb ?? undefined, city: a.city, landmark: a.landmark, makeDefault: true },
      });
      await addresses.reload();
      toast(`${a.label} is now your default address`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update the address', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (a: Address) => {
    setBusy(a.id);
    try {
      await api(`/customer/addresses/${a.id}`, { method: 'DELETE' });
      await addresses.reload();
      toast('Address deleted');
      setDeleting(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the address', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Saved addresses</h2>
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add address
        </Button>
      </div>
      {addresses.error && !addresses.data ? (
        <ErrorState message={addresses.error.message} onRetry={() => void addresses.reload()} />
      ) : !addresses.data ? (
        <Spinner />
      ) : addresses.data.length === 0 ? (
        <p className="text-sm text-muted">No saved addresses yet. Add one to check out faster.</p>
      ) : (
        <ul className="divide-y divide-line">
          {addresses.data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-3">
              <Home className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.label}
                  {a.isDefault ? <span className="ml-2 rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">Default</span> : null}
                </p>
                <p className="text-sm text-ink-soft">{a.landmark}</p>
                {addressSummary(a) ? <p className="text-xs text-muted">{addressSummary(a)}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!a.isDefault ? (
                  <Button variant="ghost" size="sm" loading={busy === a.id} onClick={() => void makeDefault(a)} aria-label={`Make ${a.label} the default`} icon={<Star className="h-4 w-4" />} />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${a.label}`}
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(a);
                    setFormOpen(true);
                  }}
                />
                <Button variant="ghost" size="sm" aria-label={`Delete ${a.label}`} icon={<Trash2 className="h-4 w-4 text-alert" />} onClick={() => setDeleting(a)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressFormModal open={formOpen} address={editing} onClose={() => setFormOpen(false)} onSaved={() => void addresses.reload()} />
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy === deleting?.id} onClick={() => deleting && void remove(deleting)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          “{deleting?.label}” will be removed from your saved addresses. Past orders are not affected.
        </p>
      </Modal>
    </Card>
  );
}
