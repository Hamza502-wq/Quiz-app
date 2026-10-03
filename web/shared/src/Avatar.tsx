'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api, uploadImage } from './api';
import { useAuth } from './auth';
import { Spinner, cn } from './ui';

const SIZES = { xs: 'h-7 w-7 text-[11px]', sm: 'h-9 w-9 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-24 w-24 text-2xl' };

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Round profile photo; shows the person's initials when there is no photo (or it fails to load). */
export function Avatar({
  src,
  name,
  size = 'sm',
  className,
  square = false,
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
  /** Rounded square instead of a circle (store logos). */
  square?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const shape = square ? 'rounded-xl' : 'rounded-full';
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name}` : ''}
        onError={() => setFailed(src)}
        className={cn('shrink-0 bg-canvas object-cover', shape, SIZES[size], className)}
      />
    );
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center bg-brand-light font-semibold text-brand', shape, SIZES[size], className)}
      aria-label={name ?? undefined}
      role={name ? 'img' : undefined}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The signed-in user's profile photo with a "change photo" control. Uploads to
 * the API (kind=avatar) and saves it on the account.
 */
export function ProfilePhotoEditor({
  size = 'xl',
  hint,
  compact = false,
}: {
  size?: keyof typeof SIZES;
  hint?: string;
  /** Sidebar layout: the person's name and phone next to the photo. */
  compact?: boolean;
}) {
  const { user, refreshProfile } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, 'avatar');
      await api('/auth/me', { method: 'PATCH', body: { avatarUrl: uploaded.url } });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your photo');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={cn('flex items-center', compact ? 'gap-3' : 'gap-4')}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-full focus-visible:outline-2"
        aria-label={user?.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
        disabled={busy}
      >
        <Avatar src={user?.avatarUrl} name={user?.name ?? user?.phone} size={size} />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow-sm group-hover:bg-brand-dark',
            compact ? 'h-5 w-5' : 'h-8 w-8',
          )}
        >
          {busy ? (
            <Spinner className={cn('text-white', compact ? 'h-3 w-3' : 'h-4 w-4')} />
          ) : (
            <Camera className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden />
          )}
        </span>
      </button>
      <div className="min-w-0 text-sm">
        {compact ? (
          <>
            <p className="truncate font-semibold text-ink">{user?.name ?? 'Signed in'}</p>
            <p className="truncate text-xs text-muted">{user?.phone}</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-ink">{user?.avatarUrl ? 'Profile photo' : 'Add a profile photo'}</p>
            <p className="text-muted">{hint ?? 'A clear photo of your face helps riders and shops recognise you.'}</p>
          </>
        )}
        {error ? (
          <p className="mt-1 text-alert" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
