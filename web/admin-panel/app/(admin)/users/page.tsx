'use client';

import { useState } from 'react';
import { ShieldPlus } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  Td,
  Th,
  api,
  config,
  formatDate,
  timeAgo,
  useApi,
  useAuth,
  useToast,
  type Paged,
  type RoleName,
} from '@doorstep/web-shared';

interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  lastSeenAt: string | null;
  createdAt: string;
  roles: RoleName[];
  orderCount: number;
}

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [role, setRole] = useState<'' | RoleName>('CUSTOMER');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [addAdmin, setAddAdmin] = useState(false);
  const { data, error, loading, reload } = useApi<Paged<AdminUser>>('/admin/users', { role: role || undefined, q: q || undefined, page, pageSize: 25 });

  const setStatus = async (u: AdminUser, status: AdminUser['status']) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } });
      toast(`${u.name ?? u.phone} ${status === 'SUSPENDED' ? 'suspended' : 'reactivated'}`);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers & users"
        subtitle="Suspending an account signs the user out everywhere."
        actions={
          <Button variant="secondary" icon={<ShieldPlus className="h-4 w-4" />} onClick={() => setAddAdmin(true)}>
            Add admin
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Name or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select className="max-w-[200px]" value={role} onChange={(e) => { setRole(e.target.value as '' | RoleName); setPage(1); }} aria-label="Role">
          <option value="">All roles</option>
          <option value="CUSTOMER">Customers</option>
          <option value="RIDER">Riders</option>
          <option value="VENDOR">Vendors</option>
          <option value="ADMIN">Admins</option>
        </Select>
      </div>
      {loading && !data ? (
        <LoadingBlock variant="table" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Roles</Th>
                <Th className="text-right">Orders</Th>
                <Th>Last seen</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatarUrl} name={u.name ?? u.phone} size="sm" />
                      <div className="min-w-0">
                        <span className="font-semibold">{u.name ?? '—'}</span>
                        <span className="block text-xs text-muted">
                          {u.phone}
                          {u.email ? ` · ${u.email}` : ''}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} tone={r === 'ADMIN' ? 'dark' : 'gray'}>
                          {r.toLowerCase()}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-right">{u.orderCount}</Td>
                  <Td>{timeAgo(u.lastSeenAt)}</Td>
                  <Td>{formatDate(u.createdAt)}</Td>
                  <Td>
                    <Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status.toLowerCase()}</Badge>
                  </Td>
                  <Td className="text-right">
                    {u.id === me?.id ? null : u.status === 'ACTIVE' ? (
                      <Button size="sm" variant="ghost" className="text-alert" onClick={() => void setStatus(u, 'SUSPENDED')}>
                        Suspend
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => void setStatus(u, 'ACTIVE')}>
                        Reactivate
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
      <AddAdminModal open={addAdmin} onClose={() => setAddAdmin(false)} onDone={() => { setAddAdmin(false); toast('Admin access granted'); void reload(); }} />
    </div>
  );
}

function AddAdminModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api('/admin/admins', { body: { phone, name, password: password || undefined } });
      setPhone('');
      setName('');
      setPassword('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Grant admin access"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            Grant access
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Phone number">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label={config.smsSignIn ? 'Password (optional)' : 'Password'}
          hint={
            config.smsSignIn
              ? 'At least 8 characters with a letter and a number. They can always sign in with an SMS code.'
              : 'At least 8 characters with a letter and a number. Leave empty only if they already have a DoorStep password.'
          }
        >
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
