/** Public runtime configuration (inlined at build time by Next.js). */
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;

export const config = {
  /**
   * Base URL of the API. "/" (or "same-origin") means the API is served from
   * this site's own domain, so requests use relative URLs.
   */
  apiUrl: (rawApiUrl === '/' || rawApiUrl === 'same-origin' ? '' : rawApiUrl || 'http://localhost:4000').replace(/\/+$/, ''),
  /** Path this app is served under (e.g. "/vendor"); must match next.config `basePath`. */
  basePath: (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, ''),
  /** Live updates over Socket.IO. When off (serverless hosting) the apps poll the API instead. */
  realtime: process.env.NEXT_PUBLIC_REALTIME !== 'false',
  /** Sign-in with SMS codes. Off until an SMS provider is connected; accounts then use passwords. */
  smsSignIn: process.env.NEXT_PUBLIC_SMS_SIGN_IN !== 'false',
  mapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
  /** Default map centre: Harare CBD. */
  defaultCenter: { lat: -17.8292, lng: 31.0522 },
};

/** Prefixes a file in the app's /public folder with the base path. */
export const publicAsset = (path: string) => `${config.basePath}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Where the other DoorStep apps live (the same domain on Netlify). Set
 * NEXT_PUBLIC_RIDER_URL=none where there is no rider web app (riders then use
 * the phone app) to hide the rider links.
 */
const riderUrl = process.env.NEXT_PUBLIC_RIDER_URL || '/rider/';
export const appLinks = {
  customer: process.env.NEXT_PUBLIC_CUSTOMER_URL || '/',
  vendor: process.env.NEXT_PUBLIC_VENDOR_URL || '/vendor/',
  rider: riderUrl === 'none' ? null : riderUrl,
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || '/admin/',
};
