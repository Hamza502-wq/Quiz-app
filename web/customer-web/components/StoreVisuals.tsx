import { Package, Pill, ShoppingBasket, Star, Store, UtensilsCrossed } from 'lucide-react';
import { cn } from '@doorstep/web-shared';
import { categoryPhoto } from '@/lib/photos';
import { Photo } from './Photo';

const CATEGORY_ICONS: Record<string, typeof Store> = {
  food: UtensilsCrossed,
  groceries: ShoppingBasket,
  pharmacy: Pill,
  parcels: Package,
};

export function CategoryIcon({ slug, className }: { slug: string | undefined; className?: string }) {
  const Icon = (slug && CATEGORY_ICONS[slug]) || Store;
  return <Icon className={className} aria-hidden />;
}

/** Store cover image, or a branded placeholder when the store has none. */
export function StoreCover({
  coverUrl,
  categorySlug,
  className,
  closed,
}: {
  coverUrl: string | null;
  categorySlug?: string;
  className?: string;
  closed?: boolean;
}) {
  // Stores without their own cover show a photo for their category.
  const photo = coverUrl ?? categoryPhoto(categorySlug);
  const placeholder = (
    <div className="flex h-full w-full items-center justify-center">
      <CategoryIcon slug={categorySlug} className="h-12 w-12 text-white/80" />
    </div>
  );
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark', className)}>
      {photo ? (
        <Photo src={photo} className="h-full w-full object-cover" fallback={placeholder} />
      ) : (
        placeholder
      )}
      {closed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">Closed</span>
        </div>
      ) : null}
    </div>
  );
}

export function StoreLogo({ logoUrl, name, className }: { logoUrl: string | null; name: string; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white shadow-md', className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-bold text-brand">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function RatingPill({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs font-medium text-muted">New</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
      <Star className="h-3.5 w-3.5 fill-flag-yellow text-flag-yellow" aria-hidden />
      {avg.toFixed(1)} <span className="font-normal text-muted">({count})</span>
    </span>
  );
}

/** Read-only star row (for reviews). */
export function Stars({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} aria-label={`${score} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-4 w-4', n <= score ? 'fill-flag-yellow text-flag-yellow' : 'text-gray-300')} aria-hidden />
      ))}
    </span>
  );
}

/** Clickable 1–5 star input. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          className="rounded p-0.5"
        >
          <Star className={cn('h-8 w-8 transition-colors', n <= value ? 'fill-flag-yellow text-flag-yellow' : 'text-gray-300 hover:text-flag-yellow')} />
        </button>
      ))}
    </div>
  );
}
