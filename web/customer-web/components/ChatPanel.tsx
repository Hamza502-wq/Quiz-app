'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button, InlineError, Input, Spinner, api, cn, formatTime, useApi, useSocketEvent } from '@doorstep/web-shared';
import type { ChatMessage } from '@/lib/types';

/** Customer ↔ rider chat for one order, live over Socket.IO. */
export function ChatPanel({ orderId, canSend }: { orderId: string; canSend: boolean }) {
  const messages = useApi<ChatMessage[]>(`/orders/${orderId}/messages`);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setData } = messages;

  useSocketEvent<ChatMessage>('chat:message', (m) => {
    if (m.orderId !== orderId) return;
    setData((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
  });

  const count = messages.data?.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);

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
      <div ref={listRef} className="h-64 space-y-2 overflow-y-auto rounded-xl bg-canvas p-3">
        {messages.error && !messages.data ? (
          <InlineError message={messages.error.message} />
        ) : !messages.data ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : messages.data.length === 0 ? (
          <p className="pt-20 text-center text-sm text-muted">No messages yet. Say hello to your rider.</p>
        ) : (
          messages.data.map((m) => (
            <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.mine ? 'bg-brand text-white' : 'bg-white text-ink shadow-sm')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-0.5 text-right text-[10px]', m.mine ? 'text-white/70' : 'text-muted')}>{formatTime(m.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      {canSend ? (
        <form onSubmit={(e) => void send(e)} className="mt-2 flex gap-2">
          <Input value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder="Message your rider" aria-label="Message" />
          <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send message" icon={<Send className="h-4 w-4" />} />
        </form>
      ) : (
        <p className="mt-2 text-xs text-muted">Chat closes when the delivery is finished.</p>
      )}
      <InlineError message={error} />
    </div>
  );
}
