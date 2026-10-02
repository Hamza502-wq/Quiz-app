'use client';

import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import type { ApprovalStatus, OrderStatus, PaymentStatus, PayoutStatus } from './types';
import { ORDER_STATUS_LABEL } from './format';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// ───────────────────────────── Buttons ─────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:border-brand hover:text-brand',
  ghost: 'text-ink-soft hover:bg-canvas',
  danger: 'bg-alert text-white hover:opacity-90',
  dark: 'bg-ink text-white hover:bg-black',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variantClass[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ───────────────────────────── Form controls ─────────────────────────────

const controlClass =
  'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-canvas';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(controlClass, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(controlClass, 'resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlClass, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-alert">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-gray-300')}>
        <span
          className={cn(
            'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </button>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-white p-5 shadow-card', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'alert' | 'success';
}) {
  const tones = {
    default: 'bg-canvas text-ink',
    brand: 'bg-brand-light text-brand',
    alert: 'bg-alert-light text-alert',
    success: 'bg-success-light text-success',
  };
  return (
    <Card className="flex items-start gap-4">
      {icon ? <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div> : null}
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold text-ink">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}

// ───────────────────────────── Feedback states ─────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand', className)} aria-label="Loading" />;
}

/** A grey placeholder block with a soft shimmer, shaped like the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('ds-skeleton rounded-lg', className)} aria-hidden />;
}

export type SkeletonVariant = 'list' | 'cards' | 'table' | 'detail' | 'stats' | 'form' | 'menu' | 'page';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

function SkeletonLines({ widths = ['w-2/3', 'w-1/2'] }: { widths?: string[] }) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      {widths.map((w, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === 0 && 'h-4', w)} />
      ))}
    </div>
  );
}

function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {rows(count).map((i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <SkeletonLines widths={[i % 2 ? 'w-1/2' : 'w-2/3', 'w-1/3']} />
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows(count).map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-white">
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <div className="flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <SkeletonLines widths={['w-3/4', 'w-1/2']} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex gap-4 border-b border-line bg-canvas/60 px-4 py-3">
        {rows(4).map((i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {rows(count).map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-[2]" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="hidden h-3.5 flex-1 sm:block" />
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {rows(4).map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-line bg-white p-5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-2/3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <SkeletonLines widths={['w-1/3', 'w-1/4']} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          {rows(5).map((i) => (
            <Skeleton key={i} className={cn('h-3.5', i % 2 ? 'w-5/6' : 'w-full')} />
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-white p-5">
          {rows(4).map((i) => (
            <Skeleton key={i} className={cn('h-3.5', i % 2 ? 'w-2/3' : 'w-full')} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-5 rounded-2xl border border-line bg-white p-6">
      {rows(4).map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-11 w-40 rounded-xl" />
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-40 w-full rounded-2xl sm:h-52" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
        <SkeletonLines widths={['w-1/2', 'w-1/3']} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows(6).map((i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <SkeletonLines widths={['w-2/3', 'w-full', 'w-1/4']} />
            <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="w-full max-w-3xl space-y-4 px-4">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <ListSkeleton count={3} />
    </div>
  );
}

const SKELETONS: Record<SkeletonVariant, () => ReactNode> = {
  list: () => <ListSkeleton />,
  cards: () => <CardsSkeleton />,
  table: () => <TableSkeleton />,
  detail: () => <DetailSkeleton />,
  stats: () => <StatsSkeleton />,
  form: () => <FormSkeleton />,
  menu: () => <MenuSkeleton />,
  page: () => <PageSkeleton />,
};

/**
 * Loading placeholder: a skeleton of the content that is on its way (list rows,
 * store cards, a table, …). `label` is announced to screen readers.
 */
export function LoadingBlock({ label = 'Loading…', variant = 'list' }: { label?: string; variant?: SkeletonVariant }) {
  return (
    <div className="w-full py-2" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {SKELETONS[variant]()}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-alert/20 bg-alert-light/50 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-alert" aria-hidden />
      <p className="max-w-md text-sm text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <div className="mb-1 text-brand">{icon ?? <Inbox className="h-9 w-9" aria-hidden />}</div>
      <p className="font-semibold text-ink">{title}</p>
      {message ? <p className="max-w-sm text-sm text-muted">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-alert-light px-3 py-2 text-sm text-alert" role="alert">
      {message}
    </p>
  );
}

// ───────────────────────────── Badges ─────────────────────────────

type Tone = 'gray' | 'orange' | 'green' | 'red' | 'yellow' | 'blue' | 'dark';
const toneClass: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-brand-light text-brand-dark',
  green: 'bg-success-light text-success',
  red: 'bg-alert-light text-alert',
  yellow: 'bg-warning-light text-warning',
  blue: 'bg-blue-50 text-blue-700',
  dark: 'bg-ink text-white',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClass[tone], className)}>
      {children}
    </span>
  );
}

const orderTone: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'yellow',
  PLACED: 'orange',
  ACCEPTED: 'blue',
  READY_FOR_PICKUP: 'dark',
  PICKED_UP: 'blue',
  ON_THE_WAY: 'blue',
  DELIVERED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};

/** A vehicle number plate, e.g. "AEZ 1234", styled like the plate on the bike. */
export function PlateBadge({ plate, className }: { plate: string | null | undefined; className?: string }) {
  if (!plate) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border-2 border-ink bg-white px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-ink',
        className,
      )}
      aria-label={`Number plate ${plate}`}
    >
      {plate}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTone[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const tone: Record<ApprovalStatus, Tone> = { PENDING: 'yellow', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'gray' };
  return <Badge tone={tone[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone: Record<PaymentStatus, Tone> = {
    PENDING: 'yellow',
    PAID: 'green',
    FAILED: 'red',
    CANCELLED: 'gray',
    REFUNDED: 'blue',
    PARTIALLY_REFUNDED: 'blue',
  };
  return <Badge tone={tone[status]}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const tone: Record<PayoutStatus, Tone> = { PENDING: 'yellow', PROCESSING: 'blue', PAID: 'green', REJECTED: 'red' };
  return <Badge tone={tone[status]}>{status.toLowerCase()}</Badge>;
}

// ───────────────────────────── Modal ─────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', widths[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-canvas" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// ───────────────────────────── Table & pagination ─────────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('border-b border-line bg-canvas px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted', className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b border-line px-4 py-3 align-middle', className)}>{children}</td>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-muted">
        Page {page} of {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            value === t.value ? 'bg-brand text-white' : 'text-ink-soft hover:bg-canvas',
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 opacity-80">({t.count})</span> : null}
        </button>
      ))}
    </div>
  );
}
