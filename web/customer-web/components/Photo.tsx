'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * An image that swaps to `fallback` if it fails to load — including failures
 * that happen before the page becomes interactive.
 */
export function Photo({
  src,
  alt = '',
  className,
  fallback = null,
  onFailed,
}: {
  src: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
  /** Called once if the image can't be shown. */
  onFailed?: () => void;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const img = ref.current;
    // Already finished loading without any pixels (error before hydration).
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  useEffect(() => {
    if (failed) onFailed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
