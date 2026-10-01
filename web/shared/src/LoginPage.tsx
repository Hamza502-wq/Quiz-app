'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, MessageSquareText } from 'lucide-react';
import { useAuth } from './auth';
import { FlagStripe, Logo } from './brand';
import { Button, Field, InlineError, Input, cn } from './ui';
import type { Profile } from './types';

type LoginMode = 'otp' | 'password';

/**
 * Shared sign-in screen: phone + password, or phone + SMS code (OTP).
 * `allowSignup` lets new users create an account via OTP; `signupNote` explains it.
 * `modes` limits the sign-in methods offered (customers only use SMS codes).
 */
export function LoginPage({
  title,
  subtitle,
  onSuccess,
  allowSignup = false,
  signupNote = 'New to DoorStep? Sign in with an SMS code to create your store.',
  modes = ['otp', 'password'],
}: {
  title: string;
  subtitle: string;
  onSuccess: (user: Profile) => void;
  allowSignup?: boolean;
  signupNote?: string;
  modes?: LoginMode[];
}) {
  const { requestOtp, verifyOtp, loginWithPassword } = useAuth();
  const [mode, setMode] = useState<LoginMode>(modes[0] ?? 'otp');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'password') {
      void run(async () => onSuccess(await loginWithPassword(phone, password)));
    } else if (!codeSent) {
      void run(async () => {
        const res = await requestOtp(phone);
        setCodeSent(true);
        setDevCode(res.devCode ?? null);
      });
    } else {
      void run(async () => onSuccess(await verifyOtp(phone, code)));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="w-44" />
          <h1 className="mt-4 text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <FlagStripe className="mt-4" />
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          {modes.length > 1 ? (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
              {(
                [
                  ['otp', 'SMS code', MessageSquareText],
                  ['password', 'Password', KeyRound],
                ] as const
              ).filter(([value]) => modes.includes(value)).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold',
                    mode === value ? 'bg-white text-brand shadow-sm' : 'text-muted',
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            <Field label="Phone number" hint="e.g. 0771 234 567">
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={phone}
                disabled={codeSent && mode === 'otp'}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07xx xxx xxx"
              />
            </Field>

            {mode === 'password' ? (
              <Field label="Password">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            ) : null}

            {mode === 'otp' && codeSent ? (
              <Field label="6-digit code" hint={devCode ? `Development code: ${devCode}` : 'We sent it by SMS. It expires in 5 minutes.'}>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-lg tracking-[0.4em]"
                />
              </Field>
            ) : null}

            <InlineError message={error} />

            <Button type="submit" size="lg" className="w-full" loading={pending}>
              {mode === 'password' ? 'Sign in' : codeSent ? 'Verify & continue' : 'Send code'}
            </Button>

            {mode === 'otp' && codeSent ? (
              <button
                type="button"
                className="w-full text-center text-sm font-semibold text-brand hover:underline"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setDevCode(null);
                }}
              >
                Use a different number
              </button>
            ) : null}
          </form>
          {allowSignup ? (
            <p className="mt-5 text-center text-xs text-muted">{signupNote}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
