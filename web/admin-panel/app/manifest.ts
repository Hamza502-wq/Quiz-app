import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

/** Lets the dashboard be installed as an app (served under its base path). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: 'DoorStep Admin',
    short_name: 'DS Admin',
    description: 'DoorStep Zimbabwe operations console.',
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#FF7A00',
    categories: ['business'],
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
