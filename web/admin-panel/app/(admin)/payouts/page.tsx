'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, Store } from 'lucide-react';
import {
  Badge,
  Button,
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
  PayoutStatusBadge,
  Select,
  Table,
  Td,
  Textarea,
  Th,
  api,
  formatDateTime,
  formatMoney,
  useApi,
  useToast,
  type Paged,
  type Payout,
  type PayoutStatus,
} from '@doorstep/web-shared';

interface AdminPayout extends Payout {
  rider: { id: string; user: { name: string | null; phone: string } } | null;
  vendor: { id: string; name: string } | null;
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Payouts />
    </Suspense>
  );
}

function Payouts() {
  const params = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState<'' | PayoutStatus>((params.get('status') as PayoutStatus) ?? '');
  const [payeeType, setPayeeType] = useState<'' | 'RIDER' | 'VENDOR'>('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminPayout>>('/admin/payouts', { status: status || undefined, payeeType: payeeType || undefined, page, pageSize: 25 });
  const [processing, setProcessing] = useState<{ payout: AdminPayout; next: 'PROCESSING' | 'PAID' | 'REJECTED' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const runBatch = async (kind: 'vendors' | 'riders') => {
    setBusy(kind);
    try {
      if (kind === 'vendors') {
        const res = await api<{ created: number; skipped: Array<{ vendor: string; reason: string }> }>('/admin/payouts/vendors/generate', { method: 'POST' });
        toast(`${res.created} vendor payout(s) created${res.skipped.length ? ` · ${res.skipped.length} skipped` : ''}`);
      } else {
        const res = await api<{ created: number }>('/admin/payouts/riders/run-weekly', { method: 'POST' });
        toast(`${res.created} rider payout(s) created`);
      }
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Batch failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payouts"
        subtitle="Send money to riders and vendors via EcoCash, OneMoney or bank, then record the reference."
        actions={
          <>
            <Button variant="secondary" icon={<Store className="h-4 w-4" />} loading={busy === 'vendors'} onClick={() => void runBatch('vendors')}>
              Generate vendor payouts
            </Button>
            <Button variant="secondary" icon={<Play className="h-4 w-4" />} loading={busy === 'riders'} onClick={() => void runBatch('riders')}>
              Run weekly rider payouts
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="max-w-[200px]" value={status} onChange={(e) => { setStatus(e.target.value as '' | PayoutStatus); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Select className="max-w-[200px]" value={payeeType} onChange={(e) => { setPayeeType(e.target.value as '' | 'RIDER' | 'VENDOR'); setPage(1); }} aria-label="Payee">
          <option value="">Riders & vendors</option>
          <option value="RIDER">Riders</option>
          <option value="VENDOR">Vendors</option>
        </Select>
      </div>
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No payouts" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Payee</Th>
                <Th>Destination</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <span className="font-semibold">{p.payeeType === 'RIDER' ? p.rider?.user.name ?? p.rider?.user.phone : p.vendor?.name}</span>
                    <span className="block text-xs text-muted">
                      {p.payeeType.toLowerCase()}
                      {p.isAutomatic ? ' · automatic' : ''}
                    </span>
                  </Td>
                  <Td>
                    {PAYMENT_METHOD_LABEL[p.method]} · {p.accountNumber}
                    <span className="block text-xs text-muted">
                      {p.accountName}
                      {p.bankName ? ` · ${p.bankName}` : ''}
                    </span>
                  </Td>
                  <Td>{formatDateTime(p.requestedAt)}</Td>
                  <Td>
                    <PayoutStatusBadge status={p.status} />
                    {p.reference ? <span className="block text-xs text-muted">ref {p.reference}</span> : null}
                  </Td>
                  <Td className="text-right font-semibold">{formatMoney(p.amountCents)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.status === 'PENDING' ? (
                        <Button size="sm" variant="ghost" onClick={() => setProcessing({ payout: p, next: 'PROCESSING' })}>
                          Processing
                        </Button>
                      ) : null}
                      {p.status === 'PENDING' || p.status === 'PROCESSING' ? (
                        <>
                          <Button size="sm" onClick={() => setProcessing({ payout: p, next: 'PAID' })}>
                            Mark paid
                          </Button>
                          <Button size="sm" variant="ghost" className="text-alert" onClick={() => setProcessing({ payout: p, next: 'REJECTED' })}>
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {p.status === 'PAID' ? <Badge tone="green">done</Badge> : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
      {processing ? (
        <ProcessModal
          payout={processing.payout}
          next={processing.next}
          onClose={() => setProcessing(null)}
          onDone={() => {
            setProcessing(null);
            toast('Payout updated');
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ProcessModal({ payout, next, onClose, onDone }: { payout: AdminPayout; next: 'PROCESSING' | 'PAID' | 'REJECTED'; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (next === 'PAID' && !reference.trim()) return setError('Enter the transaction reference');
    setPending(true);
    setError(null);
    try {
      await api(`/admin/payouts/${payout.id}/process`, { body: { status: next, reference: reference.trim() || undefined, notes: notes.trim() || undefined } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPending(false);
    }
  };

  const titles = { PROCESSING: 'Mark as processing', PAID: 'Mark as paid', REJECTED: 'Reject payout' };
  return (
    <Modal
      open
      onClose={onClose}
      title={titles[next]}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={next === 'REJECTED' ? 'danger' : 'primary'} loading={pending} onClick={() => void submit()}>
            Confirm
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        {formatMoney(payout.amountCents)} → {PAYMENT_METHOD_LABEL[payout.method]} {payout.accountNumber}
        {next === 'REJECTED' && payout.payeeType === 'RIDER' ? ' — the amount goes back to the rider’s wallet.' : ''}
      </p>
      <div className="space-y-3">
        {next !== 'REJECTED' ? (
          <Field label={next === 'PAID' ? 'Transaction reference' : 'Reference (optional)'}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Notes (optional)">
          <Textarea value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
