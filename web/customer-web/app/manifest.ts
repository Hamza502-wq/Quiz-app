import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/** Lets customers install the website as an app on their phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DoorStep Zimbabwe',
    short_name: 'DoorStep',
    description: 'Food, groceries, medicine, shopping and parcels delivered to your door.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#FF7A00',
    categories: ['food', 'shopping'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
