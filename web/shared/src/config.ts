/** Public runtime configuration (inlined at build time by Next.js). */
export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  mapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
  /** Default map centre: Harare CBD. */
  defaultCenter: { lat: -17.8292, lng: 31.0522 },
};
