'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { ApiError, Button, InlineError, Input, Skeleton, api, cn, formatTime, useInterval, useSocket, useSocketEvent } from '@doorstep/web-shared';
import type { MarketMessage, MarketThread } from '@/lib/market';

/**
 * A marketplace conversation. Live over Socket.IO, and checked every few seconds for new
 * messages when there is no live connection (the Netlify site always polls).
 */
export function ThreadView({ threadId, onLoaded, className }: { threadId: string; onLoaded?: (thread: MarketThread) => void; className?: string }) {
  const [messages, setMessages] = useState<MarketMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | null>(null);
  const { connected } = useSocket();
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const merge = useCallback((incoming: MarketMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set((prev ?? []).map((m) => m.id));
      const next = [...(prev ?? []), ...incoming.filter((m) => !known.has(m.id))];
      next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      lastSeen.current = next[next.length - 1]?.createdAt ?? lastSeen.current;
      return next;
    });
  }, []);

  const load = useCallback(
    async (onlyNew: boolean) => {
      try {
        const res = await api<{ thread: MarketThread; messages: MarketMessage[] }>(`/market/threads/${threadId}`, {
          query: onlyNew && lastSeen.current ? { after: lastSeen.current } : undefined,
        });
        if (!onlyNew) {
          setMessages(res.messages);
          lastSeen.current = res.messages[res.messages.length - 1]?.createdAt ?? null;
          onLoadedRef.current?.(res.thread);
        } else merge(res.messages);
        setClosed(res.thread.listing.status === 'REMOVED');
        setLoadError(null);
      } catch (err) {
        if (!onlyNew) setLoadError(err instanceof ApiError ? err.message : 'Could not load the conversation.');
      }
    },
    [threadId, merge],
  );

  useEffect(() => {
    setMessages(null);
    lastSeen.current = null;
    void load(false);
  }, [load]);

  useInterval(() => void load(true), connected ? null : 4000);
  useSocketEvent<MarketMessage>('market:message', (m) => {
    if (m.threadId === threadId) {
      merge([m]);
      // Opening the conversation marks it read; a live message is read while it is open.
      if (!m.mine) void load(true);
    }
  });

  const count = messages?.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await api<MarketMessage>(`/market/threads/${threadId}/messages`, { body: { body } });
      merge([m]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div ref={listRef} className="min-h-[16rem] flex-1 space-y-2 overflow-y-auto rounded-xl bg-canvas p-3" aria-live="polite">
        {loadError && !messages ? (
          <InlineError message={loadError} />
        ) : !messages ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">Loading messages…</span>
            <Skeleton className="h-9 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
            <Skeleton className="h-9 w-3/5 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <p className="pt-20 text-center text-sm text-muted">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.mine ? 'bg-brand text-white' : 'bg-white text-ink shadow-sm')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-0.5 text-right text-[10px]', m.mine ? 'text-white/70' : 'text-muted')}>{formatTime(m.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      {closed ? (
        <p className="mt-2 text-xs text-muted">This listing was removed, so the conversation is closed.</p>
      ) : (
        <form onSubmit={(e) => void send(e)} className="mt-2 flex gap-2">
          <Input value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message" aria-label="Message" />
          <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send message" icon={<Send className="h-4 w-4" />} />
        </form>
      )}
      <InlineError message={error} />
    </div>
  );
}
