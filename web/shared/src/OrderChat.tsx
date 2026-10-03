'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Phone, Send } from 'lucide-react';
import { api } from './api';
import { formatTime } from './format';
import { useApi, useInterval } from './hooks';
import { useSocket, useSocketEvent } from './socket';
import { Button, InlineError, Input, Skeleton, cn } from './ui';
import type { ChatMessage, ChatSender } from './types';

const ROLE_LABEL: Record<ChatSender['role'], string> = { customer: 'Customer', store: 'Store', rider: 'Rider' };

/**
 * An order's chat, shared by the customer, the store and the rider. Live over Socket.IO, and
 * checked every few seconds when there is no live connection.
 */
export function OrderChat({
  orderId,
  canSend,
  placeholder = 'Type a message',
  emptyText = 'No messages yet.',
  closedText = 'Chat closes when the delivery is finished.',
  onRead,
}: {
  orderId: string;
  canSend: boolean;
  placeholder?: string;
  emptyText?: string;
  closedText?: string;
  /** Called after messages load (opening the chat marks them read). */
  onRead?: () => void;
}) {
  const messages = useApi<ChatMessage[]>(`/orders/${orderId}/messages`);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setData, reload } = messages;
  const { connected } = useSocket();
  useInterval(() => void reload(), canSend && !connected ? 4000 : null);

  useSocketEvent<ChatMessage>('chat:message', (m) => {
    if (m.orderId !== orderId) return;
    setData((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
  });

  const count = messages.data?.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);
  const loaded = messages.data !== undefined;
  useEffect(() => {
    if (loaded) onRead?.();
  }, [loaded, count, onRead]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const m = await api<ChatMessage>(`/orders/${orderId}/messages`, { body: { body } });
      setData((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div ref={listRef} className="h-64 space-y-2 overflow-y-auto rounded-xl bg-canvas p-3" aria-live="polite">
        {messages.error && !messages.data ? (
          <InlineError message={messages.error.message} />
        ) : !messages.data ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">Loading messages…</span>
            <Skeleton className="h-9 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
            <Skeleton className="h-9 w-3/5 rounded-2xl" />
          </div>
        ) : messages.data.length === 0 ? (
          <p className="pt-20 text-center text-sm text-muted">{emptyText}</p>
        ) : (
          messages.data.map((m) => (
            <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.mine ? 'bg-brand text-white' : 'bg-white text-ink shadow-sm')}>
                {!m.mine && m.sender ? (
                  <p className="mb-0.5 text-[11px] font-semibold text-brand">
                    {m.sender.name} · {ROLE_LABEL[m.sender.role]}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-0.5 text-right text-[10px]', m.mine ? 'text-white/70' : 'text-muted')}>{formatTime(m.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      {canSend ? (
        <form onSubmit={(e) => void send(e)} className="mt-2 flex gap-2">
          <Input value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label="Message" />
          <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send message" icon={<Send className="h-4 w-4" />} />
        </form>
      ) : (
        <p className="mt-2 text-xs text-muted">{closedText}</p>
      )}
      <InlineError message={error} />
    </div>
  );
}

/** A "Call" link for a phone number (opens the dialler on phones). */
export function CallLink({ phone, label, className }: { phone: string; label: string; className?: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:border-brand hover:text-brand',
        className,
      )}
    >
      <Phone className="h-4 w-4" aria-hidden /> {label}
    </a>
  );
}

