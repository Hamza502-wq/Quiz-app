import { publicAsset } from './config';
import { cn } from './ui';

/** Full DoorStep Zimbabwe logo (served from each app's /public). */
export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={publicAsset('/logo.png')} alt="DoorStep Zimbabwe" className={cn('h-auto', className)} />;
}

/** House-and-door app icon. */
export function AppIcon({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={publicAsset('/icon.png')} alt="" aria-hidden className={cn('h-9 w-9', className)} />;
}

/** Zimbabwe flag stripes — used sparingly as an accent. */
export function FlagStripe({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-1 w-16 flex-col overflow-hidden rounded-full', className)} aria-hidden>
      <span className="flex-1 bg-flag-green" />
      <span className="flex-1 bg-flag-yellow" />
      <span className="flex-1 bg-flag-red" />
    </div>
  );
}
