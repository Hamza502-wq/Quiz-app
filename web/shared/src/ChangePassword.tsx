'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from './api';
import { useAuth } from './auth';
import { useToast } from './toast';
import { Button, Field, InlineError, Input, Modal, cn } from './ui';

/** "Change password" link that opens a form (or "Set a password" for SMS-code accounts). */
export function ChangePasswordButton({ className }: { className?: string }) {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPassword = user?.hasPassword ?? true;

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('The two new passwords do not match');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api('/auth/password', { body: { currentPassword: hasPassword ? current : undefined, newPassword: next } });
      await refreshProfile();
      toast(hasPassword ? 'Password changed' : 'Password set');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1.5 hover:underline', className)}>
        <KeyRound className="h-4 w-4" aria-hidden /> {hasPassword ? 'Change password' : 'Set a password'}
      </button>
      <Modal open={open} onClose={close} title={hasPassword ? 'Change password' : 'Set a password'} size="sm">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {hasPassword ? (
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          ) : null}
          <Field label="New password" hint="At least 8 characters, with a letter and a number">
            <Input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <InlineError message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
