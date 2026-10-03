'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchPrivateBlobUrl, isPrivateUpload } from './api';
import { Skeleton, cn } from './ui';

/** Renders an image, fetching private uploads (ID documents, delivery proof) with the access token. */
export function AuthImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isPrivate = Boolean(src && isPrivateUpload(src));

  useEffect(() => {
    if (!src || !isPrivate) return;
    let revoked = false;
    let url: string | null = null;
    setFailed(false);
    fetchPrivateBlobUrl(src)
      .then((u) => {
        url = u;
        if (!revoked) setObjectUrl(u);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, isPrivate]);

  if (!src || failed) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl bg-canvas text-muted', className)}>
        <ImageOff className="h-6 w-6" aria-label={`${alt} unavailable`} />
      </div>
    );
  }
  if (isPrivate && !objectUrl) {
    return <Skeleton className={cn('rounded-xl', className)} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={isPrivate ? objectUrl! : src} alt={alt} className={cn('rounded-xl object-cover', className)} onError={() => setFailed(true)} />;
}
