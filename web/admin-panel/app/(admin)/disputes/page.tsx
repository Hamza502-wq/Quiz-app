'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PAYMENT_METHOD_LABEL,
  PageHeader,
  Pagination,
  Select,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  api,
  formatDateTime,
  formatMoney,
  parseMoneyToCents,
  useApi,
  useToast,
  type Paged,
} from '@doorstep/web-shared';

interface Dispute {
  id: string;
  reason: string;
  description: string;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED';
  resolution: string | null;
  refundCents: number | null;
  createdAt: string;
  order: {
    id: string;
    code: string;
    totalCents: number;
    status: string;
    paymentMethod: string;
    paymentStatus: string;
    vendor: { name: string } | null;
    rider: { id: string; user: { name: string | null } } | null;
  };
  raisedBy: { name: string | null; phone: string };
  refunds: Array<{ amountCents: number; status: string }>;
}

interface Refund {
  id: string;
  amountCents: number;
  method: string;
  status: 'PENDING' | 'COMPLETED';
  reference: string | null;
  notes: string | null;
  createdAt: string;
  order: { id: string; code: string; customer: { user: { name: string | null; phone: string } } };
}

export default function DisputesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Disputes />
    </Suspense>
  );
}

function Disputes() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'disputes' | 'refunds'>(params.get('tab') === 'refunds' ? 'refunds' : 'disputes');
  return (
    <div>
      <PageHeader title="Disputes & refunds" subtitle="Resolve customer problems and pay back refunds." />
      <Tabs
        tabs={[
          { value: 'disputes', label: 'Disputes' },
          { value: 'refunds', label: 'Refunds' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'disputes' ? <DisputeList /> : <RefundList />}
    </div>
  );
}

function DisputeList() {
  const toast = useToast();
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'REJECTED' | ''>('OPEN');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Dispute>>('/admin/disputes', { status: status || undefined, page, pageSize: 20 });
  const [resolving, setResolving] = useState<Dispute | null>(null);

  return (
    <>
      <Select className="mb-4 max-w-[200px]" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Status">
        <option value="OPEN">Open</option>
        <option value="RESOLVED">Resolved</option>
        <option value="REJECTED">Rejected</option>
        <option value="">All</option>
      </Select>
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No disputes" message="Nice — nothing needs attention." />
      ) : (
        <div className="space-y-3">
          {data.items.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${d.order.id}`} className="font-bold hover:text-brand">
                    {d.order.code}
                  </Link>
                  <Badge tone={d.status === 'OPEN' ? 'red' : d.status === 'RESOLVED' ? 'green' : 'gray'}>{d.status.toLowerCase()}</Badge>
                  <Badge tone="orange">{d.reason.replace(/_/g, ' ').toLowerCase()}</Badge>
                </div>
                <p className="mt-2">{d.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {d.raisedBy.name ?? d.raisedBy.phone} · {formatDateTime(d.createdAt)} · {d.order.vendor?.name ?? 'Parcel'} · rider {d.order.rider?.user.name ?? '—'} ·
                  total {formatMoney(d.order.totalCents)} ({PAYMENT_METHOD_LABEL[d.order.paymentMethod]})
                </p>
                {d.resolution ? (
                  <p className="mt-2 rounded-lg bg-canvas px-3 py-2">
                    <strong>Resolution:</strong> {d.resolution}
                    {d.refundCents ? ` · refund ${formatMoney(d.refundCents)}` : ''}
                  </p>
                ) : null}
              </div>
              {d.status === 'OPEN' ? (
                <Button size="sm" onClick={() => setResolving(d)}>
                  Resolve
                </Button>
              ) : null}
            </Card>
          ))}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}
      {resolving ? (
        <ResolveModal
          dispute={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            toast('Dispute updated');
            void reload();
          }}
        />
      ) : null}
    </>
  );
}

function ResolveModal({ dispute, onClose, onDone }: { dispute: Dispute; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState('');
  const [method, setMethod] = useState(dispute.order.paymentMethod === 'CASH' ? 'ECOCASH' : dispute.order.paymentMethod);
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!resolution.trim()) return setError('Describe the resolution');
    const refundCents = refund.trim() ? parseMoneyToCents(refund) : undefined;
    if (refund.trim() && !refundCents) return setError('Enter a valid refund amount');
    setPending(true);
    setError(null);
    try {
      await api(`/admin/disputes/${dispute.id}/resolve`, {
        body: {
          status,
          resolution: resolution.trim(),
          refundCents: status === 'RESOLVED' ? refundCents : undefined,
          refundMethod: status === 'RESOLVED' && refundCents ? method : undefined,
          refundReference: status === 'RESOLVED' && refundCents ? reference.trim() || undefined : undefined,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Resolve dispute · ${dispute.order.code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Outcome">
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'RESOLVED' | 'REJECTED')}>
            <option value="RESOLVED">Resolved in customer&apos;s favour</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </Field>
        <Field label="Resolution (sent to the customer)">
          <Textarea value={resolution} maxLength={1000} onChange={(e) => setResolution(e.target.value)} />
        </Field>
        {status === 'RESOLVED' ? (
          <>
            <Field label="Refund amount (US$, optional)" hint={`Order total ${formatMoney(dispute.order.totalCents)}`}>
              <Input inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} />
            </Field>
            {refund.trim() ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Refund via">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="ECOCASH">EcoCash</option>
                    <option value="ONEMONEY">OneMoney</option>
                    <option value="CARD">Card</option>
                    <option value="BANK">Bank</option>
                    <option value="CASH">Cash</option>
                  </Select>
                </Field>
                <Field label="Reference" hint="Leave empty to process later">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </div>
            ) : null}
          </>
        ) : null}
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

function RefundList() {
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | ''>('PENDING');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Refund>>('/admin/refunds', { status: status || undefined, page, pageSize: 20 });
  const [completing, setCompleting] = useState<Refund | null>(null);
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);

  const complete = async () => {
    if (!completing || !reference.trim()) return;
    setPending(true);
    try {
      await api(`/admin/refunds/${completing.id}/complete`, { body: { reference: reference.trim() } });
      toast('Refund marked as paid');
      setCompleting(null);
      setReference('');
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Select className="mb-4 max-w-[200px]" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Status">
        <option value="PENDING">Pending</option>
        <option value="COMPLETED">Completed</option>
        <option value="">All</option>
      </Select>
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No refunds" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Method</Th>
                <Th>Created</Th>
                <Th>Notes</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/orders/${r.order.id}`} className="font-semibold hover:text-brand">
                      {r.order.code}
                    </Link>
                  </Td>
                  <Td>
                    {r.order.customer.user.name}
                    <span className="block text-xs text-muted">{r.order.customer.user.phone}</span>
                  </Td>
                  <Td>{PAYMENT_METHOD_LABEL[r.method] ?? r.method}</Td>
                  <Td>{formatDateTime(r.createdAt)}</Td>
                  <Td className="max-w-[220px] truncate text-xs text-muted">{r.notes}</Td>
                  <Td className="text-right font-semibold">{formatMoney(r.amountCents)}</Td>
                  <Td className="text-right">
                    {r.status === 'PENDING' ? (
                      <Button size="sm" onClick={() => setCompleting(r)}>
                        Mark paid
                      </Button>
                    ) : (
                      <Badge tone="green">{r.reference}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
      <Modal
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title="Mark refund as paid"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!reference.trim()} onClick={() => void complete()}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm">
          Send {completing ? formatMoney(completing.amountCents) : ''} to {completing?.order.customer.user.phone} via{' '}
          {completing ? PAYMENT_METHOD_LABEL[completing.method] ?? completing.method : ''}, then enter the transaction reference.
        </p>
        <Field label="Transaction reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
