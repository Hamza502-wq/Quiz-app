'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, MessageSquareText } from 'lucide-react';
import { useAuth } from './auth';
import { FlagStripe, Logo } from './brand';
import { config } from './config';
import { Button, Field, InlineError, Input, cn } from './ui';
import type { Profile } from './types';

type LoginMode = 'otp' | 'password';
type View = 'signin' | 'signup';

/** SMS codes are offered only while an SMS provider is connected. */
const DEFAULT_MODES: LoginMode[] = config.smsSignIn ? ['otp', 'password'] : ['password'];

/**
 * Shared sign-in screen: phone + password, or phone + SMS code (OTP).
 * `allowSignup` adds a "Create account" form (name, phone, password) for this
 * app's role. `modes` limits the sign-in methods offered; SMS codes are dropped
 * automatically when SMS sign-in is not available.
 */
export function LoginPage({
  title,
  subtitle,
  onSuccess,
  allowSignup = false,
  signupTitle = 'Create your account',
  signupNote,
  modes = DEFAULT_MODES,
  initialView = 'signin',
  footer,
}: {
  title: string;
  subtitle: string;
  onSuccess: (user: Profile, info: { isNew: boolean }) => void;
  allowSignup?: boolean;
  signupTitle?: string;
  /** Short line under the sign-up form (or under sign-in when there is no sign-up form). */
  signupNote?: string;
  modes?: LoginMode[];
  initialView?: View;
  /** Extra content under the card (e.g. links to the other DoorStep apps). */
  footer?: ReactNode;
}) {
  const { requestOtp, verifyOtp, loginWithPassword, register } = useAuth();
  const available = modes.filter((m) => m !== 'otp' || config.smsSignIn);
  const methods: LoginMode[] = available.length ? available : ['password'];
  const [view, setView] = useState<View>(allowSignup ? initialView : 'signin');
  const [mode, setMode] = useState<LoginMode>(methods[0]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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

  const switchView = (next: View) => {
    setView(next);
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (view === 'signup') {
      if (password !== confirm) {
        setError('The two passwords do not match');
        return;
      }
      void run(async () => onSuccess(await register({ name: name.trim(), phone, password }), { isNew: true }));
    } else if (mode === 'password') {
      void run(async () => onSuccess(await loginWithPassword(phone, password), { isNew: false }));
    } else if (!codeSent) {
      void run(async () => {
        const res = await requestOtp(phone);
        setCodeSent(true);
        setDevCode(res.devCode ?? null);
      });
    } else {
      void run(async () => onSuccess(await verifyOtp(phone, code), { isNew: false }));
    }
  };

  const signingUp = view === 'signup';

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="w-44" />
          <h1 className="mt-4 text-2xl font-bold">{signingUp ? signupTitle : title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <FlagStripe className="mt-4" />
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          {!signingUp && methods.length > 1 ? (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
              {(
                [
                  ['otp', 'SMS code', MessageSquareText],
                  ['password', 'Password', KeyRound],
                ] as const
              )
                .filter(([value]) => methods.includes(value))
                .map(([value, label, Icon]) => (
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
            {signingUp ? (
              <Field label="Your name">
                <Input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tendai Moyo" />
              </Field>
            ) : null}

            <Field label="Phone number" hint="e.g. 0771 234 567">
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={phone}
                disabled={!signingUp && codeSent && mode === 'otp'}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07xx xxx xxx"
              />
            </Field>

            {signingUp ? (
              <>
                <Field label="Password" hint="At least 8 characters, with a letter and a number">
                  <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Field label="Confirm password">
                  <Input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
              </>
            ) : mode === 'password' ? (
              <Field label="Password">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            ) : null}

            {!signingUp && mode === 'otp' && codeSent ? (
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
              {signingUp ? 'Create account' : mode === 'password' ? 'Sign in' : codeSent ? 'Verify & continue' : 'Send code'}
            </Button>

            {!signingUp && mode === 'otp' && codeSent ? (
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

          {(signingUp || !allowSignup) && signupNote ? <p className="mt-4 text-center text-xs text-muted">{signupNote}</p> : null}

          {allowSignup ? (
            <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">
              {signingUp ? 'Already have an account? ' : 'New to DoorStep? '}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => switchView(signingUp ? 'signin' : 'signup')}>
                {signingUp ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          ) : null}
        </div>
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
