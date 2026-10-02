'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button, Spinner, uploadImage, type UploadKind } from '@doorstep/web-shared';

/** Uploads an image to the API and reports the resulting public URL (+ thumbnail). */
export function ImageUpload({
  value,
  onChange,
  kind,
  label,
  aspect = 'square',
  required = false,
}: {
  value: string | null;
  onChange: (url: string | null, thumbUrl: string | null) => void;
  kind: UploadKind;
  label: string;
  aspect?: 'square' | 'wide';
  /** Hides "Remove": the image can be replaced but not left empty. */
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await uploadImage(file, kind);
      onChange(res.url, res.thumbUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-canvas text-muted hover:border-brand ${
            aspect === 'wide' ? 'h-20 w-36' : 'h-20 w-20'
          }`}
          aria-label={`Upload ${label}`}
        >
          {busy ? (
            <Spinner />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6" />
          )}
        </button>
        <div className="flex flex-col gap-1">
          <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {value ? 'Change' : 'Upload'}
          </Button>
          {value && !required ? (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(null, null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-alert">{error}</p> : <p className="mt-1 text-xs text-muted">JPEG, PNG or WebP up to 8 MB.</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
