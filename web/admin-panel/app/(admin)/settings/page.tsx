'use client';

import { useEffect, useState } from 'react';
import { Circle, Map as GoogleMap } from '@vis.gl/react-google-maps';
import { MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DAY_NAMES,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  MapPicker,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Toggle,
  api,
  centsToInput,
  config,
  formatMoney,
  mapsEnabled,
  parseMoneyToCents,
  useApi,
  useToast,
} from '@doorstep/web-shared';

type Kind = 'money' | 'percent' | 'number' | 'integer' | 'bool' | 'text' | 'day';
interface FieldDef {
  key: string;
  label: string;
  kind: Kind;
  hint?: string;
}

const GROUPS: Array<{ title: string; description: string; fields: FieldDef[] }> = [
  {
    title: 'Commission & customer fees',
    description: 'What customers pay and what DoorStep keeps. Zones can override delivery fees.',
    fields: [
      { key: 'commissionRateBps', label: 'Default vendor commission (%)', kind: 'percent', hint: 'Vendors can have their own override' },
      { key: 'deliveryFeeBaseCents', label: 'Delivery fee — base (US$)', kind: 'money' },
      { key: 'deliveryFeePerKmCents', label: 'Delivery fee — per km (US$)', kind: 'money' },
      { key: 'minDeliveryFeeCents', label: 'Minimum delivery fee (US$)', kind: 'money' },
      { key: 'maxDeliveryKm', label: 'Maximum delivery distance (km)', kind: 'number' },
      { key: 'maxTipCents', label: 'Maximum tip per order (US$)', kind: 'money' },
    ],
  },
  {
    title: 'Rider pay',
    description: 'Per-delivery pay = base + per-km × distance. Tips and bonuses are extra.',
    fields: [
      { key: 'riderBaseCents', label: 'Rider pay — base (US$)', kind: 'money' },
      { key: 'riderPerKmCents', label: 'Rider pay — per km (US$)', kind: 'money' },
      { key: 'riderAvgSpeedKmh', label: 'Average rider speed for ETAs (km/h)', kind: 'number' },
    ],
  },
  {
    title: 'Cash & payouts',
    description: 'Cash collected by riders is owed to DoorStep and deducted from their earnings.',
    fields: [
      { key: 'defaultCashLimitCents', label: 'Default rider cash limit (US$)', kind: 'money', hint: 'Riders owing more cannot take cash orders' },
      { key: 'minPayoutCents', label: 'Minimum payout (US$)', kind: 'money' },
      { key: 'payoutDayOfWeek', label: 'Weekly payout day', kind: 'day' },
      { key: 'allowOnDemandPayouts', label: 'Allow riders to request payouts any time', kind: 'bool' },
    ],
  },
  {
    title: 'Currency',
    description: 'Prices are set in USD; ZiG prices are derived from this rate at checkout.',
    fields: [{ key: 'zigPerUsd', label: 'ZiG per 1 USD', kind: 'number' }],
  },
  {
    title: 'Dispatch',
    description: 'Automatic assignment offers each order to the nearest available rider.',
    fields: [
      { key: 'autoDispatchEnabled', label: 'Automatic dispatch', kind: 'bool' },
      { key: 'dispatchRadiusKm', label: 'Search radius (km)', kind: 'number' },
      { key: 'dispatchOfferTimeoutSec', label: 'Offer timeout (seconds)', kind: 'integer' },
      { key: 'riderLocationStaleMinutes', label: 'Ignore riders with GPS older than (minutes)', kind: 'integer' },
      { key: 'pendingPaymentTimeoutMinutes', label: 'Cancel unpaid orders after (minutes)', kind: 'integer' },
      { key: 'supportPhone', label: 'Support phone number', kind: 'text' },
    ],
  },
];

type Settings = Record<string, unknown> & { parcelSurchargeCents: { SMALL: number; MEDIUM: number; LARGE: number } };

export default function SettingsPage() {
  const [tab, setTab] = useState<'platform' | 'zones' | 'bonuses' | 'categories'>('platform');
  return (
    <div>
      <PageHeader title="Settings & zones" subtitle="Commission, fees, rider pay, cash limits, service zones and bonuses." />
      <Tabs
        tabs={[
          { value: 'platform', label: 'Platform settings' },
          { value: 'zones', label: 'Service zones' },
          { value: 'bonuses', label: 'Rider bonuses' },
          { value: 'categories', label: 'Categories' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'platform' ? <PlatformSettings /> : null}
      {tab === 'zones' ? <Zones /> : null}
      {tab === 'bonuses' ? <Bonuses /> : null}
      {tab === 'categories' ? <Categories /> : null}
    </div>
  );
}

function toInput(kind: Kind, value: unknown): string {
  if (kind === 'money') return centsToInput(Number(value));
  if (kind === 'percent') return String(Number(value) / 100);
  if (kind === 'bool') return value ? 'true' : 'false';
  return value === undefined || value === null ? '' : String(value);
}

function fromInput(kind: Kind, raw: string): unknown {
  switch (kind) {
    case 'money': {
      const c = parseMoneyToCents(raw);
      if (c === null) throw new Error('invalid amount');
      return c;
    }
    case 'percent': {
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0 || n > 100) throw new Error('must be 0–100');
      return Math.round(n * 100);
    }
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n) || n <= 0) throw new Error('must be a positive number');
      return n;
    }
    case 'integer':
    case 'day': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error('must be a whole number');
      return n;
    }
    case 'bool':
      return raw === 'true';
    default:
      return raw.trim();
  }
}

function PlatformSettings() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<Settings>('/admin/settings');
  const [values, setValues] = useState<Record<string, string>>({});
  const [parcel, setParcel] = useState({ SMALL: '', MEDIUM: '', LARGE: '' });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) next[f.key] = toInput(f.kind, data[f.key]);
    setValues(next);
    setParcel({
      SMALL: centsToInput(data.parcelSurchargeCents.SMALL),
      MEDIUM: centsToInput(data.parcelSurchargeCents.MEDIUM),
      LARGE: centsToInput(data.parcelSurchargeCents.LARGE),
    });
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load settings'} onRetry={() => void reload()} />;

  const save = async () => {
    setFormError(null);
    const body: Record<string, unknown> = {};
    try {
      for (const g of GROUPS) {
        for (const f of g.fields) {
          try {
            body[f.key] = fromInput(f.kind, values[f.key] ?? '');
          } catch (e) {
            throw new Error(`${f.label}: ${(e as Error).message}`);
          }
        }
      }
      const surcharge: Record<string, number> = {};
      for (const size of ['SMALL', 'MEDIUM', 'LARGE'] as const) {
        const c = parseMoneyToCents(parcel[size] || '0');
        if (c === null) throw new Error(`Parcel surcharge (${size.toLowerCase()}): invalid amount`);
        surcharge[size] = c;
      }
      body.parcelSurchargeCents = surcharge;
    } catch (e) {
      setFormError((e as Error).message);
      return;
    }
    setPending(true);
    try {
      setData(await api<Settings>('/admin/settings', { method: 'PUT', body }));
      toast('Settings saved — they apply to new orders immediately');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <Card key={g.title} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">{g.title}</h2>
            <p className="text-sm text-muted">{g.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.fields.map((f) =>
              f.kind === 'bool' ? (
                <div key={f.key} className="flex items-center">
                  <Toggle checked={values[f.key] === 'true'} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v ? 'true' : 'false' }))} label={f.label} />
                </div>
              ) : f.kind === 'day' ? (
                <Field key={f.key} label={f.label}>
                  <Select value={values[f.key] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}>
                    {DAY_NAMES.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input
                    inputMode={f.kind === 'text' ? 'text' : 'decimal'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </Field>
              ),
            )}
          </div>
          {g.title === 'Commission & customer fees' ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Parcel size surcharge (US$)</p>
              <div className="grid grid-cols-3 gap-3">
                {(['SMALL', 'MEDIUM', 'LARGE'] as const).map((size) => (
                  <Field key={size} label={size.charAt(0) + size.slice(1).toLowerCase()}>
                    <Input inputMode="decimal" value={parcel[size]} onChange={(e) => setParcel((p) => ({ ...p, [size]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ))}
      <InlineError message={formError} />
      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" loading={pending} onClick={() => void save()}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────── Zones ─────────────────────────────

interface Zone {
  id: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
  deliveryFeeBaseCents: number | null;
  deliveryFeePerKmCents: number | null;
  riderBaseCents: number | null;
  riderPerKmCents: number | null;
  polygon: unknown;
  _count: { vendors: number; riders: number };
}

function Zones() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Zone[]>('/admin/zones');
  const [editing, setEditing] = useState<Zone | 'new' | null>(null);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load zones'} onRetry={() => void reload()} />;

  const remove = async (z: Zone) => {
    if (!window.confirm(`Delete zone "${z.name}"? Vendors and riders in it become unzoned.`)) return;
    try {
      await api(`/admin/zones/${z.id}`, { method: 'DELETE' });
      toast('Zone deleted');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Deliveries must start and end inside an active zone. With no zones, every address is served.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add zone
        </Button>
      </div>
      {mapsEnabled && data.length > 0 ? (
        <div className="h-72 overflow-hidden rounded-2xl border border-line">
          <GoogleMap defaultCenter={{ lat: data[0].centerLat, lng: data[0].centerLng }} defaultZoom={10} mapId={config.mapId} gestureHandling="greedy">
            {data.map((z) => (
              <Circle
                key={z.id}
                center={{ lat: z.centerLat, lng: z.centerLng }}
                radius={z.radiusKm * 1000}
                strokeColor={z.isActive ? '#FF7A00' : '#999999'}
                strokeWeight={2}
                fillColor={z.isActive ? '#FF7A00' : '#999999'}
                fillOpacity={0.12}
              />
            ))}
          </GoogleMap>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((z) => (
          <Card key={z.id} className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold">
                <MapPinned className="h-4 w-4 text-brand" /> {z.name}
              </h3>
              <Badge tone={z.isActive ? 'green' : 'gray'}>{z.isActive ? 'active' : 'inactive'}</Badge>
            </div>
            <p className="text-muted">
              {z.city} · {z.radiusKm} km radius{z.polygon ? ' (custom polygon)' : ''} · {z._count.vendors} vendors · {z._count.riders} riders
            </p>
            <p>
              Delivery fee:{' '}
              {z.deliveryFeeBaseCents !== null || z.deliveryFeePerKmCents !== null
                ? `${formatMoney(z.deliveryFeeBaseCents ?? 0)} + ${formatMoney(z.deliveryFeePerKmCents ?? 0)}/km`
                : 'platform default'}
              {' · '}Rider pay:{' '}
              {z.riderBaseCents !== null || z.riderPerKmCents !== null ? `${formatMoney(z.riderBaseCents ?? 0)} + ${formatMoney(z.riderPerKmCents ?? 0)}/km` : 'platform default'}
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(z)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(z)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {editing ? (
        <ZoneModal
          zone={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Zone saved');
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function optionalMoney(raw: string): number | null {
  if (!raw.trim()) return null;
  const c = parseMoneyToCents(raw);
  if (c === null) throw new Error('Enter valid amounts');
  return c;
}

function ZoneModal({ zone, onClose, onSaved }: { zone: Zone | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(zone?.name ?? '');
  const [city, setCity] = useState(zone?.city ?? 'Harare');
  const [center, setCenter] = useState(zone ? { lat: zone.centerLat, lng: zone.centerLng } : config.defaultCenter);
  const [radius, setRadius] = useState(String(zone?.radiusKm ?? 15));
  const [isActive, setIsActive] = useState(zone?.isActive ?? true);
  const [feeBase, setFeeBase] = useState(zone?.deliveryFeeBaseCents != null ? centsToInput(zone.deliveryFeeBaseCents) : '');
  const [feeKm, setFeeKm] = useState(zone?.deliveryFeePerKmCents != null ? centsToInput(zone.deliveryFeePerKmCents) : '');
  const [riderBase, setRiderBase] = useState(zone?.riderBaseCents != null ? centsToInput(zone.riderBaseCents) : '');
  const [riderKm, setRiderKm] = useState(zone?.riderPerKmCents != null ? centsToInput(zone.riderPerKmCents) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const radiusKm = Number(radius);
    if (!(radiusKm > 0 && radiusKm <= 200)) return setError('Radius must be between 0 and 200 km');
    let body;
    try {
      body = {
        name: name.trim(),
        city: city.trim(),
        centerLat: center.lat,
        centerLng: center.lng,
        radiusKm,
        isActive,
        deliveryFeeBaseCents: optionalMoney(feeBase),
        deliveryFeePerKmCents: optionalMoney(feeKm),
        riderBaseCents: optionalMoney(riderBase),
        riderPerKmCents: optionalMoney(riderKm),
      };
    } catch (e) {
      return setError((e as Error).message);
    }
    setPending(true);
    try {
      if (zone) await api(`/admin/zones/${zone.id}`, { method: 'PATCH', body });
      else await api('/admin/zones', { body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? `Edit ${zone.name}` : 'New service zone'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!name.trim() || !city.trim()} onClick={() => void submit()}>
            Save zone
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harare Metro" />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Radius (km)">
            <Input inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Zone centre</p>
          <MapPicker value={center} onChange={setCenter} height={260} />
        </div>
        <Toggle checked={isActive} onChange={setIsActive} label="Active" />
        <p className="text-sm font-semibold">Overrides (leave empty to use platform defaults)</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Fee base (US$)">
            <Input inputMode="decimal" value={feeBase} onChange={(e) => setFeeBase(e.target.value)} />
          </Field>
          <Field label="Fee per km (US$)">
            <Input inputMode="decimal" value={feeKm} onChange={(e) => setFeeKm(e.target.value)} />
          </Field>
          <Field label="Rider base (US$)">
            <Input inputMode="decimal" value={riderBase} onChange={(e) => setRiderBase(e.target.value)} />
          </Field>
          <Field label="Rider per km (US$)">
            <Input inputMode="decimal" value={riderKm} onChange={(e) => setRiderKm(e.target.value)} />
          </Field>
        </div>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

// ───────────────────────────── Bonuses ─────────────────────────────

interface BonusRule {
  id: string;
  name: string;
  deliveriesTarget: number;
  period: 'DAILY' | 'WEEKLY';
  amountCents: number;
  isActive: boolean;
  _count: { awards: number };
}

function Bonuses() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<BonusRule[]>('/admin/bonus-rules');
  const [editing, setEditing] = useState<BonusRule | 'new' | null>(null);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load bonuses'} onRetry={() => void reload()} />;

  const toggle = async (b: BonusRule, isActive: boolean) => {
    try {
      await api(`/admin/bonus-rules/${b.id}`, { method: 'PATCH', body: { isActive } });
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Riders are credited automatically when they hit a target within the period (Harare time).</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add bonus rule
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((b) => (
          <Card key={b.id} className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{b.name}</h3>
              <Toggle checked={b.isActive} onChange={(v) => void toggle(b, v)} label={b.isActive ? 'Active' : 'Paused'} />
            </div>
            <p>
              {b.deliveriesTarget} deliveries {b.period === 'DAILY' ? 'in a day' : 'in a week'} → <strong>{formatMoney(b.amountCents)}</strong>
            </p>
            <p className="text-muted">Awarded {b._count.awards} time(s)</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(b)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={async () => {
                  if (!window.confirm(`Delete "${b.name}"?`)) return;
                  try {
                    await api(`/admin/bonus-rules/${b.id}`, { method: 'DELETE' });
                    await reload();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Delete failed', 'error');
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {data.length === 0 ? <p className="text-sm text-muted">No bonus rules yet.</p> : null}
      </div>
      {editing ? (
        <BonusModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Bonus rule saved');
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function BonusModal({ rule, onClose, onSaved }: { rule: BonusRule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(rule?.name ?? '');
  const [target, setTarget] = useState(String(rule?.deliveriesTarget ?? 10));
  const [period, setPeriod] = useState<'DAILY' | 'WEEKLY'>(rule?.period ?? 'DAILY');
  const [amount, setAmount] = useState(centsToInput(rule?.amountCents ?? 300));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const deliveriesTarget = Number(target);
    const amountCents = parseMoneyToCents(amount);
    if (!Number.isInteger(deliveriesTarget) || deliveriesTarget < 1) return setError('Target must be a whole number');
    if (!amountCents) return setError('Enter a valid amount');
    setPending(true);
    setError(null);
    try {
      const body = { name: name.trim(), deliveriesTarget, period, amountCents };
      if (rule) await api(`/admin/bonus-rules/${rule.id}`, { method: 'PATCH', body });
      else await api('/admin/bonus-rules', { body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'Edit bonus rule' : 'New bonus rule'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!name.trim()} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name (shown to riders)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily hustle: 10 deliveries" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deliveries target">
            <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as 'DAILY' | 'WEEKLY')}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly (Mon–Sun)</option>
            </Select>
          </Field>
        </div>
        <Field label="Bonus amount (US$)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

// ───────────────────────────── Categories ─────────────────────────────

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { vendors: number };
}

function Categories() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Category[]>('/admin/categories');

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load categories'} onRetry={() => void reload()} />;

  const update = async (c: Category, body: Partial<Pick<Category, 'name' | 'isActive' | 'sortOrder'>>) => {
    try {
      await api(`/admin/categories/${c.id}`, { method: 'PATCH', body });
      toast('Category updated');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    }
  };

  return (
    <Card>
      <ul className="divide-y divide-line">
        {data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted">
                /{c.slug} · {c._count.vendors} vendors · order {c.sortOrder}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => {
                  const name = window.prompt('Category name', c.name);
                  if (name && name.trim() && name.trim() !== c.name) void update(c, { name: name.trim() });
                }}
              >
                Rename
              </Button>
              <Toggle checked={c.isActive} onChange={(v) => void update(c, { isActive: v })} label={c.isActive ? 'Visible' : 'Hidden'} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
