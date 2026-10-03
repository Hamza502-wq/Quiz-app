'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { config } from './config';
import { Button, Modal, cn } from './ui';

/** Chrome/Edge/Samsung Internet's install event (not in the TS DOM types yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Registers this app's service worker (production builds only). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const scope = `${config.basePath}/`;
    navigator.serviceWorker.register(`${config.basePath}/sw.js`, { scope }).catch(() => undefined);
  }, []);
  return null;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports itself as a Mac with touch support.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Install-to-home-screen support for the current browser. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  return { installed, canPrompt: deferred !== null, ios, install };
}

/**
 * "Install app" button. Uses the browser's install prompt where available,
 * otherwise shows how to add the app to the home screen (iPhone and others).
 */
export function InstallAppButton({ appName, className, variant = 'solid' }: { appName: string; className?: string; variant?: 'solid' | 'link' }) {
  const { installed, canPrompt, ios, install } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);
  if (installed) return null;

  const onClick = async () => {
    if (canPrompt) await install();
    else setHelpOpen(true);
  };

  return (
    <>
      {variant === 'link' ? (
        <button type="button" onClick={() => void onClick()} className={cn('inline-flex items-center gap-1.5 hover:underline', className)}>
          <Download className="h-4 w-4" aria-hidden /> Install the app
        </button>
      ) : (
        <Button type="button" onClick={() => void onClick()} icon={<Download className="h-4 w-4" />} className={className}>
          Install the app
        </Button>
      )}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={`Install ${appName}`} size="sm">
        {ios ? (
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</span>
              <span>
                Open this page in <strong>Safari</strong> and tap the <strong>Share</strong> button <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" />.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">2</span>
              <span>
                Choose <strong>Add to Home Screen</strong> <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden />, then tap <strong>Add</strong>.
              </span>
            </li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</span>
              <span>
                Open your browser menu (<strong>⋮</strong> in Chrome, top right).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">2</span>
              <span>
                Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </span>
            </li>
          </ol>
        )}
        <p className="mt-4 text-xs text-muted">{appName} then opens from your home screen like any other app.</p>
      </Modal>
    </>
  );
}
