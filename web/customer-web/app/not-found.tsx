import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-muted">The link may be old, or the page has moved.</p>
      <Link href="/" className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
        Browse stores
      </Link>
    </div>
  );
}
